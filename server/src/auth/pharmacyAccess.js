// server/src/auth/pharmacyAccess.js
//
// Controls which ADMIN accounts get to see/use the Pharmacy tabs and APIs.
// Only admins whose phone number is listed in PHARMACY_ADMIN_PHONES (.env)
// get Pharmacy access; every other admin sees everything except Pharmacy.
//
// Add/remove numbers by editing .env only — nothing else needs to change.
import "dotenv/config";
import { normalizePhone } from "./sms.service.js";

const PHARMACY_ADMIN_PHONES = (process.env.PHARMACY_ADMIN_PHONES || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean)
  .map(normalizePhone); // normalize so "9964161860" and "919964161860" both match

export function isPharmacyAdmin(phone) {
  if (!phone) return false;
  return PHARMACY_ADMIN_PHONES.includes(normalizePhone(phone));
}
