// server/src/pharmacy/medicine.routes.js
import { Router } from "express";
import {
  requireAuth,
  requireModule,
  restrictPharmacyAdmin,
} from "../auth/auth.middleware.js";
import {
  listMedicines,
  getMedicine,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  addStockEntry,
  getMedicineStats,
} from "./medicine.controller.js";

const router = Router();

router.use(requireAuth);

// Must be registered BEFORE "/:id", otherwise Express treats "stats" as an
// :id value and this route is never reached.
// NOT phone-gated — the Admin Dashboard's summary widgets call this for
// every admin, not just the ones with Pharmacy access.
router.get("/stats", requireModule("PHARMACY"), getMedicineStats);

// Read-only: OPD needs this to show medicine names/stock counts when
// prescribing. Pharmacy obviously needs it too. Also NOT phone-gated — the
// Admin Dashboard's stock-status/top-consumed widgets pull from this list
// for every admin.
router.get("/", requireModule("OPD", "PHARMACY"), listMedicines);
router.get("/:id", requireModule("OPD", "PHARMACY"), getMedicine);

// Mutating routes stay Pharmacy-only AND phone-gated for admins — these are
// the actual "Add/Edit/Delete Medicine" and stock actions behind the
// Pharmacy tabs, restricted to PHARMACY_ADMIN_PHONES.
router.post(
  "/",
  requireModule("PHARMACY"),
  restrictPharmacyAdmin,
  createMedicine,
);
router.put(
  "/:id",
  requireModule("PHARMACY"),
  restrictPharmacyAdmin,
  updateMedicine,
);
router.delete(
  "/:id",
  requireModule("PHARMACY"),
  restrictPharmacyAdmin,
  deleteMedicine,
);
router.post(
  "/:id/stock",
  requireModule("PHARMACY"),
  restrictPharmacyAdmin,
  addStockEntry,
);

export default router;
