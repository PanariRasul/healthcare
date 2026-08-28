// client/src/pages/ipd/IPDPatientForm.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PageHeader,
  FormInput,
  FormSelect,
  FormTextarea,
  SectionCard,
} from "../../components/UI";
import { createPatient, updatePatient, uploadDocument } from "./api/ipd.api";
import {
  User,
  BedDouble,
  CreditCard,
  Trash2,
  Plus,
  Wallet,
  Clock,
} from "lucide-react";

const DOC_TYPES = [
  "Prescription",
  "Lab Report",
  "Scan Report",
  "Hospital Bill",
];

// Helper to auto-calculate days between two dates.
// If end date is missing, it calculates up to TODAY.
const calcDays = (fromStr, toStr) => {
  if (!fromStr) return "";
  const start = new Date(fromStr);
  const end = toStr ? new Date(toStr) : new Date();

  // Strip time for accurate day count
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const diff = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diff > 0 ? diff : 1; // Minimum 1 day for same-day
};

const defaultForm = {
  name: "",
  age: "",
  gender: "",
  phone: "",
  aadhar: "",
  address: "",
  admissionDate: new Date().toISOString().split("T")[0],
  admissionTime: new Date().toTimeString().slice(0, 5),
  deposit: "",
  cash: "",
  upi: "",
  card: "",
  dailyCharges: [
    {
      id: Date.now(),
      fromDate: new Date().toISOString().split("T")[0],
      toDate: "",
      days: "1",
      rate: "",
      amount: 0,
    },
  ],
  medicines: [],
  additionalCharges: [],
  oil: "0",
  protein: "0",
  syrup: "0",
  expectedDays: "",
  dischargeDate: "",
  dischargeTime: "",
  notes: "",
  dischargeStatus: "Admitted",
  followUpDate: "",
  condition: "",
  followUpDesc: "",
  followUpStatus: "Pending",
  reminderEnabled: false,
  reminderStatus: "Not Set",
  reminderSentDate: "",
};

const toDateInput = (d) => (d ? new Date(d).toISOString().split("T")[0] : "");

const daysAdmitted = (admissionDate, dischargeDate) => {
  if (!admissionDate) return 1;
  const start = new Date(admissionDate);
  const end = dischargeDate ? new Date(dischargeDate) : new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 1);
};

export default function IPDPatientForm({ editPatient, onDone }) {
  const [form, setForm] = useState(() => {
    if (!editPatient) return defaultForm;

    return {
      ...editPatient,
      admissionDate: toDateInput(editPatient.admissionDate),
      dischargeDate: toDateInput(editPatient.dischargeDate),
      card: editPatient.card || 0,
      dailyCharges: (editPatient.dailyCharges || []).map((c) => {
        // Auto-update the days/amount on load if they are still admitted (toDate is empty)
        const fromD = toDateInput(c.date);
        const toD = toDateInput(c.toDate);
        const autoDays = calcDays(fromD, toD);

        return {
          ...c,
          fromDate: fromD,
          toDate: toD,
          days: autoDays,
          amount: autoDays * (c.rate || 0),
        };
      }),
      medicines: [],
      additionalCharges: (editPatient.additionalCharges || []).map((c) => ({
        ...c,
        rate: c.rate ?? "",
        amountPaid: c.amountPaid ?? "",
        paymentDate: toDateInput(c.paymentDate),
        paymentStatus: c.paymentStatus || "Pending",
      })),
      followUpDate: toDateInput(editPatient.followUpDate),
      condition: editPatient.condition || "",
      followUpDesc: editPatient.followUpDesc || "",
      followUpStatus: editPatient.followUpStatus || "Pending",
      reminderEnabled: editPatient.reminderEnabled || false,
      reminderStatus: editPatient.reminderStatus || "Not Set",
      reminderSentDate: toDateInput(editPatient.reminderSentDate),
    };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const [pendingDocs, setPendingDocs] = useState([]);

  const set = (field) => (val) => setForm((f) => ({ ...f, [field]: val }));

  const deposit = parseFloat(form.deposit) || 0;
  const cash = parseFloat(form.cash) || 0;
  const upi = parseFloat(form.upi) || 0;
  const card = parseFloat(form.card) || 0;
  const totalPaidAdvances = deposit + cash + upi + card;

  const updateCharge = (i, field, val) => {
    const charges = [...form.dailyCharges];
    charges[i] = { ...charges[i], [field]: val };

    if (field === "fromDate" || field === "toDate") {
      charges[i].days = calcDays(charges[i].fromDate, charges[i].toDate);
    }

    charges[i].amount =
      (parseFloat(charges[i].days) || 0) * (parseFloat(charges[i].rate) || 0);
    setForm((f) => ({ ...f, dailyCharges: charges }));
  };

  const addCharge = () =>
    setForm((f) => ({
      ...f,
      dailyCharges: [
        ...f.dailyCharges,
        {
          id: Date.now(),
          fromDate: new Date().toISOString().split("T")[0],
          toDate: "",
          days: "1",
          rate: "",
          amount: 0,
        },
      ],
    }));

  const removeCharge = (i) =>
    setForm((f) => ({
      ...f,
      dailyCharges: f.dailyCharges.filter((_, idx) => idx !== i),
    }));

  const totalStay = form.dailyCharges.reduce(
    (s, p) => s + (parseFloat(p.amount) || 0),
    0,
  );

  const addAdditionalCharge = () =>
    setForm((f) => ({
      ...f,
      additionalCharges: [
        ...f.additionalCharges,
        {
          id: `temp-${Date.now()}`,
          label: "",
          chargeType: "ONE_TIME",
          rate: "",
          amountPaid: "",
          paymentDate: "",
          paymentStatus: "Pending",
        },
      ],
    }));

  const updateAdditionalCharge = (id, field, val) =>
    setForm((f) => ({
      ...f,
      additionalCharges: f.additionalCharges.map((c) =>
        c.id === id ? { ...c, [field]: val } : c,
      ),
    }));

  const removeAdditionalCharge = (id) =>
    setForm((f) => ({
      ...f,
      additionalCharges: f.additionalCharges.filter((c) => c.id !== id),
    }));

  const admittedDays = daysAdmitted(form.admissionDate, form.dischargeDate);
  const additionalChargeAmount = (c) =>
    c.chargeType === "PER_DAY"
      ? admittedDays * (parseFloat(c.rate) || 0)
      : parseFloat(c.rate) || 0;

  const additionalChargesGross = form.additionalCharges.reduce(
    (s, c) => s + additionalChargeAmount(c),
    0,
  );
  const additionalChargesPaid = form.additionalCharges.reduce(
    (s, c) => s + (parseFloat(c.amountPaid) || 0),
    0,
  );
  const additionalChargesNet = Math.max(
    0,
    additionalChargesGross - additionalChargesPaid,
  );

  const grandGrossTotal = totalStay + additionalChargesGross;
  const totalPaymentsOverall = totalPaidAdvances + additionalChargesPaid;
  const estimatedBalance = grandGrossTotal - totalPaymentsOverall;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      ...form,
      age: parseInt(form.age),
      deposit: parseFloat(form.deposit) || 0,
      cash,
      upi,
      card,
      dailyCharges: form.dailyCharges.map((c) => ({
        date: c.fromDate || new Date().toISOString().split("T")[0],
        toDate: c.toDate || null, // Map the toDate to payload
        days: parseFloat(c.days) || 0,
        rate: parseFloat(c.rate) || 0,
        amount: parseFloat(c.amount) || 0,
      })),
      additionalCharges: form.additionalCharges
        .filter((c) => c.label.trim())
        .map((c) => ({
          label: c.label.trim(),
          chargeType: c.chargeType,
          rate: parseFloat(c.rate) || 0,
          days: c.chargeType === "PER_DAY" ? admittedDays : 0,
          amount: additionalChargeAmount(c),
          amountPaid: parseFloat(c.amountPaid) || 0,
          paymentDate: c.paymentDate || null,
          paymentStatus: c.paymentStatus || "Pending",
        })),
      medicines: [],
    };

    try {
      const saved = editPatient
        ? await updatePatient(editPatient.id, payload)
        : await createPatient(payload);

      if (pendingDocs.length) {
        for (const doc of pendingDocs) {
          await uploadDocument(saved.id, doc.file, doc.type);
        }
      }

      if (onDone) onDone();
      else navigate("/ipd/patients");
    } catch (err) {
      setError(err.message || "Failed to save patient");
    } finally {
      setSaving(false);
    }
  };

  const back = () => (onDone ? onDone() : navigate("/ipd/patients"));

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={editPatient ? "Edit Patient Admission" : "Admit New Patient"}
        subtitle="Complete inpatient registration, room charges, and payment tracking"
      />

      <form onSubmit={handleSubmit} className="space-y-5 max-w-5xl mx-auto">
        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
            {error}
          </div>
        )}

        <SectionCard title="Personal Details" icon={User}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormInput
              label="Patient Name"
              value={form.name}
              onChange={set("name")}
              placeholder="Full name"
              required
            />
            <FormInput
              label="Age"
              type="number"
              value={form.age}
              onChange={set("age")}
              placeholder="Age"
              required
            />
            <FormSelect
              label="Gender"
              value={form.gender}
              onChange={set("gender")}
              options={["Male", "Female", "Other"]}
              required
            />
            <FormInput
              label="Phone Number"
              value={form.phone}
              onChange={set("phone")}
              placeholder="Mobile number"
            />
            <FormInput
              label="Aadhar Number"
              value={form.aadhar}
              onChange={set("aadhar")}
              placeholder="XXXX-XXXX-XXXX"
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <FormTextarea
                label="Address"
                value={form.address}
                onChange={set("address")}
                placeholder="House/Street, Village or Town, District, State, PIN"
                rows={2}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Admission Details" icon={BedDouble}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormInput
              label="Admission Date"
              type="date"
              value={form.admissionDate}
              onChange={set("admissionDate")}
            />
            <FormInput
              label="Admission Time"
              type="time"
              value={form.admissionTime}
              onChange={set("admissionTime")}
            />
            <FormInput
              label="Expected Stay (Days)"
              type="number"
              value={form.expectedDays}
              onChange={set("expectedDays")}
              placeholder="Days"
            />
            {editPatient && editPatient.dischargeStatus !== "Admitted" && (
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  Discharge Status
                </label>
                <div
                  className={`px-3 py-2 rounded-xl text-xs font-extrabold border ${
                    editPatient.status === "Discharged"
                      ? "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  {editPatient.dischargeStatus}
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-1">
                  Use the Discharge action on the patient list to change this.
                </p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <FormInput
              label="Discharge Date"
              type="date"
              value={form.dischargeDate}
              onChange={set("dischargeDate")}
            />
            <FormInput
              label="Discharge Time"
              type="time"
              value={form.dischargeTime}
              onChange={set("dischargeTime")}
            />
          </div>
          <p className="text-[10px] text-slate-400 font-medium mt-2">
            Tip: to actually mark this patient as discharged (and move them into
            Discharged Patients), use the <strong>Discharge</strong> action from
            the patient list — it keeps billing and clinical records untouched.
            The fields above are for correcting a date/time after the fact.
          </p>
        </SectionCard>

        <SectionCard title="Daily / Room Charges" icon={Clock}>
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-medium">
              Specify the date range for each room charge period. The number of
              days will auto-calculate to the current date if the To Date is
              left empty.
            </p>
            {form.dailyCharges.map((c, i) => (
              <div
                key={c.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_80px_1fr_auto_auto] gap-2 items-end bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-3"
              >
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={c.fromDate}
                    onChange={(e) =>
                      updateCharge(i, "fromDate", e.target.value)
                    }
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={c.toDate}
                    onChange={(e) => updateCharge(i, "toDate", e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Days
                  </label>
                  <input
                    type="number"
                    value={c.days}
                    onChange={(e) => updateCharge(i, "days", e.target.value)}
                    placeholder="0"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Rate / Day (₹)
                  </label>
                  <input
                    type="number"
                    value={c.rate}
                    onChange={(e) => updateCharge(i, "rate", e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Amount (Auto)
                  </label>
                  <div className="bg-[#0f4a29]/10 border border-[#0f4a29]/20 rounded-xl px-2.5 py-1.5 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                    ₹{(parseFloat(c.amount) || 0).toLocaleString()}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pb-1.5">
                  {form.dailyCharges.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCharge(i)}
                      className="text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addCharge}
              className="flex items-center gap-1.5 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788]"
            >
              <Plus className="w-3.5 h-3.5" /> Add Another Rate Period
            </button>
            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-bold text-slate-500">
                Room Charges Total:{" "}
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                  ₹{totalStay.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Additional Charges" icon={Wallet}>
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-medium">
              Add a section for anything else billable — Dialysis, Doctor
              Consultation, Lab Tests, Consumables, Procedures, Ambulance,
              Oxygen, ICU, etc. Choose <strong>One-Time</strong> for a flat
              charge, or <strong>Per Day</strong> to auto-multiply by the{" "}
              {admittedDays} day{admittedDays === 1 ? "" : "s"} admitted so far
              (admission → discharge date, or today if still admitted).
            </p>

            {form.additionalCharges.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium py-4 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                No additional charges added yet.
              </p>
            ) : (
              <div className="space-y-4">
                {form.additionalCharges.map((c) => {
                  const isPerDay = c.chargeType === "PER_DAY";
                  const amount = additionalChargeAmount(c);
                  return (
                    <div
                      key={c.id}
                      className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 flex flex-col space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_auto_1fr_1fr_auto] gap-2 items-end">
                        <div>
                          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                            Charge Label
                          </label>
                          <input
                            value={c.label}
                            onChange={(e) =>
                              updateAdditionalCharge(
                                c.id,
                                "label",
                                e.target.value,
                              )
                            }
                            placeholder="e.g. Dialysis Charges"
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                            Type
                          </label>
                          <div className="flex gap-1">
                            {[
                              { v: "ONE_TIME", label: "One-Time" },
                              { v: "PER_DAY", label: "Per Day" },
                            ].map((opt) => (
                              <button
                                key={opt.v}
                                type="button"
                                onClick={() =>
                                  updateAdditionalCharge(
                                    c.id,
                                    "chargeType",
                                    opt.v,
                                  )
                                }
                                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold border transition-all whitespace-nowrap ${
                                  c.chargeType === opt.v
                                    ? "bg-[#0f4a29] text-white border-[#0f4a29]"
                                    : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                            {isPerDay ? "Rate / Day (₹)" : "Amount (₹)"}
                          </label>
                          <input
                            type="number"
                            value={c.rate}
                            onChange={(e) =>
                              updateAdditionalCharge(
                                c.id,
                                "rate",
                                e.target.value,
                              )
                            }
                            placeholder="0.00"
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                            {isPerDay ? `× ${admittedDays} days` : "Total"}
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="bg-[#0f4a29]/10 border border-[#0f4a29]/20 rounded-xl px-2.5 py-1.5 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                              ₹{amount.toLocaleString()}
                            </div>
                            {/* Visual Status Badges */}
                            {c.paymentStatus === "Partial Paid" && (
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded border bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/30">
                                Partial Paid
                              </span>
                            )}
                            {c.paymentStatus === "Paid" && (
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded border bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/30">
                                Paid
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAdditionalCharge(c.id)}
                          className="text-rose-500 pb-1.5 justify-self-end hover:text-rose-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* --- Payment Tracking Row --- */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <div>
                          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                            Amount Paid (₹)
                          </label>
                          <input
                            type="number"
                            value={c.amountPaid}
                            onChange={(e) =>
                              updateAdditionalCharge(
                                c.id,
                                "amountPaid",
                                e.target.value,
                              )
                            }
                            placeholder="0.00"
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                            Payment Date
                          </label>
                          <input
                            type="date"
                            value={c.paymentDate}
                            onChange={(e) =>
                              updateAdditionalCharge(
                                c.id,
                                "paymentDate",
                                e.target.value,
                              )
                            }
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                            Payment Status
                          </label>
                          <select
                            value={c.paymentStatus}
                            onChange={(e) =>
                              updateAdditionalCharge(
                                c.id,
                                "paymentStatus",
                                e.target.value,
                              )
                            }
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Partial Paid">Partial Paid</option>
                            <option value="Paid">Paid</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={addAdditionalCharge}
              className="flex items-center gap-1.5 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788]"
            >
              <Plus className="w-3.5 h-3.5" /> Add Charge Section
            </button>

            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-500">
                <span>
                  Gross Total:{" "}
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                    ₹{additionalChargesGross.toLocaleString()}
                  </span>
                </span>
                {additionalChargesPaid > 0 && (
                  <span>
                    Total Paid:{" "}
                    <span className="text-sm font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                      ₹{additionalChargesPaid.toLocaleString()}
                    </span>
                  </span>
                )}
                <span>
                  Net Due:{" "}
                  <span className="text-sm font-extrabold text-rose-500">
                    ₹{additionalChargesNet.toLocaleString()}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Payment Details" icon={CreditCard}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormInput
              label="Deposit (₹)"
              type="number"
              value={form.deposit}
              onChange={set("deposit")}
              placeholder="0.00"
            />
            <FormInput
              label="Cash (₹)"
              type="number"
              value={form.cash}
              onChange={set("cash")}
              placeholder="0.00"
            />
            <FormInput
              label="UPI (₹)"
              type="number"
              value={form.upi}
              onChange={set("upi")}
              placeholder="0.00"
            />
            <FormInput
              label="Card (₹)"
              type="number"
              value={form.card}
              onChange={set("card")}
              placeholder="0.00"
            />
          </div>

          {/* Master Summary Blocks */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Gross Total Charges
              </div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                ₹{grandGrossTotal.toLocaleString()}
              </div>
              <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                Room: ₹{totalStay.toLocaleString()} | Addtl: ₹
                {additionalChargesGross.toLocaleString()}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Total Amount Paid
              </div>
              <div className="font-extrabold text-sm text-[#0f4a29] dark:text-[#52b788]">
                ₹{totalPaymentsOverall.toLocaleString()}
              </div>
              <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                Advances: ₹{totalPaidAdvances.toLocaleString()} | Addtl Paid: ₹
                {additionalChargesPaid.toLocaleString()}
              </div>
            </div>

            <div
              className={`rounded-2xl p-3 border ${estimatedBalance > 0 ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/30" : "bg-[#0f4a29]/10 border-[#0f4a29]/20"}`}
            >
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Estimated Balance Due
              </div>
              <div
                className={`font-extrabold text-sm ${estimatedBalance > 0 ? "text-rose-600 dark:text-rose-400" : "text-[#0f4a29] dark:text-[#52b788]"}`}
              >
                ₹{estimatedBalance.toLocaleString()}
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="flex gap-2 justify-end pt-3">
          <button
            type="button"
            onClick={back}
            className="text-xs font-bold text-slate-500 px-5 py-2.5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-xs"
          >
            {saving
              ? "Saving..."
              : editPatient
                ? "Update Patient"
                : "Admit Patient"}
          </button>
        </div>
      </form>
    </div>
  );
}
