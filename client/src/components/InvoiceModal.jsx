// client/src/components/InvoiceModal.jsx
//
// Shared "Generate Invoice" modal used by both OPD and IPD screens.
// Usage:
//   <InvoiceModal type="OPD" patient={row} onClose={() => setInvoicing(null)} />
//   <InvoiceModal type="IPD" patient={row} onClose={() => setInvoicing(null)} />
//
// ONE INVOICE PER PATIENT
//   An OPD or IPD patient has exactly one invoice. Opening this modal loads
//   that invoice if it exists, or builds a fresh one from the patient's
//   charges if it doesn't. There is no way to create a second — the
//   "Rebuild from charges" button refills the same invoice rather than
//   starting a new record.
//
// DRAFT -> FINALIZED
//   A saved invoice stays a DRAFT and can be edited as often as needed.
//   "Finalize Invoice" locks it: no further edits, and for IPD it's what
//   allows the patient to be discharged. Finalizing asks for confirmation
//   first and cannot be undone.
//
// REFUND (IPD)
//   The PATIENT RECORD is the source of truth while the invoice is a draft.
//   A refund entered in Patient Details or on the admission edit form is
//   pulled in automatically every time this modal opens — the invoice's own
//   stored copy is only a snapshot and can be older than the patient's.
//   Once finalized, the invoice keeps the figures it was issued with.
//   The refund line only prints when there actually is a refund.
//
// MANUAL INVOICE MODE (OPD only):
//   <InvoiceModal type="OPD" onClose={() => setInvoicing(false)} />
//   Omit `patient` to open a "Create Invoice" flow that isn't tied to a
//   row — pick a registered patient, or type in a walk-in's details (no
//   patient record is created; a synthetic "manual-" id holds the invoice).
//
// PRINTING
//   Fixed 12px type and tight print spacing so a normal bill lands on one
//   A4 page. Meta and patient blocks are forced to a 4-column grid on print
//   — Tailwind's `sm:` breakpoint isn't reliable in a print stylesheet,
//   which is what made those fields wrap into ragged rows.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Plus,
  Trash2,
  Printer,
  Loader2,
  Save,
  Search,
  UserSearch,
  UserPlus2,
  ArrowLeft,
  Lock,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Undo2,
} from "lucide-react";
import { api } from "../lib/api";
import { fetchPatient as fetchIpdPatient } from "../pages/ipd/api/ipd.api";
import { useAuth } from "../context/AuthContext";
import {
  fetchNextInvoiceNumber,
  fetchPatientInvoice,
  createInvoice,
  updateInvoice,
  finalizeInvoice,
} from "../api/invoice.api";
import {
  fmtDate,
  fmtDateTime,
  fmtINR,
  toISODate,
  todayISO,
} from "../lib/dateFormat";
import { buildLineItems } from "../lib/invoiceLines";

// ---------------------------------------------------------------------------
// Clinic letterhead — edit these to match your actual clinic details/logo.
// logoUrl points at client/public/healthcare.jpg, which Vite serves at "/healthcare.jpg".
// ---------------------------------------------------------------------------
const CLINIC = {
  name: "Virupakshipuram Paralysis Centre",
  tagline: "Physiotherapy & Neuro Rehabilitation",
  logoUrl: "/healthcare.jpg",
  gstin: "29ABCDE1234F1Z5",
  footerName: "Virupakshipuram Paralysis Centre",
  footerAddress:
    "No.6, G R Plaza, 24th Main Rd, opp. Empire Restaurant, 5th Phase, Ayodya Nagar, J P Nagar Phase 5, J. P. Nagar, Bengaluru, Karnataka 560078",
};

const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Cheque",
  "Other",
];

const REFUND_METHODS = PAYMENT_METHODS;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

let rowSeq = 0;
const nextRowId = () => `row-${Date.now()}-${rowSeq++}`;

// One label/value cell. Fixed shape means every field in a row lines up on
// the same two baselines, on screen and on paper.
function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wide leading-tight">
        {label}
      </div>
      <div className="font-extrabold leading-tight truncate">
        {value === null || value === undefined || value === "" ? "—" : value}
      </div>
    </div>
  );
}

// Best-guess payment method from existing patient payment fields, just used
// as a sensible default for the dropdown — the user can always change it.
function guessPaymentMethod(data, isIPD) {
  if (isIPD) {
    const amounts = { Cash: data.cash, UPI: data.upi, Card: data.card };
    const top = Object.entries(amounts).sort(
      (a, b) => (b[1] || 0) - (a[1] || 0),
    )[0];
    return top && top[1] > 0 ? top[0] : "Cash";
  }
  if ((data.upi || 0) > (data.cash || 0)) return "UPI";
  return "Cash";
}

let manualSeq = 0;
// Synthetic id for a walk-in/manually-entered patient — never touches the
// Patient table, it's just something to hang the invoice's patientId off.
const nextManualId = () => `manual-${Date.now()}-${manualSeq++}`;

export default function InvoiceModal({ type, patient = null, onClose }) {
  const isIPD = type === "IPD";
  const { user } = useAuth();

  const isManualFlow = !patient;
  const [chosenPatient, setChosenPatient] = useState(patient);

  // ---- Manual-flow setup screen state (only relevant when isManualFlow) ----
  const [setupTab, setSetupTab] = useState("existing"); // "existing" | "manual"
  const [allPatients, setAllPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [manualForm, setManualForm] = useState({
    name: "",
    age: "",
    gender: "",
    phone: "",
    place: "",
    fee: "",
  });
  const [manualFormError, setManualFormError] = useState("");

  useEffect(() => {
    if (!isManualFlow || isIPD) return; // existing-patient search is OPD-only for now
    setPatientsLoading(true);
    api
      .get("/opd/patients")
      .then(({ patients: data }) => setAllPatients(data))
      .catch(() => setAllPatients([]))
      .finally(() => setPatientsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matchingPatients = patientSearch.trim()
    ? allPatients.filter(
        (p) =>
          p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
          (p.serialNumber || "")
            .toLowerCase()
            .includes(patientSearch.toLowerCase()) ||
          (p.phone || "").includes(patientSearch),
      )
    : allPatients;

  const selectExistingPatient = (p) => setChosenPatient({ id: p.id });

  const submitManualPatient = () => {
    setManualFormError("");
    if (!manualForm.name.trim()) {
      setManualFormError("Enter the patient's name to continue.");
      return;
    }
    setChosenPatient({
      __manual: true,
      id: nextManualId(),
      name: manualForm.name.trim(),
      age: manualForm.age ? Number(manualForm.age) : null,
      gender: manualForm.gender || "",
      phone: manualForm.phone || "",
      place: manualForm.place || "",
      fee: manualForm.fee ? Number(manualForm.fee) : 0,
      prescribedMedicines: [],
      followUpDate: null,
      total: 0,
    });
  };

  const backToSetup = () => {
    setChosenPatient(null);
    setFull(null);
    setError("");
    setSavedInvoiceId(null);
    setInvoiceStatus("DRAFT");
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [full, setFull] = useState(null); // full patient record from API

  const [lineItems, setLineItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [gstPercent, setGstPercent] = useState(0);
  const [paid, setPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");

  // --- Refund (IPD) ---
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState("");
  const [refundDate, setRefundDate] = useState("");
  const [refundMethod, setRefundMethod] = useState("Cash");
  // True when the patient record carried a refund the saved invoice hadn't
  // picked up yet — used to tell the user it'll be written on next save.
  const [refundPulled, setRefundPulled] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date());
  const [createdByDisplay, setCreatedByDisplay] = useState(user?.fullName || "");
  const [savedInvoiceId, setSavedInvoiceId] = useState(null);
  const [invoiceStatus, setInvoiceStatus] = useState("DRAFT"); // "DRAFT" | "FINALIZED"
  const [finalizedAt, setFinalizedAt] = useState(null);
  const [finalizedBy, setFinalizedBy] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const isLocked = invoiceStatus === "FINALIZED";

  // Copies the patient record's refund onto the form. The patient is the
  // source of truth for an IPD refund — it can be entered or changed from
  // Patient Details or the admission edit form long after the invoice was
  // first saved, and the invoice's own columns are just a snapshot.
  function applyRefundFromPatient(data) {
    setRefundAmount(data?.refundAmount || 0);
    setRefundReason(data?.refundReason || "");
    setRefundDate(toISODate(data?.refundDate));
    setRefundMethod(data?.refundMethod || "Cash");
  }

  // Pulls a saved invoice into the editable form.
  function applyInvoice(inv) {
    const items = Array.isArray(inv.lineItems) ? inv.lineItems : [];
    setLineItems(
      items.length
        ? items.map((it) => ({ id: nextRowId(), ...it }))
        : [{ id: nextRowId(), description: "", qty: 1, rate: 0 }],
    );
    setDiscount(inv.discount || 0);
    setGstPercent(inv.gstPercent || 0);
    setPaid(inv.paid || 0);
    setPaymentMethod(inv.paymentMethod || "Cash");
    setNotes(inv.notes || "");
    setRefundAmount(inv.refundAmount || 0);
    setRefundReason(inv.refundReason || "");
    setRefundDate(toISODate(inv.refundDate));
    setRefundMethod(inv.refundMethod || "Cash");
    setInvoiceNumber(inv.invoiceNumber);
    setInvoiceDate(inv.createdAt);
    setCreatedByDisplay(inv.createdByName || "—");
    setSavedInvoiceId(inv.id);
    setInvoiceStatus(inv.status || "DRAFT");
    setFinalizedAt(inv.finalizedAt || null);
    setFinalizedBy(inv.finalizedByName || "");
  }

  useEffect(() => {
    // Manual flow: nothing chosen yet — the setup screen is showing.
    if (!chosenPatient?.id) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setRefundPulled(false);
      try {
        const data = chosenPatient.__manual
          ? chosenPatient // walk-in entry — nothing to fetch, use as typed
          : await fetchFullPatient();
        if (cancelled) return;
        setFull(data);

        // One invoice per patient: load the existing one if there is one,
        // otherwise prefill a new draft from the patient's charges.
        const existing = chosenPatient.__manual
          ? null
          : await fetchPatientInvoice(type, chosenPatient.id).catch(() => null);
        if (cancelled) return;

        if (existing) {
          applyInvoice(existing);

          // A draft always reflects the patient's CURRENT refund, even if
          // it was recorded after this invoice was last saved. Without this
          // the modal would keep showing a stale zero.
          if (isIPD && existing.status !== "FINALIZED") {
            const patientRefund = Number(data?.refundAmount) || 0;
            const invoiceRefund = Number(existing.refundAmount) || 0;
            applyRefundFromPatient(data);
            if (patientRefund !== invoiceRefund) setRefundPulled(true);
          }
        } else {
          buildDefaults(data);
          fetchNextInvoiceNumber(type)
            .then((r) => !cancelled && setInvoiceNumber(r.invoiceNumber))
            .catch(() => {});
        }
      } catch (err) {
        if (!cancelled)
          setError(err.message || "Could not load this patient's details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenPatient?.id, type]);

  async function fetchFullPatient() {
    if (isIPD) return fetchIpdPatient(chosenPatient.id);
    const res = await api.get(`/opd/patients/${chosenPatient.id}`);
    return res.patient;
  }

  // Builds the line items from whatever the patient has been charged so far.
  // The line-item rules themselves live in lib/invoiceLines.js so the
  // read-only proforma preview prices a patient identically.
  function buildDefaults(data) {
    const items = buildLineItems(data, type);

    if (isIPD) {
      setPaid(data.totalPaid || 0);
      setPaymentMethod(guessPaymentMethod(data, true));
      // A refund already recorded against the patient carries onto the bill.
      applyRefundFromPatient(data);
    } else {
      setPaid(data.total || 0);
      setPaymentMethod(guessPaymentMethod(data, false));
      setRefundAmount(0);
      setRefundReason("");
      setRefundDate("");
      setRefundMethod("Cash");
    }

    setNotes(
      data.followUpDate ? `Next visit: ${fmtDate(data.followUpDate)}` : "",
    );

    if (items.length === 0) {
      items.push({ id: nextRowId(), description: "", qty: 1, rate: 0 });
    }
    setLineItems(items);
    setDiscount(0);
    setGstPercent(0);
    setInvoiceDate(new Date());
    setCreatedByDisplay(user?.fullName || "");
  }

  // Refills the SAME invoice from the patient's current charges, including
  // the current refund. Useful after adding charges or recording a refund
  // elsewhere. Only offered on a draft.
  async function rebuildFromCharges() {
    setLoading(true);
    setSaveError("");
    setSaveNotice("");
    try {
      const data = chosenPatient.__manual
        ? chosenPatient
        : await fetchFullPatient();
      setFull(data);
      buildDefaults(data);
      setRefundPulled(false);
      setSaveNotice(
        "Line items and refund refilled from this patient's current record. Nothing is saved until you press Save Invoice.",
      );
    } catch (err) {
      setSaveError(err.message || "Could not reload this patient's charges.");
    } finally {
      setLoading(false);
    }
  }

  const updateRow = (id, field, value) => {
    if (isLocked) return;
    setLineItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const addRow = () => {
    if (isLocked) return;
    setLineItems((rows) => [
      ...rows,
      { id: nextRowId(), description: "", qty: 1, rate: 0 },
    ]);
  };

  const removeRow = (id) => {
    if (isLocked) return;
    setLineItems((rows) => rows.filter((r) => r.id !== id));
  };

  // ---- totals -------------------------------------------------------------
  const subtotal = round2(
    lineItems.reduce(
      (s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0),
      0,
    ),
  );
  const discountVal = Number(discount) || 0;
  const taxableBase = Math.max(0, subtotal - discountVal);
  const gstVal = round2((taxableBase * (Number(gstPercent) || 0)) / 100);
  const grandTotal = round2(taxableBase + gstVal);
  const paidVal = Number(paid) || 0;
  const refundVal = Math.max(0, Number(refundAmount) || 0);
  // Money given back raises what's still owed.
  const netPaid = round2(paidVal - refundVal);
  const balance = round2(grandTotal - netPaid);
  const showRefund = refundVal > 0;
  // THE REFUND RULE: a refund is only ever the return of an OVERPAYMENT —
  // the money the patient handed over above the bill. Deposit ₹10,000
  // against a ₹5,000 bill leaves ₹5,000 refundable; paid ₹5,000 against a
  // ₹5,000 bill leaves nothing to refund.
  const refundable = round2(Math.max(0, paidVal - grandTotal));

  // Anything beyond that is the clinic handing back its own money, and it
  // leaves a balance the patient doesn't owe. Blocked on save — nine times
  // out of ten it means the line items are wrong, not the refund.
  const overRefunded = round2(Math.max(0, refundVal - refundable));

  // The bottom line: what is still owed after everything above.
  //   positive -> the patient still owes the clinic
  //   negative -> the clinic is still holding money that isn't theirs
  //   zero     -> nothing moves either way
  // At zero the amount is written out in words rather than as "₹0", which
  // read like a contradiction next to a "Fully Settled" label.
  const balanceLabel = balance < 0 ? "Advance Still Held" : "Balance Due";
  const balanceValue =
    balance === 0 ? "Nothing due" : fmtINR(Math.abs(balance));

  // One sentence under the figures spelling out what happened, so nobody
  // has to reverse-engineer the arithmetic from five separate rows.
  const settlementSentence = (() => {
    const bill = fmtINR(grandTotal);
    const paidTxt = fmtINR(paidVal);
    if (!showRefund) {
      if (balance > 0)
        return `Bill ${bill}. Patient has paid ${paidTxt}, so ${fmtINR(balance)} is still to collect.`;
      if (balance < 0)
        return `Bill ${bill}. Patient has paid ${paidTxt} — ${fmtINR(Math.abs(balance))} more than the bill. Record a refund if that money is going back.`;
      return `Bill ${bill}, paid in full. Neither side owes the other anything.`;
    }
    const refundTxt = fmtINR(refundVal);
    const keptTxt = fmtINR(netPaid);
    if (balance > 0)
      return `Bill ${bill}. Patient paid ${paidTxt} and ${refundTxt} was returned, so the clinic has kept ${keptTxt} — ${fmtINR(balance)} is still to collect.`;
    if (balance < 0)
      return `Bill ${bill}. Patient paid ${paidTxt} and ${refundTxt} was returned, leaving ${keptTxt} held — ${fmtINR(Math.abs(balance))} more than the bill.`;
    return `Bill ${bill}. Patient paid ${paidTxt}, the extra ${refundTxt} was returned, and the ${keptTxt} kept covers the bill exactly. Neither side owes the other anything.`;
  })();

  function buildPayload(includePatient) {
    const base = {
      lineItems: lineItems.map(({ description, qty, rate }) => ({
        description,
        qty: Number(qty) || 0,
        rate: Number(rate) || 0,
        amount: round2((Number(qty) || 0) * (Number(rate) || 0)),
      })),
      subtotal,
      discount: discountVal,
      gstPercent: Number(gstPercent) || 0,
      gstAmount: gstVal,
      grandTotal,
      paid: paidVal,
      balance,
      paymentMethod,
      notes,
      refundAmount: refundVal,
      refundReason: refundVal > 0 ? refundReason : null,
      refundDate: refundVal > 0 ? refundDate || todayISO() : null,
      refundMethod: refundVal > 0 ? refundMethod : null,
    };
    if (!includePatient) return base;
    return {
      ...base,
      patientType: type,
      patientId: full.id,
      patientName: full.name,
      createdById: user?.id || null,
      createdByName: user?.fullName || null,
    };
  }

  // Refuses to save an impossible refund rather than letting the server
  // clamp it silently. Returns true when saving should stop.
  function refundGuard() {
    if (overRefunded <= 0) return false;
    setSaveNotice("");
    setSaveError(
      refundable === 0
        ? `There is nothing to refund. The bill is ${fmtINR(grandTotal)} and the patient has paid ${fmtINR(paidVal)} — a refund only applies when they have paid more than the bill. Set the refund to 0, or correct the line items if the real bill is lower.`
        : `The refund can be at most ${fmtINR(refundable)}. The bill is ${fmtINR(grandTotal)} and the patient has paid ${fmtINR(paidVal)}, so only the ${fmtINR(refundable)} paid above the bill can go back.`,
    );
    return true;
  }

  async function handleSave() {
    if (refundGuard()) return;
    setSaving(true);
    setSaveError("");
    setSaveNotice("");
    try {
      const saved = await createInvoice(buildPayload(true));
      applyInvoice(saved);
      setRefundPulled(false);
      setSaveNotice(
        `Invoice ${saved.invoiceNumber} saved as a draft. Keep editing it as needed, then finalize when the bill is complete.`,
      );
    } catch (err) {
      // The patient already had an invoice — open it instead of failing.
      if (err.status === 409 && err.invoice) {
        applyInvoice(err.invoice);
        setSaveError(err.message);
      } else {
        setSaveError(err.message || "Could not save the invoice.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (refundGuard()) return;
    setSaving(true);
    setSaveError("");
    setSaveNotice("");
    try {
      const updated = await updateInvoice(savedInvoiceId, buildPayload(false));
      setInvoiceDate(updated.createdAt);
      setRefundPulled(false);
      setSaveNotice("Changes saved.");
    } catch (err) {
      if (err.status === 409 && err.invoice) {
        applyInvoice(err.invoice);
        setSaveError(err.message);
      } else {
        setSaveError(err.message || "Could not update the invoice.");
      }
    } finally {
      setSaving(false);
    }
  }

  // Saves any pending edits first, then locks the invoice — so what gets
  // finalized is always exactly what's on screen.
  async function handleFinalize() {
    if (refundGuard()) {
      setConfirmingFinalize(false);
      return;
    }
    setFinalizing(true);
    setSaveError("");
    setSaveNotice("");
    try {
      if (!savedInvoiceId) {
        const saved = await createInvoice(buildPayload(true));
        const locked = await finalizeInvoice(saved.id, {
          finalizedById: user?.id || null,
          finalizedByName: user?.fullName || null,
        });
        applyInvoice(locked);
      } else {
        await updateInvoice(savedInvoiceId, buildPayload(false));
        const locked = await finalizeInvoice(savedInvoiceId, {
          finalizedById: user?.id || null,
          finalizedByName: user?.fullName || null,
        });
        applyInvoice(locked);
      }
      setConfirmingFinalize(false);
      setRefundPulled(false);
      setSaveNotice(
        "Invoice finalized. It's now locked and can be printed or handed to the patient.",
      );
    } catch (err) {
      if (err.status === 409 && err.invoice) applyInvoice(err.invoice);
      setSaveError(err.message || "Could not finalize the invoice.");
      setConfirmingFinalize(false);
    } finally {
      setFinalizing(false);
    }
  }

  const handlePrint = () => window.print();

  const inputCls =
    "w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#0f4a29] print:hidden disabled:opacity-100 disabled:border-transparent disabled:text-slate-900 dark:disabled:text-white";

  return createPortal(
    <div className="invoice-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <style>{`
        @media print {
          @page { margin: 10mm; size: A4 portrait; }

          /* Hide everything on the page except the invoice itself. Using
             display:none (not visibility:hidden) is what matters here —
             visibility:hidden still reserves layout space and is what was
             causing a near-blank second page to print. */
          body > *:not(.invoice-modal-backdrop) {
            display: none !important;
          }

          /* The backdrop is normally position:fixed + flex-centered, which
             also confuses print pagination. Reset it to a plain static
             block so the invoice prints like a normal document. */
          .invoice-modal-backdrop {
            position: static !important;
            background: transparent !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            display: block !important;
          }

          .invoice-print-area {
            position: static !important;
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .no-print { display: none !important; }
          .print-hide { display: none !important; }

          /* 12px throughout with tight leading — the main lever for keeping
             a normal bill on a single A4 page. */
          .invoice-print-area, .invoice-print-area * {
            font-size: 12px !important;
            line-height: 1.3 !important;
            color: #000 !important;
          }
          .invoice-print-area .invoice-clinic-name { font-size: 15px !important; }
          .invoice-print-area .invoice-clinic-tagline { font-size: 11px !important; }
          .invoice-print-area .invoice-badge { display: none !important; }

          .invoice-print-area input,
          .invoice-print-area select,
          .invoice-print-area textarea {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            -webkit-appearance: none;
            appearance: none;
            color: #000 !important;
          }

          .invoice-print-area table { border-collapse: collapse !important; }

          /* Never let a single treatment row split across a page break. */
          .invoice-print-area table tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl invoice-print-area"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10 no-print">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              {isManualFlow && !chosenPatient
                ? "Create Invoice"
                : isLocked
                  ? "Invoice (Finalized)"
                  : savedInvoiceId
                    ? "Edit Invoice"
                    : "Generate Invoice"}
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              {isManualFlow && !chosenPatient
                ? "Pick a registered patient or enter walk-in details"
                : isLocked
                  ? "This bill is locked. Print it or close the window."
                  : `${type} patient — one invoice per patient, editable until you finalize it`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {chosenPatient && !isLocked && (
              <>
                {isManualFlow && (
                  <button
                    onClick={backToSetup}
                    title="Choose a different patient"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-extrabold"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={rebuildFromCharges}
                  title="Refill the line items and refund from this patient's current record"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-extrabold"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Rebuild from charges
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isManualFlow && !chosenPatient ? (
          <div className="p-6 space-y-5">
            {/* Existing vs Walk-in tabs */}
            <div className="flex gap-1.5 p-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-full w-fit">
              {[
                { key: "existing", label: "Existing Patient", icon: UserSearch },
                { key: "manual", label: "New / Walk-in", icon: UserPlus2 },
              ].map((t) => {
                const Icon = t.icon;
                const active = setupTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setSetupTab(t.key)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                      active
                        ? "bg-[#0f4a29] text-white shadow-xs"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>

            {setupTab === "existing" ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Search by name, token no., or phone..."
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full pl-9 pr-4 py-2.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                  />
                </div>
                {patientsLoading ? (
                  <div className="flex items-center justify-center py-10 text-xs font-bold text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin text-[#0f4a29] mr-2" />
                    Loading patients...
                  </div>
                ) : matchingPatients.length === 0 ? (
                  <p className="text-slate-400 text-xs py-10 text-center font-medium">
                    No patients match that search.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl max-h-72 overflow-y-auto">
                    {matchingPatients.slice(0, 50).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectExistingPatient(p)}
                        className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            #{p.serialNumber || "—"}
                            {p.phone ? ` · ${p.phone}` : ""}
                          </p>
                        </div>
                        <span className="text-[10px] font-extrabold text-[#0f4a29] dark:text-[#52b788] shrink-0">
                          Select →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-400 font-medium">
                  For a walk-in who isn't in the OPD directory. These details
                  are only used on this invoice — no patient record is created.
                </p>
                {manualFormError && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
                    {manualFormError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: "name", label: "Patient Name", req: true, ph: "Full name" },
                    { key: "age", label: "Age", type: "number", ph: "Age in years" },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        {f.label}
                        {f.req && <span className="text-rose-500 ml-0.5">*</span>}
                      </label>
                      <input
                        type={f.type || "text"}
                        value={manualForm[f.key]}
                        onChange={(e) =>
                          setManualForm((s) => ({ ...s, [f.key]: e.target.value }))
                        }
                        placeholder={f.ph}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Gender
                    </label>
                    <select
                      value={manualForm.gender}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, gender: e.target.value }))
                      }
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                    >
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {[
                    { key: "phone", label: "Phone", ph: "10-digit mobile" },
                    { key: "place", label: "Place", ph: "City / Town" },
                    {
                      key: "fee",
                      label: "Consultation Fee (₹)",
                      type: "number",
                      ph: "0.00",
                    },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        {f.label}
                      </label>
                      <input
                        type={f.type || "text"}
                        value={manualForm[f.key]}
                        onChange={(e) =>
                          setManualForm((s) => ({ ...s, [f.key]: e.target.value }))
                        }
                        placeholder={f.ph}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={submitManualPatient}
                    className="flex items-center gap-1.5 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-xs"
                  >
                    Continue to Invoice →
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16 text-xs font-bold text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29] mr-2" />
            Loading invoice...
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
              {error}
            </div>
          </div>
        ) : (
          <>
            <div className="p-6 sm:p-8 print:p-0 space-y-5 print:space-y-2.5 text-slate-900 dark:text-white">
              {/* Letterhead */}
              <div className="relative text-center pb-3 print:pb-2 border-b-2 border-[#0f4a29] dark:border-[#52b788]">
                <span className="invoice-badge no-print absolute right-0 top-0 text-[9px] font-extrabold tracking-[0.2em] uppercase text-white bg-[#0f4a29] px-2.5 py-1 rounded-full">
                  Invoice
                </span>
                {CLINIC.logoUrl && (
                  <img
                    src={CLINIC.logoUrl}
                    alt="Clinic logo"
                    className="h-12 print:h-9 mx-auto mb-1.5 print:mb-1 object-contain"
                  />
                )}
                <h1 className="invoice-clinic-name font-extrabold tracking-wide text-base">
                  {CLINIC.name}
                </h1>
                {CLINIC.tagline && (
                  <p className="invoice-clinic-tagline text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                    {CLINIC.tagline}
                  </p>
                )}
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  GSTIN: {CLINIC.gstin}
                </p>
              </div>

              {/* Status strip — screen only, never printed */}
              {isLocked ? (
                <div className="no-print bg-slate-900 dark:bg-slate-800 rounded-2xl px-4 py-3 text-white text-xs font-bold flex items-start gap-2.5">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div>
                      Invoice {invoiceNumber} was finalized on{" "}
                      {fmtDateTime(finalizedAt)}
                      {finalizedBy ? ` by ${finalizedBy}` : ""}.
                    </div>
                    <div className="font-medium text-slate-300">
                      Finalized bills are locked and can't be edited. If a
                      figure is wrong, raise the correction outside this
                      invoice — or ask an administrator to reverse it in the
                      database.
                    </div>
                  </div>
                </div>
              ) : savedInvoiceId ? (
                <div className="no-print bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl px-4 py-3 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div>Draft — invoice {invoiceNumber}</div>
                    <div className="font-medium">
                      Edit and save this as many times as you need. Finalize it
                      once the bill is complete{isIPD ? " — an IPD patient can't be discharged until their invoice is finalized" : ""}.
                    </div>
                  </div>
                </div>
              ) : null}

              {refundPulled && !isLocked && (
                <div className="no-print bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/30 rounded-2xl px-4 py-2 text-sky-700 dark:text-sky-400 text-xs font-bold flex items-start gap-2">
                  <Undo2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Refund of {fmtINR(refundVal)} pulled in from the patient
                    record. Press Save Changes to write it onto the invoice.
                  </span>
                </div>
              )}

              {saveNotice && (
                <div className="no-print bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl px-4 py-2 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                  {saveNotice}
                </div>
              )}
              {saveError && (
                <div className="no-print bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-2 text-rose-600 dark:text-rose-400 text-xs font-bold">
                  {saveError}
                </div>
              )}

              {/* Invoice meta — a real grid, so the four fields sit on the
                  same baselines instead of drifting with flex-wrap. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-x-4 gap-y-2 print:gap-y-1 text-xs font-medium">
                <Field label="Invoice No." value={invoiceNumber} />
                <Field label="Date" value={fmtDate(invoiceDate)} />
                <Field
                  label={`${type} No.`}
                  value={`#${full?.serialNumber || full?.tokenNumber || "—"}`}
                />
                <Field label="Generated By" value={createdByDisplay} />
              </div>

              {/* Patient details. print:grid-cols-4 matters — a print
                  stylesheet doesn't reliably honor the sm: breakpoint, so
                  without it these silently wrap into two ragged rows on
                  paper (Patient/Age, then Gender/Phone). */}
              <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-x-4 gap-y-2 print:gap-y-1 text-xs font-medium border-y border-slate-100 dark:border-slate-800 py-3 print:py-2">
                <Field label="Patient" value={full?.name} />
                <Field
                  label="Age"
                  value={full?.age ? `${full.age} yrs` : "—"}
                />
                <Field label="Gender" value={full?.gender} />
                <Field label="Phone" value={full?.phone} />
              </div>

              {isIPD && (
                <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-x-4 gap-y-2 print:gap-y-1 text-xs font-medium">
                  <Field label="Admitted" value={fmtDate(full?.admissionDate)} />
                  <Field
                    label="Discharged"
                    value={fmtDate(full?.dischargeDate)}
                  />
                  <Field label="Status" value={full?.status} />
                  <Field label="Settlement" value={full?.settlementStatus} />
                </div>
              )}

              {/* Treatment table */}
              <div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-800 dark:border-slate-200 text-left">
                      <th className="py-1.5 print:py-1 pr-2 font-extrabold w-8">
                        Sl.No
                      </th>
                      <th className="py-1.5 print:py-1 px-2 font-extrabold">
                        Treatment
                      </th>
                      <th className="py-1.5 print:py-1 px-2 font-extrabold text-right w-16">
                        Days
                      </th>
                      <th className="py-1.5 print:py-1 px-2 font-extrabold text-right w-24">
                        Price
                      </th>
                      <th className="py-1.5 print:py-1 pl-2 font-extrabold text-right w-28">
                        Amount
                      </th>
                      {!isLocked && <th className="w-8 no-print"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((r, i) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="py-1.5 print:py-1 pr-2 text-slate-400 align-top pt-2.5 print:pt-1">
                          {i + 1}
                        </td>
                        <td className="py-1.5 print:py-1 px-2 align-top pt-2 print:pt-1">
                          {isLocked ? (
                            <span className="block whitespace-pre-wrap break-words text-xs font-medium">
                              {r.description}
                            </span>
                          ) : (
                            <>
                              <input
                                value={r.description}
                                onChange={(e) =>
                                  updateRow(r.id, "description", e.target.value)
                                }
                                placeholder="Treatment / medicine name"
                                className={inputCls}
                              />
                              <span className="hidden print:block whitespace-pre-wrap break-words text-xs font-medium">
                                {r.description}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="py-1.5 print:py-1 px-2 align-top pt-2 print:pt-1 text-right">
                          {isLocked ? (
                            <span className="text-xs font-medium">{r.qty}</span>
                          ) : (
                            <>
                              <input
                                type="number"
                                value={r.qty}
                                onChange={(e) =>
                                  updateRow(r.id, "qty", e.target.value)
                                }
                                className={`${inputCls} text-right`}
                              />
                              <span className="hidden print:block text-right text-xs font-medium">
                                {r.qty}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="py-1.5 print:py-1 px-2 align-top pt-2 print:pt-1 text-right">
                          {isLocked ? (
                            <span className="text-xs font-medium">{r.rate}</span>
                          ) : (
                            <>
                              <input
                                type="number"
                                value={r.rate}
                                onChange={(e) =>
                                  updateRow(r.id, "rate", e.target.value)
                                }
                                className={`${inputCls} text-right`}
                              />
                              <span className="hidden print:block text-right text-xs font-medium">
                                {r.rate}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="py-1.5 print:py-1 pl-2 text-right font-extrabold align-top pt-2.5 print:pt-1">
                          {fmtINR((Number(r.qty) || 0) * (Number(r.rate) || 0))}
                        </td>
                        {!isLocked && (
                          <td className="py-1.5 pl-1 no-print align-top pt-2.5">
                            <button
                              onClick={() => removeRow(r.id)}
                              className="text-slate-300 hover:text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!isLocked && (
                  <button
                    onClick={addRow}
                    className="no-print mt-2 flex items-center gap-1 text-[11px] font-extrabold text-[#0f4a29] dark:text-[#52b788]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Line Item
                  </button>
                )}
              </div>

              {/* Refund entry (IPD, drafts only) — screen only, never printed */}
              {isIPD && !isLocked && (
                <div className="no-print bg-sky-50/70 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                        Refund to Patient
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 max-w-md">
                        Only an overpayment can be refunded. Deposit ₹10,000
                        against a ₹5,000 bill leaves ₹5,000 to return. Right
                        now the bill is {fmtINR(grandTotal)}, the patient has
                        paid {fmtINR(paidVal)}, so{" "}
                        <span className="font-extrabold">
                          {refundable > 0
                            ? `${fmtINR(refundable)} can be refunded`
                            : "there is nothing to refund"}
                        </span>
                        . Loaded from the patient record; leave it at 0 and no
                        refund line prints.
                      </p>
                    </div>
                    {refundable > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRefundAmount(refundable);
                          if (!refundDate) setRefundDate(todayISO());
                        }}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-extrabold"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        Refund {fmtINR(refundable)}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        Refund Amount (₹)
                      </label>
                      <input
                        type="number"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        Refund Date
                      </label>
                      <input
                        type="date"
                        value={refundDate}
                        onChange={(e) => setRefundDate(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
                      {refundDate && (
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                          {fmtDate(refundDate)}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        Paid Back By
                      </label>
                      <select
                        value={refundMethod}
                        onChange={(e) => setRefundMethod(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
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
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        placeholder="e.g. Excess deposit returned"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
                    </div>
                  </div>

                  {overRefunded > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl px-3 py-2.5 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="font-medium">
                        <span className="font-extrabold">
                          {refundable === 0
                            ? "There is nothing to refund."
                            : `The most that can be refunded is ${fmtINR(refundable)}.`}
                        </span>{" "}
                        The bill is {fmtINR(grandTotal)} and the patient has
                        paid {fmtINR(paidVal)}. A refund only returns what
                        they paid above the bill, so giving back{" "}
                        {fmtINR(refundVal)} would leave{" "}
                        {fmtINR(overRefunded)} owed that they don't actually
                        owe. If the real charges are lower than{" "}
                        {fmtINR(grandTotal)}, correct the line items above —
                        don't refund the difference. This invoice can't be
                        saved until the refund is {fmtINR(refundable)} or less.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Settlement summary. Read top to bottom it tells the whole
                  story: what the charges come to, what the patient handed
                  over, what went back to them, and what is left. The old
                  layout listed the same numbers with terse labels
                  ("Grand Total", "Net Paid") and left the reader to work
                  out how they related. */}
              <div className="flex justify-end">
                <div className="w-full sm:w-96 print:w-96 space-y-1 text-xs font-medium bg-slate-50/70 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-2xl print:rounded-none p-3 print:p-2">
                  {/* --- What the treatment comes to --- */}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Charges Subtotal</span>
                    <span className="font-extrabold">{fmtINR(subtotal)}</span>
                  </div>

                  <div
                    className={`flex justify-between items-center ${discountVal === 0 ? "print:hidden print-hide" : ""}`}
                  >
                    <span className="text-slate-500">Discount (₹)</span>
                    {isLocked ? (
                      <span className="font-extrabold">
                        − {fmtINR(discountVal)}
                      </span>
                    ) : (
                      <>
                        <input
                          type="number"
                          value={discount}
                          onChange={(e) => setDiscount(e.target.value)}
                          className={`w-24 ${inputCls} text-right`}
                        />
                        <span className="hidden print:inline-block font-extrabold text-slate-900">
                          − {fmtINR(discountVal)}
                        </span>
                      </>
                    )}
                  </div>

                  <div
                    className={`flex justify-between items-center ${Number(gstPercent) === 0 ? "print:hidden print-hide" : ""}`}
                  >
                    <span className="text-slate-500">GST (%)</span>
                    {isLocked ? (
                      <span className="font-extrabold">{gstPercent}</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          value={gstPercent}
                          onChange={(e) => setGstPercent(e.target.value)}
                          className={`w-24 ${inputCls} text-right`}
                        />
                        <span className="hidden print:inline-block font-extrabold text-slate-900">
                          {gstPercent}
                        </span>
                      </>
                    )}
                  </div>

                  <div
                    className={`flex justify-between ${gstVal === 0 ? "print:hidden print-hide" : ""}`}
                  >
                    <span className="text-slate-500">GST Amount</span>
                    <span className="font-extrabold">{fmtINR(gstVal)}</span>
                  </div>

                  <div className="flex justify-between border-t-2 border-[#0f4a29] dark:border-[#52b788] pt-1 mt-1">
                    <span className="font-extrabold">Total Bill</span>
                    <span className="font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                      {fmtINR(grandTotal)}
                    </span>
                  </div>

                  {/* --- What the patient handed over --- */}
                  <div className="flex justify-between items-center pt-1.5 mt-1.5 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500">
                      Paid by Patient
                      <span className="block text-[9px] text-slate-400 font-medium leading-tight">
                        Deposit + cash + UPI + card
                      </span>
                    </span>
                    {isLocked ? (
                      <span className="font-extrabold">{fmtINR(paidVal)}</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          value={paid}
                          onChange={(e) => setPaid(e.target.value)}
                          className={`w-24 ${inputCls} text-right`}
                        />
                        <span className="hidden print:inline-block font-extrabold text-slate-900">
                          {fmtINR(paidVal)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Refund rows appear only when money actually went back. */}
                  {showRefund && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">
                          Refund Returned to Patient
                          {refundMethod ? ` (${refundMethod})` : ""}
                        </span>
                        <span className="font-extrabold text-sky-700 dark:text-sky-400">
                          − {fmtINR(refundVal)}
                        </span>
                      </div>
                      {(refundDate || refundReason) && (
                        <div className="text-[10px] text-slate-400 font-medium leading-tight">
                          {refundReason ? `Reason: ${refundReason}` : "Refund"}
                          {refundDate ? ` · Returned ${fmtDate(refundDate)}` : ""}
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                        <span className="font-extrabold">
                          Amount Kept Against Bill
                        </span>
                        <span className="font-extrabold">{fmtINR(netPaid)}</span>
                      </div>
                    </>
                  )}

                  {/* --- Where that leaves things --- */}
                  <div className="flex justify-between border-t-2 border-slate-800 dark:border-slate-200 pt-1.5 mt-1.5">
                    <span className="font-extrabold">{balanceLabel}</span>
                    <span
                      className={`font-extrabold ${
                        balance > 0
                          ? "text-rose-500"
                          : "text-[#0f4a29] dark:text-[#52b788]"
                      }`}
                    >
                      {balanceValue}
                    </span>
                  </div>

                  <p className="pt-1.5 mt-1 border-t border-dashed border-slate-200 dark:border-slate-700 text-[10px] leading-snug text-slate-500 dark:text-slate-400 font-medium">
                    {settlementSentence}
                  </p>
                </div>
              </div>

              {/* Payment method + notes — forced to one row on print too */}
              <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-4 gap-y-2 text-xs font-medium border-t border-slate-100 dark:border-slate-800 pt-3 print:pt-2">
                <div className="min-w-0">
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wide leading-tight mb-1 print:mb-0">
                    Payment Method
                  </div>
                  {isLocked ? (
                    <span className="text-xs font-extrabold">{paymentMethod}</span>
                  ) : (
                    <>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className={`${inputCls} py-1.5`}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <span className="hidden print:block text-xs font-extrabold text-slate-900">
                        {paymentMethod}
                      </span>
                    </>
                  )}
                </div>
                <div
                  className={`min-w-0 ${!notes.trim() ? "print:hidden print-hide" : ""}`}
                >
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wide leading-tight mb-1 print:mb-0">
                    Notes
                  </div>
                  {isLocked ? (
                    <span className="text-xs font-extrabold whitespace-pre-wrap break-words">
                      {notes}
                    </span>
                  ) : (
                    <>
                      <input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Next visit date"
                        className={`${inputCls} py-1.5`}
                      />
                      <span className="hidden print:block text-xs font-extrabold text-slate-900 whitespace-pre-wrap break-words">
                        {notes}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Signature */}
              <div className="flex justify-end pt-6 print:pt-4">
                <div className="text-center">
                  <div className="w-40 border-t border-slate-400 dark:border-slate-600 pt-1 text-[11px] font-bold text-slate-500">
                    Authorized Signature
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center border-t border-slate-200 dark:border-slate-800 pt-2">
                <p className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                  {CLINIC.footerName}
                </p>
                <p className="text-[10px] text-slate-400 max-w-xl mx-auto leading-snug">
                  {CLINIC.footerAddress}
                </p>
              </div>

              {/* Actions */}
              <div className="no-print flex flex-wrap justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-full text-xs font-extrabold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                >
                  Close
                </button>

                {!isLocked && (
                  <>
                    <button
                      onClick={savedInvoiceId ? handleUpdate : handleSave}
                      disabled={saving || finalizing}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {saving
                        ? "Saving..."
                        : savedInvoiceId
                          ? "Save Changes"
                          : "Save Invoice"}
                    </button>

                    <button
                      onClick={() => setConfirmingFinalize(true)}
                      disabled={saving || finalizing}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4" /> Finalize Invoice
                    </button>
                  </>
                )}

                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
                >
                  <Printer className="w-4 h-4" /> Print / Save as PDF
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---- Finalize confirmation ---- */}
      {confirmingFinalize && (
        <div className="no-print fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  Finalize invoice {invoiceNumber || ""}?
                </h4>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Read this before you confirm — finalizing can't be undone.
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                <p className="font-extrabold text-slate-900 dark:text-white">
                  What happens when you finalize
                </p>
                <ul className="space-y-1.5 list-disc pl-4">
                  <li>
                    Any unsaved changes on screen are saved first, then the
                    invoice is locked.
                  </li>
                  <li>
                    <span className="font-extrabold">
                      No one can edit it afterwards
                    </span>{" "}
                    — not the line items, totals, discount, GST, payment or
                    refund.
                  </li>
                  <li>
                    The patient still gets only this one invoice. There's no
                    second invoice to issue afterwards.
                  </li>
                  {isIPD && (
                    <li>
                      This is what allows the patient to be discharged. Until
                      it's finalized, discharge is blocked.
                    </li>
                  )}
                  <li>You can print or reprint it as often as you like.</li>
                </ul>
                <p className="pt-1">
                  If a charge is still missing, close this and add it first.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-1.5 text-xs">
                <p className="font-extrabold uppercase tracking-wider text-[10px] text-slate-400">
                  You are locking these figures
                </p>
                <div className="flex justify-between font-medium text-slate-600 dark:text-slate-300">
                  <span>Grand total</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {fmtINR(grandTotal)}
                  </span>
                </div>
                <div className="flex justify-between font-medium text-slate-600 dark:text-slate-300">
                  <span>Paid / advances</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {fmtINR(paidVal)}
                  </span>
                </div>
                {showRefund && (
                  <div className="flex justify-between font-medium text-slate-600 dark:text-slate-300">
                    <span>Refund to patient</span>
                    <span className="font-extrabold text-sky-700 dark:text-sky-400">
                      − {fmtINR(refundVal)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-medium text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-700 pt-1.5 mt-1.5">
                  <span>{balance < 0 ? "Advance held" : "Balance due"}</span>
                  <span
                    className={`font-extrabold ${balance > 0 ? "text-rose-500" : "text-[#0f4a29] dark:text-[#52b788]"}`}
                  >
                    {fmtINR(Math.abs(balance))}
                  </span>
                </div>
              </div>

              {balance > 0 && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {fmtINR(balance)} is still outstanding. You can finalize
                    anyway, but the locked bill will show that balance.
                  </span>
                </div>
              )}
              {refundable > 0 && !showRefund && isIPD && (
                <div className="bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/30 rounded-2xl px-4 py-3 text-sky-700 dark:text-sky-400 text-xs font-bold flex items-start gap-2">
                  <Undo2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    The patient has paid {fmtINR(refundable)} more than this
                    bill. Record the refund before finalizing if that money is
                    going back to them.
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setConfirmingFinalize(false)}
                disabled={finalizing}
                className="px-5 py-2.5 rounded-full text-xs font-extrabold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
              >
                Keep editing
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold px-5 py-2.5 rounded-full shadow-xs disabled:opacity-50"
              >
                {finalizing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                {finalizing ? "Finalizing..." : "Finalize and lock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}