// server/src/pharmacy/category.routes.js
import { Router } from "express";
import {
  requireAuth,
  requireModule,
  restrictPharmacyAdmin,
} from "../auth/auth.middleware.js";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "./category.controller.js";

const router = Router();

// Categories only exist to power the Pharmacy medicine form/filtering —
// nothing outside Pharmacy needs them, so the whole router is phone-gated
// for admins.
router.use(requireAuth, requireModule("PHARMACY"), restrictPharmacyAdmin);

router.get("/", listCategories);
router.post("/", createCategory);
router.put("/:id", updateCategory);
router.delete("/:id", deleteCategory);

export default router;
