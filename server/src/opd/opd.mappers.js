// server/src/opd/opd.mappers.js
// The UI works with friendly display strings ("Male", "Stable", "Not Set").
// Postgres enums need SCREAMING_CASE values. These maps translate at the
// boundary so neither the frontend nor the Prisma schema have to compromise.

const GENDER_TO_DB = { Male: "MALE", Female: "FEMALE", Other: "OTHER" };
const GENDER_FROM_DB = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

const CONDITION_TO_DB = {
  Stable: "STABLE",
  Improving: "IMPROVING",
  Chronic: "CHRONIC",
  Mild: "MILD",
  Good: "GOOD",
  Critical: "CRITICAL",
};
const CONDITION_FROM_DB = Object.fromEntries(
  Object.entries(CONDITION_TO_DB).map(([k, v]) => [v, k])
);

const FOLLOWUP_STATUS_TO_DB = { Pending: "PENDING", Completed: "COMPLETED", Missed: "MISSED" };
const FOLLOWUP_STATUS_FROM_DB = Object.fromEntries(
  Object.entries(FOLLOWUP_STATUS_TO_DB).map(([k, v]) => [v, k])
);

const REMINDER_STATUS_TO_DB = {
  "Not Set": "NOT_SET",
  Pending: "PENDING",
  Sent: "SENT",
  Failed: "FAILED",
};
const REMINDER_STATUS_FROM_DB = Object.fromEntries(
  Object.entries(REMINDER_STATUS_TO_DB).map(([k, v]) => [v, k])
);

function formatToken(tokenNumber) {
  return `OPD-${String(tokenNumber).padStart(3, "0")}`;
}

// Request body (display strings) -> Prisma data (enum values)
export function toDbPatient(body) {
  return {
    name: body.name,
    age: body.age !== undefined && body.age !== "" ? parseInt(body.age, 10) : undefined,
    gender: body.gender ? GENDER_TO_DB[body.gender] : undefined,
    place: body.place || null,
    phone: body.phone || null,
    // Consultation Fee was removed from the registration form — this stays
    // for backward compatibility with existing records, always 0 for new
    // ones unless something else sets it later.
    fee: body.fee !== undefined && body.fee !== "" ? parseFloat(body.fee) : 0,
    cash: body.cash !== undefined && body.cash !== "" ? parseFloat(body.cash) : 0,
    upi: body.upi !== undefined && body.upi !== "" ? parseFloat(body.upi) : 0,
    total:
      (body.cash !== undefined && body.cash !== "" ? parseFloat(body.cash) : 0) +
      (body.upi !== undefined && body.upi !== "" ? parseFloat(body.upi) : 0),
    visitDate: body.visitDate ? new Date(body.visitDate) : undefined,
    notes: body.notes || null,
    followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
    condition: body.condition ? CONDITION_TO_DB[body.condition] : null,
    followUpDesc: body.followUpDesc || null,
    followUpStatus: body.followUpStatus
      ? FOLLOWUP_STATUS_TO_DB[body.followUpStatus]
      : undefined,
    reminderEnabled:
      body.reminderEnabled === true || body.reminderEnabled === "true",
    reminderStatus: body.reminderEnabled
      ? REMINDER_STATUS_TO_DB[body.reminderStatus || "Pending"]
      : "NOT_SET",
    reminderSentDate: body.reminderSentDate ? new Date(body.reminderSentDate) : null,
    diagnosis: body.diagnosis || null,
    prescription: body.prescription || null,
    doctorNotes: body.doctorNotes || null,
  };
}

// Prisma record (enum values) -> API response (display strings), matching
// the exact shape dummyData.js used, so the frontend needs zero changes to
// its rendering logic once wired to real data.
export function fromDbPatient(p) {
  return {
    id: p.id,
    serialNumber: formatToken(p.tokenNumber),
    name: p.name,
    age: p.age,
    gender: GENDER_FROM_DB[p.gender],
    place: p.place || "",
    phone: p.phone || "",
    fee: p.fee,
    cash: p.cash,
    upi: p.upi,
    total: p.total,
    visitDate: p.visitDate ? p.visitDate.toISOString().split("T")[0] : "",
    notes: p.notes || "",
    followUpDate: p.followUpDate ? p.followUpDate.toISOString().split("T")[0] : "",
    condition: p.condition ? CONDITION_FROM_DB[p.condition] : "",
    followUpDesc: p.followUpDesc || "",
    followUpStatus: FOLLOWUP_STATUS_FROM_DB[p.followUpStatus],
    reminderEnabled: p.reminderEnabled,
    reminderStatus: REMINDER_STATUS_FROM_DB[p.reminderStatus],
    reminderSentDate: p.reminderSentDate
      ? p.reminderSentDate.toISOString().split("T")[0]
      : "",
    diagnosis: p.diagnosis || "",
    prescription: p.prescription || "",
    doctorNotes: p.doctorNotes || "",
    prescribedMedicines: (p.prescribedMedicines || []).map((pm) => ({
      id: pm.id,
      medicineId: pm.medicineId,
      drugName: pm.medicine?.drugName || "Unknown",
      // Exposed so the "Generate Invoice" screen can prefill each
      // medicine's price — previously this was dropped here even though
      // the query already joins `medicine`, so invoices always priced
      // prescribed medicines at ₹0.
      sellingPrice: pm.medicine?.sellingPrice || 0,
      quantity: pm.quantity,
      dosageInstructions: pm.dosageInstructions || "",
      createdAt: pm.createdAt,
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}