// src/pages/ipd/api/ipd.api.js
// VITE_API_URL is just the host (e.g. http://localhost:4000) — /api is added here
const HOST = import.meta.env.VITE_API_URL || "http://localhost:4000";
const IPD_URL = `${HOST}/api/ipd`; // matches server.js -> app.use("/api/ipd", ipdRoutes)

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// --- reads ---

export function fetchPatients({ search = "", status = "", page = 1, limit = 7 } = {}) {
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

// --- writes ---

export function createPatient(payload) {
  return fetch(IPD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(handle);
}

export function updatePatient(id, payload) {
  return fetch(`${IPD_URL}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(handle);
}

export function deletePatient(id) {
  return fetch(`${IPD_URL}/${id}`, { method: "DELETE" }).then(handle);
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
  return fetch(`${IPD_URL}/${patientId}/documents/${docId}`, { method: "DELETE" }).then(handle);
}