// server/src/pharmacy/medicine.controller.js
import prisma from "../lib/prisma.js";
import {
  fromDbMedicine,
  toDbStockAction,
  toDbUnitType,
  toDbStockUnit,
  toDbMedicineType,
  computeStockBreakdown,
} from "./pharmacy.mappers.js";
import {
  clearStockReadMarks,
  clearExpiryReadMarks,
} from "../notifications/notifications.service.js";

const MEDICINE_INCLUDE = { category: true, stockHistory: true };

// GET /api/pharmacy/medicines
// Returns the FULL list, unpaginated — same pattern as OPD patients, since
// the dashboard/list/stock-history/expiry pages all filter this client-side.
export async function listMedicines(req, res) {
  try {
    const medicines = await prisma.medicine.findMany({
      include: MEDICINE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return res.status(200).json({ medicines: medicines.map(fromDbMedicine) });
  } catch (err) {
    console.error("List medicines error:", err);
    return res.status(500).json({ message: "Could not fetch medicines." });
  }
}

// GET /api/pharmacy/medicines/:id
export async function getMedicine(req, res) {
  try {
    const medicine = await prisma.medicine.findUnique({
      where: { id: req.params.id },
      include: MEDICINE_INCLUDE,
    });
    if (!medicine)
      return res.status(404).json({ message: "Medicine not found." });
    return res.status(200).json({ medicine: fromDbMedicine(medicine) });
  } catch (err) {
    console.error("Get medicine error:", err);
    return res.status(500).json({ message: "Could not fetch medicine." });
  }
}

// POST /api/pharmacy/medicines
// Everything is optional — a record can be created with just a drug name,
// or even blank. Body may send `category` as the category NAME (not id);
// if it doesn't resolve to a real category, the medicine is simply saved
// without one rather than rejecting the request.
export async function createMedicine(req, res) {
  try {
    const {
      serialNumber,
      drugName,
      genericName,
      category,
      medicineType,
      manufacturer,
      batchNumber,
      purchasePrice,
      sellingPrice,
      quantity,
      reorderLevel,
      purchaseDate,
      expiryDate,
      supplierName,
      notes,
      unitType,
      tabletsPerStrip,
      totalStrips,
    } = req.body;

    let categoryId = null;
    if (category) {
      const categoryRow = await prisma.category.findUnique({
        where: { name: category },
      });
      if (categoryRow) categoryId = categoryRow.id;
      // Unknown category name: silently skip rather than reject, since
      // category is now optional.
    }

    if (serialNumber) {
      const existingSerial = await prisma.medicine.findUnique({
        where: { serialNumber },
      });
      if (existingSerial) {
        return res
          .status(409)
          .json({ message: "This Medicine ID is already in use." });
      }
    }

    // --- Packing information: Strip → Tablet ---
    const tabletsPerStripNum = Math.max(parseInt(tabletsPerStrip, 10) || 0, 0);
    const totalStripsNum = Math.max(parseInt(totalStrips, 10) || 0, 0);
    const totalTabletsNum = totalStripsNum * tabletsPerStripNum;

    // Backward/forward compatible: if the caller didn't send packing info
    // at all, fall back to a flat `quantity` field so nothing breaks.
    const initialQuantity =
      totalTabletsNum > 0 ? totalTabletsNum : parseInt(quantity, 10) || 0;

    const medicine = await prisma.medicine.create({
      data: {
        serialNumber: serialNumber || null,
        drugName: drugName || null,
        genericName: genericName || null,
        categoryId,
        medicineType: toDbMedicineType(medicineType),
        manufacturer: manufacturer || null,
        batchNumber: batchNumber || null,
        purchasePrice: parseFloat(purchasePrice) || 0,
        sellingPrice: parseFloat(sellingPrice) || 0,
        unitType: toDbUnitType(unitType),
        tabletsPerStrip: tabletsPerStripNum,
        totalStrips: totalStripsNum,
        totalTablets: totalTabletsNum,
        quantity: initialQuantity,
        // Permanent record of this batch's starting count. Unlike `quantity`
        // (which Add/Reduce/Adjust Stock and OPD prescriptions change every
        // day), this is set once here and never written to again — so even
        // after quantity hits 0, you can still see how large the batch was.
        initialQuantity,
        reorderLevel: parseInt(reorderLevel, 10) || 0,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        supplierName: supplierName || null,
        notes: notes || null,
        stockHistory: initialQuantity
          ? {
              create: [
                {
                  date: new Date(),
                  action: "ADD",
                  quantity: initialQuantity,
                  reason: "Initial stock entry",
                  unit: totalStripsNum > 0 ? "STRIP" : null,
                  enteredQuantity:
                    totalStripsNum > 0 ? totalStripsNum : initialQuantity,
                },
              ],
            }
          : undefined,
      },
      include: MEDICINE_INCLUDE,
    });

    return res.status(201).json({ medicine: fromDbMedicine(medicine) });
  } catch (err) {
    console.error("Create medicine error:", err);
    return res.status(500).json({ message: "Could not add medicine." });
  }
}

// PUT /api/pharmacy/medicines/:id
// Full edit of drug/pricing/supplier/notes fields. Does NOT touch quantity —
// quantity changes always go through the dedicated stock-action endpoint
// below so every change is logged in StockHistory. If the edit form sends a
// `quantity` field, it's intentionally ignored here.
export async function updateMedicine(req, res) {
  try {
    const existing = await prisma.medicine.findUnique({
      where: { id: req.params.id },
    });
    if (!existing)
      return res.status(404).json({ message: "Medicine not found." });

    const {
      serialNumber,
      drugName,
      genericName,
      category,
      medicineType,
      manufacturer,
      batchNumber,
      purchasePrice,
      sellingPrice,
      reorderLevel,
      purchaseDate,
      expiryDate,
      supplierName,
      notes,
      unitType,
      tabletsPerStrip,
      totalStrips,
    } = req.body;

    const data = {};
    if (serialNumber !== undefined) {
      if (serialNumber && serialNumber !== existing.serialNumber) {
        const dup = await prisma.medicine.findUnique({
          where: { serialNumber },
        });
        if (dup)
          return res
            .status(409)
            .json({ message: "This Medicine ID is already in use." });
      }
      data.serialNumber = serialNumber || null;
    }
    if (drugName !== undefined) data.drugName = drugName || null;
    if (genericName !== undefined) data.genericName = genericName || null;
    if (manufacturer !== undefined) data.manufacturer = manufacturer || null;
    if (batchNumber !== undefined) data.batchNumber = batchNumber || null;
    if (purchasePrice !== undefined)
      data.purchasePrice = parseFloat(purchasePrice) || 0;
    if (sellingPrice !== undefined)
      data.sellingPrice = parseFloat(sellingPrice) || 0;
    if (reorderLevel !== undefined)
      data.reorderLevel = parseInt(reorderLevel, 10) || 0;
    if (purchaseDate !== undefined)
      data.purchaseDate = purchaseDate ? new Date(purchaseDate) : null;
    if (expiryDate !== undefined)
      data.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (supplierName !== undefined) data.supplierName = supplierName || null;
    if (notes !== undefined) data.notes = notes || null;
    if (unitType !== undefined) data.unitType = toDbUnitType(unitType);
    if (medicineType !== undefined)
      data.medicineType = toDbMedicineType(medicineType);

    // Packing config edits (e.g. fixing a typo'd tablets-per-strip) never
    // touch `quantity` — the Strip/Tablet breakdown just recalculates
    // itself from the (unchanged) quantity next time it's read. The
    // totalTablets snapshot is kept consistent here so the "originally
    // purchased" record stays accurate for the new packing numbers.
    const packingChanged =
      tabletsPerStrip !== undefined || totalStrips !== undefined;
    if (packingChanged) {
      const tabletsPerStripNum =
        tabletsPerStrip !== undefined
          ? Math.max(parseInt(tabletsPerStrip, 10) || 0, 0)
          : existing.tabletsPerStrip;
      const totalStripsNum =
        totalStrips !== undefined
          ? Math.max(parseInt(totalStrips, 10) || 0, 0)
          : existing.totalStrips;

      data.tabletsPerStrip = tabletsPerStripNum;
      data.totalStrips = totalStripsNum;
      data.totalTablets = totalStripsNum * tabletsPerStripNum;
    }

    if (category !== undefined) {
      if (!category) {
        data.categoryId = null;
      } else {
        const categoryRow = await prisma.category.findUnique({
          where: { name: category },
        });
        // Unknown category name: leave the medicine's category untouched
        // rather than rejecting the whole update, since category is
        // optional now.
        if (categoryRow) data.categoryId = categoryRow.id;
      }
    }

    const medicine = await prisma.medicine.update({
      where: { id: req.params.id },
      data,
      include: MEDICINE_INCLUDE,
    });

    // Expiry date changed — any previously-dismissed expiry alerts for this
    // medicine may no longer reflect reality, so let them show fresh again.
    if (expiryDate !== undefined) {
      await clearExpiryReadMarks(req.params.id);
    }

    return res.status(200).json({ medicine: fromDbMedicine(medicine) });
  } catch (err) {
    console.error("Update medicine error:", err);
    return res.status(500).json({ message: "Could not update medicine." });
  }
}

// DELETE /api/pharmacy/medicines/:id
export async function deleteMedicine(req, res) {
  try {
    const existing = await prisma.medicine.findUnique({
      where: { id: req.params.id },
    });
    if (!existing)
      return res.status(404).json({ message: "Medicine not found." });

    await prisma.medicine.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Medicine deleted." });
  } catch (err) {
    console.error("Delete medicine error:", err);
    return res.status(500).json({ message: "Could not delete medicine." });
  }
}

// GET /api/pharmacy/medicines/stats  (for the Pharmacy dashboard)
// Computes inventory value using per-TABLET price (purchasePrice/sellingPrice
// ÷ tabletsPerStrip), since quantity is tracked in individual tablets while
// the prices entered are per strip. Falls back to treating the strip price
// as a per-tablet price when tabletsPerStrip isn't set.
export async function getMedicineStats(req, res) {
  try {
    const medicines = await prisma.medicine.findMany({
      include: { category: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    let totalPurchaseValue = 0;
    let totalSellingValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let expiredCount = 0;
    let expiringSoonCount = 0;
    // Sum of each medicine's current Strip/Tablet breakdown. Adding
    // "Strips" across different medicines is a simple headline count (not a
    // unit-normalized total), matching how the dashboard cards present it.
    let totalStrips = 0;
    let totalTablets = 0;

    const lowStockItems = [];
    const expiringSoonItems = [];

    for (const m of medicines) {
      const purchasePrice = m.purchasePrice || 0;
      const sellingPrice = m.sellingPrice || 0;
      const tabletsPerStrip =
        m.tabletsPerStrip && m.tabletsPerStrip > 0 ? m.tabletsPerStrip : 1;
      const purchasePricePerUnit = purchasePrice / tabletsPerStrip;
      const sellingPricePerUnit = sellingPrice / tabletsPerStrip;

      totalPurchaseValue += purchasePricePerUnit * m.quantity;
      totalSellingValue += sellingPricePerUnit * m.quantity;

      const breakdown = computeStockBreakdown(m.quantity, m.tabletsPerStrip);
      totalStrips += breakdown.availableStrips;
      totalTablets += breakdown.availableTablets;

      const reorderLevel = m.reorderLevel || 0;
      if (m.quantity <= 0) {
        outOfStockCount += 1;
      } else if (m.quantity <= reorderLevel) {
        lowStockCount += 1;
        lowStockItems.push({
          id: m.id,
          drugName: m.drugName,
          quantity: m.quantity,
          reorderLevel,
        });
      }

      // Medicines with no expiry date set are skipped from expiry tracking
      // entirely — expiry is optional now.
      if (!m.expiryDate) continue;
      const expiry = new Date(m.expiryDate);
      if (expiry < today) {
        expiredCount += 1;
      } else if (expiry <= thirtyDaysOut) {
        expiringSoonCount += 1;
        expiringSoonItems.push({
          id: m.id,
          drugName: m.drugName,
          expiryDate: expiry.toISOString().split("T")[0],
        });
      }
    }

    const categoryCount = await prisma.category.count();

    return res.status(200).json({
      totalMedicines: medicines.length,
      totalCategories: categoryCount,
      totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
      totalSellingValue: Math.round(totalSellingValue * 100) / 100,
      potentialProfit:
        Math.round((totalSellingValue - totalPurchaseValue) * 100) / 100,
      lowStockCount,
      outOfStockCount,
      expiredCount,
      expiringSoonCount,
      totalStrips,
      totalTablets,
      lowStockItems: lowStockItems.slice(0, 5),
      expiringSoonItems: expiringSoonItems.slice(0, 5),
    });
  } catch (err) {
    console.error("Get medicine stats error:", err);
    return res.status(500).json({ message: "Could not fetch pharmacy stats." });
  }
}
// Body: { action: "Add Stock" | "Reduce Stock" | "Stock Adjustment", quantity, reason }
// Updates the medicine's quantity AND logs a StockHistory row, atomically.
export async function addStockEntry(req, res) {
  try {
    const { action, quantity, reason, unit } = req.body;
    const dbAction = toDbStockAction(action);

    if (!dbAction) {
      return res.status(400).json({
        message:
          "action must be one of: Add Stock, Reduce Stock, Stock Adjustment.",
      });
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      return res
        .status(400)
        .json({ message: "Enter a valid positive quantity." });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "A reason is required." });
    }

    const medicine = await prisma.medicine.findUnique({
      where: { id: req.params.id },
    });
    if (!medicine)
      return res.status(404).json({ message: "Medicine not found." });

    // Defaults to TABLET (i.e. "the number entered IS the tablet count")
    // when no unit is sent, so any older client still calling this endpoint
    // without a `unit` field behaves exactly as it did before this feature.
    const dbUnit = toDbStockUnit(unit) || "TABLET";
    const tabletsPerStrip = medicine.tabletsPerStrip || 1;
    const multiplier = dbUnit === "STRIP" ? tabletsPerStrip : 1;
    // Everything from here on operates in tablets, same as before this
    // feature — only the multiplier used to get there is new.
    const qtyInTablets = qty * multiplier;

    let newQuantity;
    let historyQuantity;
    if (dbAction === "ADD") {
      newQuantity = medicine.quantity + qtyInTablets;
      historyQuantity = qtyInTablets;
    } else if (dbAction === "REDUCE") {
      if (qtyInTablets > medicine.quantity) {
        return res
          .status(400)
          .json({ message: "Cannot reduce more than current stock." });
      }
      newQuantity = medicine.quantity - qtyInTablets;
      historyQuantity = -qtyInTablets;
    } else {
      // ADJUST — quantity typed (converted to tablets) IS the new absolute quantity
      newQuantity = qtyInTablets;
      historyQuantity = qtyInTablets - medicine.quantity;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.medicine.update({
        where: { id: req.params.id },
        data: { quantity: newQuantity },
      });
      await tx.stockHistory.create({
        data: {
          medicineId: req.params.id,
          date: new Date(),
          action: dbAction,
          quantity: historyQuantity,
          reason: reason.trim(),
          unit: dbUnit,
          enteredQuantity: qty,
        },
      });
      return tx.medicine.findUnique({
        where: { id: req.params.id },
        include: MEDICINE_INCLUDE,
      });
    });

    // If this restock resolved the low/out-of-stock condition, clear any
    // previously-dismissed alerts for it — otherwise, once dismissed, the
    // alert would stay silenced forever even if the medicine runs low again
    // after this restock. Only clearing when actually resolved means normal
    // "still low, dismissed once" behavior is untouched.
    if (newQuantity > 0 && newQuantity > updated.reorderLevel) {
      await clearStockReadMarks(req.params.id);
    }

    return res.status(200).json({ medicine: fromDbMedicine(updated) });
  } catch (err) {
    console.error("Add stock entry error:", err);
    return res.status(500).json({ message: "Could not update stock." });
  }
}
