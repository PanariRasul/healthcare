// client/src/api/invoice.api.js
const HOST = import.meta.env.VITE_API_URL || "http://localhost:4000";
const INVOICES_URL = `${HOST}/api/invoices`;

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// Preview only — does not create/reserve anything.
export function fetchNextInvoiceNumber(patientType) {
  return fetch(`${INVOICES_URL}/next/${patientType}`).then(handle);
}

// All invoices ever generated for one patient, newest first.
export function fetchPatientInvoices(patientType, patientId) {
  return fetch(`${INVOICES_URL}/patient/${patientType}/${patientId}`).then(
    handle,
  );
}

export function fetchInvoice(id) {
  return fetch(`${INVOICES_URL}/${id}`).then(handle);
}

export function createInvoice(payload) {
  return fetch(INVOICES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(handle);
}

export function updateInvoice(id, payload) {
  return fetch(`${INVOICES_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(handle);
}
