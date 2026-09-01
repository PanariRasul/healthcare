// client/src/pages/ipd/IPDPatientForm.jsx
//
// DAY COUNTING
//   Per-day bed / treatment charges count BOTH the From and the To date:
//   01/01/2026 → 10/01/2026 is 10 days, not 9. Leaving To Date empty means
//   the period is still running and counts up to today.
//
// MANUAL DAY OVERRIDE
//   Typing a number into the Days box switches that row to manual. The
//   figure is then saved as-is and is NOT recalculated when the form is
//   re-opened — the old behaviour silently overwrote a hand-entered 15 with
//   a freshly-calculated number every time you clicked Edit. Press the
//   "Manual · Auto = N" button on the row to hand it back to the dates.
//
// PAYMENTS RECEIVED
//   A dated list, one row per payment: amount, date, and mode (Cash / UPI /
//   Card / Bank Transfer / Other, where Other takes a free-text name). Press
//   "Add Payment" for each further instalment. These rows are the IPD_Payment
//   ledger — the same records the Payments screen shows — so there is one
//   history of money received rather than two.
//
//   This replaced four flat boxes (Deposit / Cash / UPI / Card) that held one
//   amount per mode and no dates, which meant an invoice could never list
//   deposits by date and a second cash payment overwrote the first.
//
// REFUND
//   Editable right here, in Payment Details. Whatever is saved flows onto
//   the patient's draft invoice automatically, so the refund shows on the
//   bill without opening the invoice screen. The same figure can also be
//   edited from Patient Details → Refund and from the invoice itself —
//   all three write to the same field on the patient.
//
// DATES
//   Every date is typed and displayed as dd/mm/yyyy (see DateField below).
//   The calendar icon opens the native picker for anyone who prefers it.

import { useEffect, useState } from "react";
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
  fmtDate,
  isoToDMY,
  dmyToISO,
  toISODate,
  todayISO,
  inclusiveDays,
  fmtINR,
} from "../../lib/dateFormat";
import {
  User,
  BedDouble,
  CreditCard,
  Trash2,
  Plus,
  Wallet,
  Clock,
  CalendarDays,
  RotateCcw,
  Undo2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// dd/mm/yyyy field. Type the date in directly, or use the calendar icon.
// `value` / `onChange` speak ISO ("2026-01-31") so everything downstream —
// <input type="date">, the API, Prisma — stays unchanged.
// ---------------------------------------------------------------------------
function DateField({ label, value, onChange, disabled = false, hint }) {
  const [text, setText] = useState(isoToDMY(value));

  // Re-sync whenever the row's value changes from the outside (loading an
  // existing patient, the picker, another field's side effect).
  useEffect(() => {
    setText(isoToDMY(value));
  }, [value]);

  const commit = (raw) => {
    const trimmed = (raw || "").trim();
    if (!trimmed) {
      onChange("");
      return;
    }
    const iso = dmyToISO(trimmed);
    if (iso) onChange(iso);
    else setText(isoToDMY(value)); // not a real date — put the old one back
  };

  return (
    <div>
      {label && (
        <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          disabled={disabled}
          placeholder="dd/mm/yyyy"
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(e.currentTarget.value);
            }
          }}
          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-2.5 pr-9 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29] disabled:opacity-60"
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center">
          <CalendarDays className="w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="date"
            aria-label={label ? `${label} (calendar)` : "Pick a date"}
            value={value || ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </span>
      </div>
      {hint && (
        <p className="text-[10px] text-slate-400 font-medium mt-0.5">{hint}</p>
      )}
    </div>
  );
}

const REFUND_METHODS = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Cheque",
  "Other",
];

// Values match the PaymentMethod enum in schema.prisma.
const PAYMENT_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "OTHER", label: "Other" },
];

let paymentSeq = 0;
const newPaymentRow = () => ({
  key: `pay-${Date.now()}-${paymentSeq++}`,
  id: null, // set once saved, so edits update the row instead of replacing it
  amount: "",
  paymentDate: todayISO(),
  method: "CASH",
  methodOther: "",
  referenceNumber: "",
});

const newChargeRow = () => ({
  id: `charge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  fromDate: todayISO(),
  toDate: "",
  days: 1,
  daysManual: false,
  rate: "",
  amount: 0,
});

const defaultForm = {
  name: "",
  age: "",
  gender: "",
  phone: "",
  aadhar: "",
  address: "",
  admissionDate: todayISO(),
  admissionTime: new Date().toTimeString().slice(0, 5),
  payments: [newPaymentRow()],
  refundAmount: "",
  refundReason: "",
  refundDate: "",
  refundMethod: "Cash",
  dailyCharges: [newChargeRow()],
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

export default function IPDPatientForm({ editPatient, onDone }) {
  const [form, setForm] = useState(() => {
    if (!editPatient) return defaultForm;

    return {
      ...editPatient,
      admissionDate: toISODate(editPatient.admissionDate),
      dischargeDate: toISODate(editPatient.dischargeDate),

      // Every payment on this patient's ledger, including any added from
      // the Payments screen — this form owns the whole list.
      payments: (editPatient.payments || []).length
        ? editPatient.payments.map((pm, i) => ({
          key: pm.id || `pay-${i}`,
          id: pm.id || null,
          amount: pm.amount ?? "",
          paymentDate: toISODate(pm.paymentDate),
          method: pm.method || "CASH",
          methodOther: pm.methodOther || "",
          referenceNumber: pm.referenceNumber || "",
        }))
        : [newPaymentRow()],

      refundAmount: editPatient.refundAmount ? String(editPatient.refundAmount) : "",
      refundReason: editPatient.refundReason || "",
      refundDate: toISODate(editPatient.refundDate),
      refundMethod: editPatient.refundMethod || "Cash",

      // Stored values are used EXACTLY as saved. Nothing is recalculated on
      // load, so a hand-entered day count survives every round trip.
      dailyCharges: (editPatient.dailyCharges || []).map((c, i) => ({
        id: c.id || `charge-${i}`,
        fromDate: toISODate(c.date),
        toDate: toISODate(c.toDate),
        days: c.days ?? 1,
        daysManual: c.daysManual === true,
        rate: c.rate ?? "",
        amount: c.amount ?? 0,
      })),

      medicines: [],
      additionalCharges: (editPatient.additionalCharges || []).map((c) => ({
        ...c,
        rate: c.rate ?? "",
        amountPaid: c.amountPaid ?? "",
        paymentDate: toISODate(c.paymentDate),
        paymentStatus: c.paymentStatus || "Pending",
      })),
      followUpDate: toISODate(editPatient.followUpDate),
      condition: editPatient.condition || "",
      followUpDesc: editPatient.followUpDesc || "",
      followUpStatus: editPatient.followUpStatus || "Pending",
      reminderEnabled: editPatient.reminderEnabled || false,
      reminderStatus: editPatient.reminderStatus || "Not Set",
      reminderSentDate: toISODate(editPatient.reminderSentDate),
    };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const [pendingDocs, setPendingDocs] = useState([]);

  const set = (field) => (val) => setForm((f) => ({ ...f, [field]: val }));

  // Everything the patient has handed over, summed from the dated rows.
  const totalPaidAdvances = form.payments.reduce(
    (s, pm) => s + (parseFloat(pm.amount) || 0),
    0,
  );

  const refundAmount = Math.max(0, parseFloat(form.refundAmount) || 0);

  // ---- payments received --------------------------------------------------

  const updatePayment = (key, field, val) =>
    setForm((f) => ({
      ...f,
      payments: f.payments.map((pm) =>
        pm.key === key ? { ...pm, [field]: val } : pm,
      ),
    }));

  const addPayment = () =>
    setForm((f) => ({ ...f, payments: [...f.payments, newPaymentRow()] }));

  const removePayment = (key) =>
    setForm((f) => {
      const rest = f.payments.filter((pm) => pm.key !== key);
      // Never leave the section completely empty — an blank row is clearer
      // than a bare "Add Payment" button with nothing above it.
      return { ...f, payments: rest.length ? rest : [newPaymentRow()] };
    });

  // ---- per-day charges ----------------------------------------------------

  const recalcRow = (row) => ({
    ...row,
    amount: (parseFloat(row.days) || 0) * (parseFloat(row.rate) || 0),
  });

  const updateCharge = (index, field, val) => {
    setForm((f) => {
      const charges = [...f.dailyCharges];
      let row = { ...charges[index], [field]: val };

      if (field === "fromDate" || field === "toDate") {
        // Dates drive the day count, unless this row has been overridden.
        if (!row.daysManual) {
          row.days = inclusiveDays(row.fromDate, row.toDate) || 1;
        }
      }

      if (field === "days") {
        // Typing a day count takes this row off automatic. The number is
        // then stored and reloaded exactly as entered.
        row.daysManual = true;
      }

      charges[index] = recalcRow(row);
      return { ...f, dailyCharges: charges };
    });
  };

  // Hands a row back to the date calculation.
  const resetChargeToAuto = (index) => {
    setForm((f) => {
      const charges = [...f.dailyCharges];
      const row = {
        ...charges[index],
        daysManual: false,
        days: inclusiveDays(charges[index].fromDate, charges[index].toDate) || 1,
      };
      charges[index] = recalcRow(row);
      return { ...f, dailyCharges: charges };
    });
  };

  const addCharge = () =>
    setForm((f) => ({ ...f, dailyCharges: [...f.dailyCharges, newChargeRow()] }));

  const removeCharge = (i) =>
    setForm((f) => ({
      ...f,
      dailyCharges: f.dailyCharges.filter((_, idx) => idx !== i),
    }));

  const totalStay = form.dailyCharges.reduce(
    (s, p) => s + (parseFloat(p.amount) || 0),
    0,
  );

  // ---- additional charges -------------------------------------------------

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

  // Both ends counted, same rule as the per-day charge rows.
  const admittedDays =
    inclusiveDays(form.admissionDate, form.dischargeDate) || 1;

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
  const totalPaymentsOverall =
    totalPaidAdvances + additionalChargesPaid - refundAmount;
  const estimatedBalance = grandGrossTotal - totalPaymentsOverall;

  // THE REFUND RULE: only an overpayment can be refunded — the money the
  // patient handed over above the bill. Deposit ₹10,000 against a ₹5,000
  // bill leaves ₹5,000 to return; paid ₹5,000 against a ₹5,000 bill leaves
  // nothing. Refunding more would leave a balance the patient doesn't owe.
  const totalHandedOver = totalPaidAdvances + additionalChargesPaid;
  const maxRefund =
    Math.round(Math.max(0, totalHandedOver - grandGrossTotal) * 100) / 100;
  // What is still sitting with the clinic after the refund entered above.
  const refundable =
    Math.round(Math.max(0, maxRefund - refundAmount) * 100) / 100;
  const overRefunded =
    Math.round(Math.max(0, refundAmount - maxRefund) * 100) / 100;

  // ---- submit -------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const badRow = form.dailyCharges.findIndex(
      (c) => c.toDate && c.fromDate && c.toDate < c.fromDate,
    );
    if (badRow !== -1) {
      setError(
        `Charge period ${badRow + 1}: the To Date is earlier than the From Date.`,
      );
      return;
    }

    const unnamedOther = form.payments.find(
      (pm) =>
        (parseFloat(pm.amount) || 0) > 0 &&
        pm.method === "OTHER" &&
        !pm.methodOther.trim(),
    );
    if (unnamedOther) {
      setError(
        'One payment is set to "Other" without a mode name. Type what it was — cheque, insurance, and so on.',
      );
      return;
    }

    if (overRefunded > 0) {
      setError(
        maxRefund === 0
          ? `There is nothing to refund. The bill is ${fmtINR(grandGrossTotal)} and the patient has paid ${fmtINR(totalHandedOver)} — a refund only applies when they have paid more than the bill. Set it to 0, or lower the charges if the bill is wrong.`
          : `The refund can be at most ${fmtINR(maxRefund)}. The bill is ${fmtINR(grandGrossTotal)} and the patient has paid ${fmtINR(totalHandedOver)}, so only the ${fmtINR(maxRefund)} paid above the bill can go back.`,
      );
      return;
    }

    setSaving(true);

    const payload = {
      ...form,
      age: parseInt(form.age),
      // Rows with no amount are dropped server-side too, but filtering here
      // keeps the request honest about what is actually being saved.
      payments: form.payments
        .filter((pm) => (parseFloat(pm.amount) || 0) > 0)
        .map((pm) => ({
          id: pm.id || null,
          amount: parseFloat(pm.amount) || 0,
          paymentDate: pm.paymentDate || todayISO(),
          method: pm.method || "CASH",
          methodOther:
            pm.method === "OTHER" ? pm.methodOther.trim() || null : null,
          referenceNumber: pm.referenceNumber.trim() || null,
        })),
      // Sent on every save so the server can mirror it onto the draft
      // invoice. An amount with no date is stamped today server-side.
      refundAmount,
      refundReason: refundAmount > 0 ? form.refundReason.trim() || null : null,
      refundDate: refundAmount > 0 ? form.refundDate || todayISO() : null,
      refundMethod: refundAmount > 0 ? form.refundMethod || "Cash" : null,
      dailyCharges: form.dailyCharges.map((c) => ({
        date: c.fromDate || form.admissionDate || todayISO(),
        toDate: c.toDate || null,
        days: parseFloat(c.days) || 0,
        daysManual: !!c.daysManual,
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
      setError(err.message || "Could not save this patient.");
    } finally {
      setSaving(false);
    }
  };

  const back = () => (onDone ? onDone() : navigate("/ipd/patients"));

  const fieldCls =
    "w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]";

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={editPatient ? "Edit Patient Admission" : "Admit New Patient"}
        subtitle="Complete inpatient registration, room charges, and payment tracking"
      />

      <form onSubmit={handleSubmit} className="space-y-5 mx-auto">
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
            <DateField
              label="Admission Date"
              value={form.admissionDate}
              onChange={set("admissionDate")}
            />
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Admission Time
              </label>
              <input
                type="time"
                value={form.admissionTime}
                onChange={(e) => set("admissionTime")(e.target.value)}
                className={fieldCls}
              />
            </div>
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
                  className={`px-3 py-2 rounded-xl text-xs font-extrabold border ${editPatient.status === "Discharged"
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
            <DateField
              label="Discharge Date"
              value={form.dischargeDate}
              onChange={set("dischargeDate")}
            />
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Discharge Time
              </label>
              <input
                type="time"
                value={form.dischargeTime}
                onChange={(e) => set("dischargeTime")(e.target.value)}
                className={fieldCls}
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-medium mt-2">
            To actually mark this patient as discharged, use the{" "}
            <strong>Discharge</strong> action from the patient list — it checks
            that the invoice has been finalized first, and leaves billing and
            clinical records untouched. The fields above are for correcting a
            date or time after the fact.
          </p>
        </SectionCard>

        <SectionCard
          title="Per Day Bed Charges / Per Day Treatment Charges"
          icon={Clock}
        >
          <div className="space-y-3">
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl px-3.5 py-2.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Both the From and the To date are counted, so{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  01/01/2026 to 10/01/2026 is 10 days
                </strong>
                . Leave To Date blank while the period is still running and it
                counts up to today. Type your own figure into Days to override
                the calculation — it stays exactly as you typed it, including
                after you save and come back.
              </p>
            </div>

            {form.dailyCharges.map((c, i) => {
              const autoDays = inclusiveDays(c.fromDate, c.toDate);
              const overridden = !!c.daysManual;
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_110px_1fr_auto_auto] gap-2 items-start bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-3"
                >
                  <DateField
                    label="From Date"
                    value={c.fromDate}
                    onChange={(v) => updateCharge(i, "fromDate", v)}
                  />
                  <DateField
                    label="To Date"
                    value={c.toDate}
                    onChange={(v) => updateCharge(i, "toDate", v)}
                    hint={c.toDate ? undefined : "Blank = still running"}
                  />

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Days
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={c.days}
                      onChange={(e) => updateCharge(i, "days", e.target.value)}
                      placeholder="0"
                      className={`w-full bg-white dark:bg-slate-800 border rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29] ${overridden
                        ? "border-amber-300 dark:border-amber-700"
                        : "border-slate-200 dark:border-slate-700"
                        }`}
                    />
                    {overridden ? (
                      <button
                        type="button"
                        onClick={() => resetChargeToAuto(i)}
                        title={`Recalculate from the dates (${autoDays} days)`}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-600 hover:text-amber-700"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Manual · Auto = {autoDays}
                      </button>
                    ) : (
                      <p className="text-[10px] text-slate-400 font-medium mt-1">
                        From the dates
                      </p>
                    )}
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
                      className={fieldCls}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Amount
                    </label>
                    <div className="bg-[#0f4a29]/10 border border-[#0f4a29]/20 rounded-xl px-2.5 py-1.5 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] whitespace-nowrap">
                      {fmtINR(c.amount)}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-5">
                    {form.dailyCharges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCharge(i)}
                        title="Remove this period"
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

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
                  {fmtINR(totalStay)}
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
              charge, or <strong>Per Day</strong> to multiply by the{" "}
              {admittedDays} day{admittedDays === 1 ? "" : "s"} admitted so far
              (admission → discharge date, or today if still admitted — both
              ends counted).
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
                              updateAdditionalCharge(c.id, "label", e.target.value)
                            }
                            placeholder="e.g. Dialysis Charges"
                            className={fieldCls}
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
                                  updateAdditionalCharge(c.id, "chargeType", opt.v)
                                }
                                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold border transition-all whitespace-nowrap ${c.chargeType === opt.v
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
                              updateAdditionalCharge(c.id, "rate", e.target.value)
                            }
                            placeholder="0.00"
                            className={fieldCls}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                            {isPerDay ? `× ${admittedDays} days` : "Total"}
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="bg-[#0f4a29]/10 border border-[#0f4a29]/20 rounded-xl px-2.5 py-1.5 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] whitespace-nowrap">
                              {fmtINR(amount)}
                            </div>
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

                      {/* --- Payment tracking --- */}
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
                            className={fieldCls}
                          />
                        </div>
                        <DateField
                          label="Payment Date"
                          value={c.paymentDate}
                          onChange={(v) =>
                            updateAdditionalCharge(c.id, "paymentDate", v)
                          }
                        />
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
                            className={fieldCls}
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
                    {fmtINR(additionalChargesGross)}
                  </span>
                </span>
                {additionalChargesPaid > 0 && (
                  <span>
                    Total Paid:{" "}
                    <span className="text-sm font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                      {fmtINR(additionalChargesPaid)}
                    </span>
                  </span>
                )}
                <span>
                  Net Due:{" "}
                  <span className="text-sm font-extrabold text-rose-500">
                    {fmtINR(additionalChargesNet)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Payments Received" icon={CreditCard}>
          <div className="space-y-3">
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl px-3.5 py-2.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                One row per payment, in the order the money came in. Each has
                its own date and mode, so the invoice can list deposits by
                date and the refund is measured against the real total. Press{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  Add Payment
                </strong>{" "}
                for each further instalment. These are the same records the
                Payments screen shows.
              </p>
            </div>

            {form.payments.map((pm, i) => {
              const isOther = pm.method === "OTHER";
              return (
                <div
                  key={pm.key}
                  className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Payment {i + 1}
                      {pm.id ? "" : " · new"}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePayment(pm.key)}
                      title="Remove this payment"
                      className="text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        Amount (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={pm.amount}
                        onChange={(e) =>
                          updatePayment(pm.key, "amount", e.target.value)
                        }
                        placeholder="0.00"
                        className={fieldCls}
                      />
                    </div>

                    <DateField
                      label="Date of Payment"
                      value={pm.paymentDate}
                      onChange={(v) => updatePayment(pm.key, "paymentDate", v)}
                    />

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        Mode of Payment
                      </label>
                      <select
                        value={pm.method}
                        onChange={(e) =>
                          updatePayment(pm.key, "method", e.target.value)
                        }
                        className={fieldCls}
                      >
                        {PAYMENT_MODES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        {isOther ? "Which mode?" : "Reference No."}
                      </label>
                      {isOther ? (
                        <input
                          value={pm.methodOther}
                          onChange={(e) =>
                            updatePayment(pm.key, "methodOther", e.target.value)
                          }
                          placeholder="e.g. Cheque, Insurance"
                          className={fieldCls}
                        />
                      ) : (
                        <input
                          value={pm.referenceNumber}
                          onChange={(e) =>
                            updatePayment(
                              pm.key,
                              "referenceNumber",
                              e.target.value,
                            )
                          }
                          placeholder="Txn / receipt no. (optional)"
                          className={fieldCls}
                        />
                      )}
                    </div>
                  </div>

                  {isOther && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="lg:col-start-4">
                        <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                          Reference No.
                        </label>
                        <input
                          value={pm.referenceNumber}
                          onChange={(e) =>
                            updatePayment(
                              pm.key,
                              "referenceNumber",
                              e.target.value,
                            )
                          }
                          placeholder="Cheque / receipt no. (optional)"
                          className={fieldCls}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={addPayment}
                className="flex items-center gap-1.5 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788]"
              >
                <Plus className="w-3.5 h-3.5" /> Add Payment
              </button>
              <div className="text-xs font-bold text-slate-500">
                Total Received:{" "}
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {fmtINR(totalPaidAdvances)}
                </span>
              </div>
            </div>
          </div>

          {/* --- Refund: editable here, flows onto the draft invoice --- */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="bg-sky-50/70 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Undo2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                      Refund to Patient
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 max-w-xl">
                      Only an overpayment can be refunded — a ₹10,000 deposit
                      against a ₹5,000 bill leaves ₹5,000 to return. Right now
                      the bill is {fmtINR(grandGrossTotal)} and the payments
                      above total {fmtINR(totalHandedOver)}, so{" "}
                      <span className="font-extrabold">
                        {maxRefund > 0
                          ? `${fmtINR(maxRefund)} can be refunded`
                          : "there is nothing to refund"}
                      </span>
                      . Saving here also updates the draft invoice. Leave it at
                      0 and no refund line appears anywhere.
                    </p>
                  </div>
                </div>
                {refundable > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        refundAmount: String(maxRefund),
                        refundDate: f.refundDate || todayISO(),
                      }));
                    }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-extrabold"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Refund {fmtINR(refundable)}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Refund Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.refundAmount}
                    onChange={(e) => set("refundAmount")(e.target.value)}
                    placeholder="0.00"
                    className={fieldCls}
                  />
                </div>
                <DateField
                  label="Refund Date"
                  value={form.refundDate}
                  onChange={set("refundDate")}
                  hint={
                    refundAmount > 0 && !form.refundDate
                      ? "Blank = today"
                      : undefined
                  }
                />
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Paid Back By
                  </label>
                  <select
                    value={form.refundMethod}
                    onChange={(e) => set("refundMethod")(e.target.value)}
                    className={fieldCls}
                  >
                    {REFUND_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Reason
                  </label>
                  <input
                    value={form.refundReason}
                    onChange={(e) => set("refundReason")(e.target.value)}
                    placeholder="e.g. Excess deposit returned"
                    className={fieldCls}
                  />
                </div>
              </div>

              {overRefunded > 0 && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl px-3 py-2.5 text-rose-600 dark:text-rose-400 text-[11px] font-medium">
                  <span className="font-extrabold">
                    {maxRefund === 0
                      ? "There is nothing to refund."
                      : `The most that can be refunded is ${fmtINR(maxRefund)}.`}
                  </span>{" "}
                  The bill is {fmtINR(grandGrossTotal)} and the patient has paid{" "}
                  {fmtINR(totalHandedOver)}. Returning {fmtINR(refundAmount)}{" "}
                  would leave {fmtINR(overRefunded)} showing as pending that
                  they don't owe. Lower the charges instead if the bill is
                  wrong.
                </div>
              )}

              {editPatient?.refundAmount > 0 && (
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Currently recorded: {fmtINR(editPatient.refundAmount)}
                  {editPatient.refundDate
                    ? ` on ${fmtDate(editPatient.refundDate)}`
                    : ""}
                  . Set the amount to 0 to remove it.
                </p>
              )}
            </div>
          </div>

          {/* Master summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Gross Total Charges
              </div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                {fmtINR(grandGrossTotal)}
              </div>
              <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                Room: {fmtINR(totalStay)} | Addtl:{" "}
                {fmtINR(additionalChargesGross)}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Net Amount Paid
              </div>
              <div className="font-extrabold text-sm text-[#0f4a29] dark:text-[#52b788]">
                {fmtINR(totalPaymentsOverall)}
              </div>
              <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                {form.payments.filter((pm) => (parseFloat(pm.amount) || 0) > 0)
                  .length || 0}{" "}
                payment
                {form.payments.filter((pm) => (parseFloat(pm.amount) || 0) > 0)
                  .length === 1
                  ? ""
                  : "s"}
                : {fmtINR(totalPaidAdvances)} | Addtl Paid:{" "}
                {fmtINR(additionalChargesPaid)}
                {refundAmount > 0 ? ` | Refunded: −${fmtINR(refundAmount)}` : ""}
              </div>
            </div>

            <div
              className={`rounded-2xl p-3 border ${estimatedBalance > 0
                ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/30"
                : "bg-[#0f4a29]/10 border-[#0f4a29]/20"
                }`}
            >
              <div className="text-[10px] font-bold uppercase text-slate-400">
                {estimatedBalance < 0 ? "Advance Held" : "Estimated Balance Due"}
              </div>
              <div
                className={`font-extrabold text-sm ${estimatedBalance > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-[#0f4a29] dark:text-[#52b788]"
                  }`}
              >
                {fmtINR(Math.abs(estimatedBalance))}
              </div>
              {estimatedBalance < 0 && (
                <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                  Record a refund above if this money is going back.
                </div>
              )}
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
            className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-xs disabled:opacity-60"
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