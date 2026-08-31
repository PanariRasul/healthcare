// client/src/pages/ipd/api/ipd.api.js
// VITE_API_URL is just the host (e.g. http://localhost:4000) — /api is added here
const HOST = import.meta.env.VITE_API_URL || "http://localhost:4000";
const IPD_URL = `${HOST}/api/ipd`; // matches index.js -> app.use("/api/ipd", ipdRoutes)

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `Request failed (${res.status})`);
    err.status = res.status;
    // dischargePatient answers 409 with a code ("NO_INVOICE" /
    // "INVOICE_NOT_FINALIZED") when the bill isn't locked yet — the
    // Discharge dialog reads this to show the right instructions.
    err.code = body.code || null;
    err.invoiceId = body.invoiceId || null;
    throw err;
  }
  return res.json();
}

const json = (method) => (url, payload) =>
  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(handle);

// --- reads ---

export function fetchPatients({
  search = "",
  status = "",
  page = 1,
  limit = 7,
} = {}) {
  const params = new URLSearchParams({ search, status, page, limit });
  return fetch(`${IPD_URL}?${params}`).then(handle); // -> { data, total, page, totalPages }
}

export function fetchPatient(id) {
  return fetch(`${IPD_URL}/${id}`).then(handle);
}

export function fetchIpdStats() {
  return fetch(`${IPD_URL}/stats`).then(handle);
}

// Anyone with a follow-up date set, soonest first (mirrors OPD's followups endpoint)
export function fetchFollowUps() {
  return fetch(`${IPD_URL}/followups`).then(handle); // -> { patients }
}

// -> { ready, reason, message, invoice }
// Whether this patient's invoice is finalized, and what's still missing if
// it isn't. The Discharge dialog calls this on open.
export function fetchDischargeReadiness(id) {
  return fetch(`${IPD_URL}/${id}/discharge-readiness`).then(handle);
}

// --- writes ---

export function createPatient(payload) {
  return json("POST")(IPD_URL, payload);
}

export function updatePatient(id, payload) {
  return json("PUT")(`${IPD_URL}/${id}`, payload);
}

export function deletePatient(id) {
  return fetch(`${IPD_URL}/${id}`, { method: "DELETE" }).then(handle);
}

// Narrow "quick action" discharge-status update — see dischargePatient() in
// ipd.controller.js. payload: { dischargeStatus: "Admitted" | "Ready For
// Discharge" | "Discharged", dischargeDate?, dischargeTime? }
//
// Rejects with a 409 (err.code = "NO_INVOICE" | "INVOICE_NOT_FINALIZED")
// when the patient's bill hasn't been finalized yet.
export function dischargePatient(id, payload) {
  return json("PATCH")(`${IPD_URL}/${id}/discharge`, payload);
}

// Records money handed back to the patient and mirrors it onto their
// draft invoice. payload: { refundAmount, refundReason?, refundDate?,
// refundMethod? } -> { patient, invoice }
export function setRefund(id, payload) {
  return json("PATCH")(`${IPD_URL}/${id}/refund`, payload);
}

// --- documents ---

export function uploadDocument(patientId, file, type) {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  return fetch(`${IPD_URL}/${patientId}/documents`, {
    method: "POST",
    body: form,
  }).then(handle);
}

export function deleteDocument(patientId, docId) {
  return fetch(`${IPD_URL}/${patientId}/documents/${docId}`, {
    method: "DELETE",
  }).then(handle);
}