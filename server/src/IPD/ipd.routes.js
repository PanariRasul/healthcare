// server/src/routes/ipd.routes.js
import { Router } from "express";
import {
  listPatients,
  listFollowUps,
  getPatient,
  getStats,
  createPatient,
  updatePatient,
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

router.post("/:id/documents", uploadIpdDocument.single("file"), uploadDocument);
router.delete("/:id/documents/:docId", deleteDocument);

export default router;