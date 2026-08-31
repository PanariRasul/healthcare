// server/src/IPD/ipd.routes.js
import { Router } from "express";
import {
  listPatients,
  listFollowUps,
  getPatient,
  getStats,
  createPatient,
  updatePatient,
  dischargePatient,
  getDischargeReadiness,
  setRefund,
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

// Tells the Discharge dialog whether the patient's invoice is finalized,
// and what to do about it if not.
router.get("/:id/discharge-readiness", getDischargeReadiness);

// Narrow "quick action" endpoint for the Discharge tab — see
// dischargePatient() in the controller for why this is kept separate from
// the full PUT /:id update. Rejects a discharge while the patient's
// invoice is missing or still a draft.
router.patch("/:id/discharge", dischargePatient);

// Records money refunded to the patient and mirrors it onto their invoice.
router.patch("/:id/refund", setRefund);

router.post("/:id/documents", uploadIpdDocument.single("file"), uploadDocument);
router.delete("/:id/documents/:docId", deleteDocument);

export default router;