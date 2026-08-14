// server/src/routes/ipd.routes.js
import { Router } from "express";
import {
  listPatients,
  listFollowUps,
  getPatient,
  getStats,
  createPatient,
  updatePatient,
  dischargePatient,
  deletePatient,
  uploadDocument,
  deleteDocument,
} from "./ipd.controller.js";
import { uploadIpdDocument } from "../middleware/upload.js";

const router = Router();

// Stats and Followups must be registered before "/:id" so they aren't
// swallowed by the param route (Express would treat "stats"/"followups"
// as an :id value otherwise).
router.get("/stats", getStats);
router.get("/followups", listFollowUps);

router.get("/", listPatients);
router.get("/:id", getPatient);
router.post("/", createPatient);
router.put("/:id", updatePatient);
router.delete("/:id", deletePatient);

// Narrow "quick action" endpoint for the Discharge tab — see
// dischargePatient() in the controller for why this is kept separate from
// the full PUT /:id update.
router.patch("/:id/discharge", dischargePatient);

router.post("/:id/documents", uploadIpdDocument.single("file"), uploadDocument);
router.delete("/:id/documents/:docId", deleteDocument);

export default router;