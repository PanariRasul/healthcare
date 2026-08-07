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
// three — see schema.prisma's MedicineType enum comment.
const MEDICINE_TYPE_FROM_DB = {
  GENERIC: "Generic Medicine",
  AYURVEDIC: "Ayurvedic Medicine",
  SURGICAL: "Surgery Related Item",
};
const MEDICINE_TYPE_TO_DB = Object.fromEntries(
  Object.entries(MEDICINE_TYPE_FROM_DB).map(([db, label]) => [label, db]),
);

export function toDbMedicineType(displayType) {
  return MEDICINE_TYPE_TO_DB[displayType] || "GENERIC";
}
export function fromDbMedicineType(dbType) {
  return MEDICINE_TYPE_FROM_DB[dbType] || "Generic Medicine";
}

const STOCK_UNIT_FROM_DB = { BOX: "Box", SHEET: "Sheet", TABLET: "Tablet" };
const STOCK_UNIT_TO_DB = { Box: "BOX", Sheet: "SHEET", Tablet: "TABLET" };

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

// Breaks a tablet-equivalent quantity down into Boxes/Sheets/Tablets using
// this medicine's packing configuration. Always computed live from
// `quantity` — never stored — so the breakdown can never drift out of sync
// no matter which module (Pharmacy stock update, OPD prescription
// deduction, IPD dispensing) is the one that actually changed `quantity`.
export function computeStockBreakdown(quantity, tabletsPerSheet, sheetsPerBox) {
  const tps = tabletsPerSheet && tabletsPerSheet > 0 ? tabletsPerSheet : 1;
  const spb = sheetsPerBox && sheetsPerBox > 0 ? sheetsPerBox : 1;
  const qty = Math.max(quantity || 0, 0);

  const totalFullSheets = Math.floor(qty / tps);
  const availableTablets = qty % tps;
  const availableBoxes = Math.floor(totalFullSheets / spb);
  const availableSheets = totalFullSheets % spb;

  return { availableBoxes, availableSheets, availableTablets };
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

// medicine here is a Prisma result with `category` included (relation object)
// and `stockHistory` included (array), most-recent-last like the old dummy data.
export function fromDbMedicine(medicine) {
  const tabletsPerSheet = medicine.tabletsPerSheet || 1;
  const sheetsPerBox = medicine.sheetsPerBox || 1;
  const tabletsPerBox = tabletsPerSheet * sheetsPerBox;
  const breakdown = computeStockBreakdown(
    medicine.quantity,
    tabletsPerSheet,
    sheetsPerBox,
  );

  return {
    id: medicine.id,
    serialNumber: medicine.serialNumber,
    drugName: medicine.drugName,
    genericName: medicine.genericName || "",
    category: medicine.category?.name || "",
    medicineType: fromDbMedicineType(medicine.medicineType),
    manufacturer: medicine.manufacturer || "",
    batchNumber: medicine.batchNumber,
    purchasePrice: medicine.purchasePrice,
    sellingPrice: medicine.sellingPrice,
    unitsPerPack: medicine.unitsPerPack,
    quantity: medicine.quantity,
    initialQuantity: medicine.initialQuantity,
    reorderLevel: medicine.reorderLevel,
    expiryDate: formatDate(medicine.expiryDate),
    supplierName: medicine.supplierName || "",
    notes: medicine.notes || "",

    // --- Packing information (Box → Sheet → Tablet) ---
    unitType: fromDbUnitType(medicine.unitType),
    sheetsPerBox,
    tabletsPerSheet,
    boxesPurchased: medicine.boxesPurchased || 0,
    totalSheets: medicine.totalSheets || 0,
    totalTablets: medicine.totalTablets || 0,
    // Current stock, broken into Boxes/Sheets/Tablets. Derived live from
    // `quantity` on every read (see computeStockBreakdown above) — this is
    // both "current stock" and "available stock" since this system has no
    // separate stock-reservation concept.
    availableBoxes: breakdown.availableBoxes,
    availableSheets: breakdown.availableSheets,
    availableTablets: breakdown.availableTablets,
    // Purchase/selling price entered on the form are PER BOX. Derived
    // per-sheet/per-tablet prices, ready for future billing screens.
    purchasePricePerSheet: sheetsPerBox
      ? medicine.purchasePrice / sheetsPerBox
      : medicine.purchasePrice,
    purchasePricePerTablet: tabletsPerBox
      ? medicine.purchasePrice / tabletsPerBox
      : medicine.purchasePrice,
    sellingPricePerSheet: sheetsPerBox
      ? medicine.sellingPrice / sheetsPerBox
      : medicine.sellingPrice,
    sellingPricePerTablet: tabletsPerBox
      ? medicine.sellingPrice / tabletsPerBox
      : medicine.sellingPrice,

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
