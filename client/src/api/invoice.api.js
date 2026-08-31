// client/src/api/invoice.api.js
const HOST = import.meta.env.VITE_API_URL || "http://localhost:4000";
const INVOICES_URL = `${HOST}/api/invoices`;

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `Request failed (${res.status})`);
    err.status = res.status;
    // createInvoice returns 409 + the existing invoice when a patient
    // already has one; finalizeInvoice does the same when it's already
    // locked. Callers use this to open that invoice instead of erroring.
    err.invoice = body.invoice || null;
    err.code = body.code || null;
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

// Preview only — does not create/reserve anything.
export function fetchNextInvoiceNumber(patientType) {
  return fetch(`${INVOICES_URL}/next/${patientType}`).then(handle);
}

// The ONE invoice belonging to an OPD/IPD patient, or null if they don't
// have one yet. This is the call the Generate Invoice screen, the proforma
// preview and the discharge check all start from.
export function fetchPatientInvoice(patientType, patientId) {
  return fetch(`${INVOICES_URL}/single/${patientType}/${patientId}`)
    .then(handle)
    .then((r) => r.invoice || null);
}

// All invoices ever generated for one patient, newest first. Still used by
// Pharmacy, where a patient can have many.
export function fetchPatientInvoices(patientType, patientId) {
  return fetch(`${INVOICES_URL}/patient/${patientType}/${patientId}`).then(
    handle,
  );
}

// Every invoice of one type (e.g. all "PHARMACY" invoices), newest first —
// not scoped to a single patient. Used by the Pharmacy Billing list page.
// `search` (optional) matches invoice number or patient name.
export function fetchInvoicesByType(patientType, search = "") {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return fetch(`${INVOICES_URL}/type/${patientType}${qs}`).then(handle);
}

export function fetchInvoice(id) {
  return fetch(`${INVOICES_URL}/${id}`).then(handle);
}

export function createInvoice(payload) {
  return json("POST")(INVOICES_URL, payload);
}

export function updateInvoice(id, payload) {
  return json("PUT")(`${INVOICES_URL}/${id}`, payload);
}

// Locks the invoice for good. After this it can't be edited, and an IPD
// patient becomes dischargeable. There is no un-finalize call.
export function finalizeInvoice(id, payload = {}) {
  return json("PATCH")(`${INVOICES_URL}/${id}/finalize`, payload);
}

// Marks some/all quantities on a PHARMACY invoice as returned by the patient
// and adds those tablets back to stock. `payload` = { items: [{ index,
// returnQty }], notes? }.
export function markInvoiceReturn(id, payload) {
  return json("PATCH")(`${INVOICES_URL}/${id}/return`, payload);
}