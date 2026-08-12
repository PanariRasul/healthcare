// server/src/pharmacy/pharmacy.mappers.js
// Same idea as opd.mappers.js: the UI works with friendly display strings,
// Postgres enums need SCREAMING_CASE. Translate at the boundary.

const STOCK_ACTION_TO_DB = {
  "Add Stock": "ADD",
  "Reduce Stock": "REDUCE",
  "Stock Adjustment": "ADJUST",
};
const STOCK_ACTION_FROM_DB = {
  ADD: "Add Stock",
  REDUCE: "Reduce Stock",
  ADJUST: "Stock Adjustment",
};

const UNIT_TYPE_FROM_DB = {
  TABLET: "Tablet",
  CAPSULE: "Capsule",
  SYRUP: "Syrup",
  INJECTION: "Injection",
  OINTMENT: "Ointment",
  DROPS: "Drops",
  POWDER: "Powder",
  OTHER: "Other",
};
const UNIT_TYPE_TO_DB = Object.fromEntries(
  Object.entries(UNIT_TYPE_FROM_DB).map(([db, label]) => [label, db]),
);

// Broad classification, separate from the free-text Category. Fixed set of
// three — see schema.prisma's MedicineType enum comment. DB values are
// unchanged (GENERIC / SURGICAL); only the display labels were renamed.
const MEDICINE_TYPE_FROM_DB = {
  GENERIC: "General Medicine",
  AYURVEDIC: "Ayurvedic Medicine",
  SURGICAL: "Surgical Medicine",
};
const MEDICINE_TYPE_TO_DB = Object.fromEntries(
  Object.entries(MEDICINE_TYPE_FROM_DB).map(([db, label]) => [label, db]),
);

export function toDbMedicineType(displayType) {
  return MEDICINE_TYPE_TO_DB[displayType] || "GENERIC";
}
export function fromDbMedicineType(dbType) {
  return MEDICINE_TYPE_FROM_DB[dbType] || "General Medicine";
}

// Packing hierarchy: previously Box → Sheet → Tablet, now just
// Strip → Tablet.
const STOCK_UNIT_FROM_DB = { STRIP: "Strip", TABLET: "Tablet" };
const STOCK_UNIT_TO_DB = { Strip: "STRIP", Tablet: "TABLET" };

export function toDbUnitType(displayUnitType) {
  return UNIT_TYPE_TO_DB[displayUnitType] || "TABLET";
}
export function fromDbUnitType(dbUnitType) {
  return UNIT_TYPE_FROM_DB[dbUnitType] || "Tablet";
}
// Returns null (not "Tablet") when no unit was given, so callers can tell
// "not recorded" (old stock-history rows) apart from "explicitly Tablet".
export function toDbStockUnit(displayStockUnit) {
  return STOCK_UNIT_TO_DB[displayStockUnit] || null;
}
export function fromDbStockUnit(dbStockUnit) {
  return dbStockUnit ? STOCK_UNIT_FROM_DB[dbStockUnit] || dbStockUnit : null;
}

// Breaks a tablet-equivalent quantity down into Strips/Tablets using this
// medicine's packing configuration. Always computed live from `quantity` —
// never stored — so the breakdown can never drift out of sync no matter
// which module (Pharmacy stock update, OPD prescription deduction, IPD
// dispensing) is the one that actually changed `quantity`. If
// tabletsPerStrip isn't set (0/null — e.g. this medicine was added without
// packing info), everything is reported as loose tablets.
export function computeStockBreakdown(quantity, tabletsPerStrip) {
  const tps = tabletsPerStrip && tabletsPerStrip > 0 ? tabletsPerStrip : 0;
  const qty = Math.max(quantity || 0, 0);

  if (!tps) {
    return { availableStrips: 0, availableTablets: qty };
  }

  const availableStrips = Math.floor(qty / tps);
  const availableTablets = qty % tps;

  return { availableStrips, availableTablets };
}

function formatDate(d) {
  return d ? new Date(d).toISOString().split("T")[0] : "";
}

export function fromDbStockHistory(h) {
  return {
    id: h.id,
    date: formatDate(h.date),
    action: STOCK_ACTION_FROM_DB[h.action] || h.action,
    quantity: h.quantity,
    reason: h.reason,
    // Original unit + amount the user actually typed (e.g. "5 Boxes").
    // Both null for rows created before this feature existed — the
    // frontend falls back to displaying the raw `quantity` in that case.
    unit: fromDbStockUnit(h.unit),
    enteredQuantity: h.enteredQuantity ?? null,
  };
}

// medicine here is a Prisma result with `category` included (relation object,
// possibly null now that category is optional) and `stockHistory` included
// (array), most-recent-last like the old dummy data.
export function fromDbMedicine(medicine) {
  const tabletsPerStrip = medicine.tabletsPerStrip || 0;
  const purchasePrice = medicine.purchasePrice || 0;
  const sellingPrice = medicine.sellingPrice || 0;
  const breakdown = computeStockBreakdown(medicine.quantity, tabletsPerStrip);

  return {
    id: medicine.id,
    serialNumber: medicine.serialNumber || "",
    drugName: medicine.drugName || "",
    genericName: medicine.genericName || "",
    category: medicine.category?.name || "",
    medicineType: fromDbMedicineType(medicine.medicineType),
    manufacturer: medicine.manufacturer || "",
    batchNumber: medicine.batchNumber || "",
    // Per strip.
    purchasePrice,
    sellingPrice,
    quantity: medicine.quantity,
    initialQuantity: medicine.initialQuantity,
    reorderLevel: medicine.reorderLevel || 0,
    purchaseDate: formatDate(medicine.purchaseDate),
    expiryDate: formatDate(medicine.expiryDate),
    supplierName: medicine.supplierName || "",
    notes: medicine.notes || "",

    // --- Packing information (Strip → Tablet) ---
    unitType: fromDbUnitType(medicine.unitType),
    tabletsPerStrip,
    totalStrips: medicine.totalStrips || 0,
    totalTablets: medicine.totalTablets || 0,
    // Current stock, broken into Strips/Tablets. Derived live from
    // `quantity` on every read (see computeStockBreakdown above) — this is
    // both "current stock" and "available stock" since this system has no
    // separate stock-reservation concept.
    availableStrips: breakdown.availableStrips,
    availableTablets: breakdown.availableTablets,
    // Purchase/selling price entered on the form are PER STRIP. Derived
    // per-tablet price (auto-calculated), ready for billing screens.
    purchasePricePerTablet: tabletsPerStrip
      ? purchasePrice / tabletsPerStrip
      : purchasePrice,
    sellingPricePerTablet: tabletsPerStrip
      ? sellingPrice / tabletsPerStrip
      : sellingPrice,

    stockHistory: (medicine.stockHistory || [])
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(fromDbStockHistory),
    createdAt: medicine.createdAt,
    updatedAt: medicine.updatedAt,
  };
}

export function toDbStockAction(displayAction) {
  return STOCK_ACTION_TO_DB[displayAction] || null;
}
