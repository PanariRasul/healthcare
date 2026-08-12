// server/src/auth/sms.service.js
//
// OTP-based login has been removed, so this file no longer sends any SMS.
// It's kept around purely for normalizePhone(), which is still used
// throughout auth (findUserByPhone, pharmacyAccess.js) to match phone
// numbers that may be stored with or without the "91" country-code prefix.

// Convert to 91XXXXXXXXXX format.
export function normalizePhone(rawPhone) {
  const digits = String(rawPhone || "").replace(/\D/g, "");

  if (digits.length === 10) {
    return `91${digits}`;
  }

  return digits;
}
