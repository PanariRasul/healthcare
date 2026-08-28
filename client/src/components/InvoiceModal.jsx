// client/src/components/InvoiceModal.jsx
//
// Shared "Generate Invoice" modal used by both OPD and IPD screens.
// Usage:
//   <InvoiceModal type="OPD" patient={row} onClose={() => setInvoicing(null)} />
//   <InvoiceModal type="IPD" patient={row} onClose={() => setInvoicing(null)} />
//
// `patient` only needs to contain `id` — the modal fetches full details
// (daily charges / medicines / prescriptions) itself, and loads/saves
// invoice history via /api/invoices (see server/src/Invoice + client/src/api/invoice.api.js).
//
// MANUAL INVOICE MODE (OPD only, currently):
//   <InvoiceModal type="OPD" onClose={() => setInvoicing(false)} />
//   Omit `patient` entirely to open a "Create Invoice" flow that isn't tied
//   to a specific row. The modal first shows a setup screen where staff
//   picks either:
//     - "Existing Patient" — search & select a real registered OPD patient
//       (behaves exactly like the normal per-patient flow from there on), or
//     - "New / Walk-in" — type patient details in by hand. Nothing is saved
//       to the Patient table; a synthetic local id (prefixed "manual-") is
//       used purely so the invoice has a patientId to store against.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Plus,
  Trash2,
  Printer,
  Loader2,
  Save,
  History,
  Search,
  UserSearch,
  UserPlus2,
  ArrowLeft,
} from "lucide-react";
import { api } from "../lib/api";
import { fetchPatient as fetchIpdPatient } from "../pages/ipd/api/ipd.api";
import { useAuth } from "../context/AuthContext";
import {
  fetchNextInvoiceNumber,
  fetchPatientInvoices,
  createInvoice,
  updateInvoice,
} from "../api/invoice.api";

// ---------------------------------------------------------------------------
// Clinic letterhead — edit these to match your actual clinic details/logo.
// logoUrl points at client/public/healthcare.jpg, which Vite serves at "/healthcare.jpg".
// ---------------------------------------------------------------------------
const CLINIC = {
  name: "Virupakshipuram Paralysis Centre",
  tagline: "Physiotherapy & Neuro Rehabilitation",
  logoUrl: "/healthcare.jpg",
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

const fmtINR = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

let rowSeq = 0;
const nextRowId = () => `row-${Date.now()}-${rowSeq++}`;

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

  // If the caller didn't pass a specific `patient`, this is the "Create
  // Invoice" manual-entry flow — show a setup screen first (pick existing
  // patient vs. type one in) instead of immediately fetching a patient.
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
      setManualFormError("Patient name is required.");
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

  // Lets staff back out of an in-progress manual/existing pick and return to
  // the setup screen — e.g. wrong patient selected, or wants to switch tabs.
  const backToSetup = () => {
    setChosenPatient(null);
    setFull(null);
    setError("");
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

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date());
  const [createdByDisplay, setCreatedByDisplay] = useState(
    user?.fullName || "",
  );
  const [savedInvoiceId, setSavedInvoiceId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    // Manual flow: nothing chosen yet — the setup screen is showing, don't
    // try to load/fetch anything until staff picks or enters a patient.
    if (!chosenPatient?.id) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = chosenPatient.__manual
          ? chosenPatient // walk-in entry — nothing to fetch, use as typed
          : await fetchFullPatient();
        if (cancelled) return;
        setFull(data);
        buildDefaults(data);

        // Preview the next invoice number (not reserved until actually saved)
        fetchNextInvoiceNumber(type)
          .then((r) => !cancelled && setInvoiceNumber(r.invoiceNumber))
          .catch(() => {});
      } catch (err) {
        if (!cancelled)
          setError(err.message || "Failed to load patient details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    if (chosenPatient.__manual) {
      // Walk-in entries use a fresh synthetic id every time, so there's
      // never any prior invoice history to show.
      setHistory([]);
      setHistoryLoading(false);
    } else {
      loadHistory();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenPatient?.id, type]);

  // Always hits the server for the current patient record — used both on
  // mount and by "New Invoice", so a fresh invoice never reuses a stale
  // snapshot from earlier in the same modal session.
  async function fetchFullPatient() {
    if (isIPD) return fetchIpdPatient(chosenPatient.id);
    const res = await api.get(`/opd/patients/${chosenPatient.id}`);
    return res.patient;
  }

  function loadHistory() {
    setHistoryLoading(true);
    fetchPatientInvoices(type, chosenPatient.id)
      .then((invs) => setHistory(invs))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }

  function buildDefaults(data) {
    const items = [];

    if (isIPD) {
      (data.dailyCharges || []).forEach((c) => {
        items.push({
          id: nextRowId(),
          description: `Per Day Bed / Treatment Charges ${c.date ? ` — ${fmtDate(c.date)}` : ""}`,
          qty: c.days || 1,
          rate: c.rate || 0,
        });
      });

      // --- Updated Additional Charges Logic ---
      (data.additionalCharges || []).forEach((c) => {
        const isPerDay = c.chargeType === "PER_DAY";
        const grossAmount = isPerDay
          ? (c.days || 1) * (c.rate || 0)
          : c.rate || 0;
        const paidAmt = parseFloat(c.amountPaid) || 0;
        const pendingAmt = Math.max(0, grossAmount - paidAmt);
        const dateStr = c.paymentDate ? fmtDate(c.paymentDate) : "";

        let baseDesc = isPerDay
          ? `${c.label} (${c.days || 1} day${(c.days || 1) === 1 ? "" : "s"} × ₹${c.rate || 0})`
          : c.label;

        // Fully Paid logic (shows the line, but bills 0 to not inflate Grand Total)
        if (
          c.paymentStatus === "Paid" ||
          (paidAmt >= grossAmount && grossAmount > 0)
        ) {
          items.push({
            id: nextRowId(),
            description: `${baseDesc} - Fully Paid ₹${paidAmt}${dateStr && dateStr !== "—" ? ` on ${dateStr}` : ""}`,
            qty: 1,
            rate: 0,
          });
        }
        // Partially Paid logic (shows the line, but ONLY bills the pending balance)
        else if (
          (c.paymentStatus === "Partial Paid" || paidAmt > 0) &&
          pendingAmt > 0
        ) {
          items.push({
            id: nextRowId(),
            description: `${baseDesc} - Partial Paid ₹${paidAmt}${dateStr && dateStr !== "—" ? ` on ${dateStr}` : ""} (Pending Balance)`,
            qty: 1,
            rate: pendingAmt,
          });
        }
        // Pending logic (bills normally)
        else {
          items.push({
            id: nextRowId(),
            description: baseDesc,
            qty: isPerDay ? c.days || 1 : 1,
            rate: c.rate || 0,
          });
        }
      });

      (data.medicines || []).forEach((m) => {
        items.push({
          id: nextRowId(),
          description: `${m.name}${m.dosage ? ` (${m.dosage})` : ""}`,
          qty: m.quantity || 1,
          rate: m.medicine?.sellingPrice || 0,
        });
      });

      setPaid(data.totalPaid || 0);
      setPaymentMethod(guessPaymentMethod(data, true));
      setNotes(
        data.followUpDate ? `Next visit: ${fmtDate(data.followUpDate)}` : "",
      );
    } else {
      if (data.fee) {
        items.push({
          id: nextRowId(),
          description: "OPD Consultation Fee",
          qty: 1,
          rate: data.fee,
        });
      }
      (data.prescribedMedicines || []).forEach((pm) => {
        items.push({
          id: nextRowId(),
          description: `${pm.drugName}${pm.dosageInstructions ? ` (${pm.dosageInstructions})` : ""}`,
          qty: pm.quantity || 1,
          rate: pm.sellingPrice || 0,
        });
      });
      setPaid(data.total || 0);
      setPaymentMethod(guessPaymentMethod(data, false));
      setNotes(
        data.followUpDate ? `Next visit: ${fmtDate(data.followUpDate)}` : "",
      );
    }

    if (items.length === 0) {
      items.push({ id: nextRowId(), description: "", qty: 1, rate: 0 });
    }
    setLineItems(items);
    setDiscount(0);
    setGstPercent(0);
    setSavedInvoiceId(null);
    setInvoiceDate(new Date());
    setCreatedByDisplay(user?.fullName || "");
  }

  const updateRow = (id, field, value) => {
    setLineItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const addRow = () =>
    setLineItems((rows) => [
      ...rows,
      { id: nextRowId(), description: "", qty: 1, rate: 0 },
    ]);

  const removeRow = (id) =>
    setLineItems((rows) => rows.filter((r) => r.id !== id));

  const subtotal = lineItems.reduce(
    (s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0),
    0,
  );
  const discountVal = Number(discount) || 0;
  const gstVal =
    Math.round((subtotal - discountVal) * (Number(gstPercent) || 0)) / 100;
  const grandTotal = Math.max(0, subtotal - discountVal + gstVal);
  const paidVal = Number(paid) || 0;
  const balance = Math.max(0, Math.round((grandTotal - paidVal) * 100) / 100);

  // Load a previously saved invoice back into the editable form. From here
  // the user can adjust it and click "Update Invoice" to persist changes to
  // this same record (or "New Invoice" to abandon and start fresh).
  function viewPastInvoice(inv) {
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
    setInvoiceNumber(inv.invoiceNumber);
    setInvoiceDate(inv.createdAt);
    setCreatedByDisplay(inv.createdByName || "—");
    setSavedInvoiceId(inv.id);
    setShowHistory(false);
  }

  async function startNewInvoice() {
    setLoading(true);
    setError("");
    try {
      // Walk-in entries have no server record to refetch — just reuse the
      // typed-in details as-is. Real patients refetch to avoid reusing a
      // stale snapshot from earlier in the same modal session.
      const data = chosenPatient.__manual
        ? chosenPatient
        : await fetchFullPatient();
      setFull(data);
      buildDefaults(data);
      fetchNextInvoiceNumber(type)
        .then((r) => setInvoiceNumber(r.invoiceNumber))
        .catch(() => {});
    } catch (err) {
      setError(err.message || "Failed to load patient details");
    } finally {
      setLoading(false);
      setShowHistory(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        patientType: type,
        patientId: full.id,
        patientName: full.name,
        lineItems: lineItems.map(({ description, qty, rate }) => ({
          description,
          qty: Number(qty) || 0,
          rate: Number(rate) || 0,
          amount: (Number(qty) || 0) * (Number(rate) || 0),
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
        createdById: user?.id || null,
        createdByName: user?.fullName || null,
      };
      const saved = await createInvoice(payload);
      setSavedInvoiceId(saved.id);
      setInvoiceNumber(saved.invoiceNumber);
      setInvoiceDate(saved.createdAt);
      setCreatedByDisplay(saved.createdByName || user?.fullName || "");
      loadHistory();
    } catch (err) {
      setSaveError(err.message || "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        lineItems: lineItems.map(({ description, qty, rate }) => ({
          description,
          qty: Number(qty) || 0,
          rate: Number(rate) || 0,
          amount: (Number(qty) || 0) * (Number(rate) || 0),
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
      };
      const updated = await updateInvoice(savedInvoiceId, payload);
      setInvoiceDate(updated.createdAt);
      loadHistory();
    } catch (err) {
      setSaveError(err.message || "Failed to update invoice");
    } finally {
      setSaving(false);
    }
  }

  const handlePrint = () => window.print();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs invoice-modal-backdrop">
      <style>{`
        @media print {
          /* @page margin: 0 removes the browser's own header/footer strip
             (page title/URL up top, date-time-stamp + page number at the
             bottom) — there's no margin box left for the browser to draw
             them into. We add our own whitespace back via padding on
             .invoice-print-area below, so the printed page still looks
             properly framed. */
          @page { margin: 0; size: auto; }
          html, body { margin: 0 !important; padding: 0 !important; height: auto !important; background: #fff !important; }
          body * { visibility: hidden; }
          .invoice-print-area, .invoice-print-area * { visibility: visible; }
          .invoice-print-area {
            position: absolute; top: 0; left: 0; width: 100%; margin: 0;
            padding: 10mm 12mm 8mm;
            box-shadow: none !important; border: none !important; max-height: none !important;
            overflow: visible !important; border-radius: 0 !important;
            /* Natural height (no forced 100vh) — a short invoice only
               takes up as much of the page as its content needs, instead
               of always stretching to fill/reserve a full page. */
            height: auto !important;
          }
          .no-print { display: none !important; }
          /* Enforce removal of conditionally hidden items during print */
          .print-hide { display: none !important; }
          .invoice-print-area input, .invoice-print-area select, .invoice-print-area textarea {
            border: none !important; background: transparent !important;
            padding: 0 !important; box-shadow: none !important; -webkit-appearance: none;
            appearance: none;
          }
          /* Compact, uniform 12px print type across the whole invoice. */
          .invoice-print-area, .invoice-print-area * { font-size: 12px !important; line-height: 1.4 !important; }
          .invoice-print-area .invoice-clinic-name { font-size: 12px !important; }
          .invoice-print-area .invoice-clinic-tagline { font-size: 9px !important; }
          .invoice-print-area .invoice-badge { font-size: 9px !important; }
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
                : "Generate Invoice"}
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              {isManualFlow && !chosenPatient
                ? "Pick an existing patient or enter walk-in details"
                : `${type} Patient — review & edit before printing`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {chosenPatient && (
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
                  onClick={startNewInvoice}
                  title="Start a fresh invoice"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold"
                >
                  <Plus className="w-4 h-4" />
                  New Invoice
                </button>
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  title="Past invoices for this patient"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-extrabold"
                >
                  <History className="w-4 h-4" />
                  {showHistory ? "Hide" : "Show"} History
                  {history.length > 0 ? ` (${history.length})` : ""}
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
                {
                  key: "existing",
                  label: "Existing Patient",
                  icon: UserSearch,
                },
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
                    No matching patients found.
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
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Patient Name
                      <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <input
                      value={manualForm.name}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="Full name"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Age
                    </label>
                    <input
                      type="number"
                      value={manualForm.age}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, age: e.target.value }))
                      }
                      placeholder="Age in years"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>
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
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Phone
                    </label>
                    <input
                      value={manualForm.phone}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      placeholder="10-digit mobile"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Place
                    </label>
                    <input
                      value={manualForm.place}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, place: e.target.value }))
                      }
                      placeholder="City / Town"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Consultation Fee (₹)
                    </label>
                    <input
                      type="number"
                      value={manualForm.fee}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, fee: e.target.value }))
                      }
                      placeholder="0.00"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>
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
            Loading patient details...
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
              {error}
            </div>
          </div>
        ) : (
          <>
            {/* Past invoices for this patient */}
            {showHistory && (
              <div className="no-print mx-6 mt-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                  Previously Generated Invoices
                </h4>
                {historyLoading ? (
                  <p className="text-xs text-slate-400 font-medium">
                    Loading...
                  </p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium">
                    No invoices generated yet for this patient.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {history.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="font-extrabold text-slate-900 dark:text-white">
                            {inv.invoiceNumber}
                          </div>
                          <div className="text-slate-400 font-medium">
                            {fmtDateTime(inv.createdAt)} ·{" "}
                            {fmtINR(inv.grandTotal)}
                            {inv.createdByName && ` · by ${inv.createdByName}`}
                            {inv.balance > 0 && (
                              <span className="text-rose-500 font-bold">
                                {" "}
                                · Balance {fmtINR(inv.balance)}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => viewPastInvoice(inv)}
                          className="px-3 py-1 rounded-full bg-[#0f4a29] text-white font-extrabold"
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="p-6 sm:p-8 space-y-6 text-slate-900 dark:text-white">
              {/* Letterhead — accent bar + compact clinic name (12px) with an
                  "INVOICE" tag on the side for a cleaner, less clinical look. */}
              <div className="relative text-center pb-4 border-b-2 border-[#0f4a29] dark:border-[#52b788]">
                <span className="invoice-badge no-print absolute right-0 top-0 text-[9px] font-extrabold tracking-[0.2em] uppercase text-white bg-[#0f4a29] px-2.5 py-1 rounded-full">
                  Invoice
                </span>
                {CLINIC.logoUrl && (
                  <img
                    src={CLINIC.logoUrl}
                    alt="Clinic logo"
                    className="h-12 mx-auto mb-1.5 object-contain"
                  />
                )}
                <h1
                  className="invoice-clinic-name font-extrabold tracking-wide"
                  style={{ fontSize: "12px" }}
                >
                  {CLINIC.name}
                </h1>
                {CLINIC.tagline && (
                  <p className="invoice-clinic-tagline text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                    {CLINIC.tagline}
                  </p>
                )}
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  GSTIN: 29ABBFV4474H1ZS
                </p>
              </div>

              {savedInvoiceId && (
                <div className="no-print bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl px-4 py-2 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                  You're editing a saved invoice ({invoiceNumber}). Click
                  "Update Invoice" to save your changes to this same record, or
                  "New Invoice" to start a fresh one instead.
                </div>
              )}
              {saveError && (
                <div className="no-print bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-2 text-rose-600 dark:text-rose-400 text-xs font-bold">
                  {saveError}
                </div>
              )}

              {/* Invoice meta */}
              <div className="flex flex-wrap justify-between gap-3 text-xs font-medium">
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Invoice No.
                  </div>
                  <div className="font-extrabold">{invoiceNumber || "—"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Date
                  </div>
                  <div className="font-extrabold">{fmtDate(invoiceDate)}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    {type} No.
                  </div>
                  <div className="font-extrabold">
                    #{full?.serialNumber || full?.tokenNumber || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Generated By
                  </div>
                  <div className="font-extrabold">
                    {createdByDisplay || "—"}
                  </div>
                </div>
              </div>

              {/* Patient details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-medium border-y border-slate-100 dark:border-slate-800 py-4">
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Patient
                  </div>
                  <div className="font-extrabold">{full?.name}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Age
                  </div>
                  <div className="font-extrabold">
                    {full?.age ? `${full.age} yrs` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Gender
                  </div>
                  <div className="font-extrabold">{full?.gender || "—"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Phone
                  </div>
                  <div className="font-extrabold">{full?.phone || "—"}</div>
                </div>
              </div>

              {/* Treatment table */}
              <div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-800 dark:border-slate-200 text-left">
                      <th className="py-2 pr-2 font-extrabold w-8">Sl.No</th>
                      <th className="py-2 px-2 font-extrabold">Treatment</th>
                      <th className="py-2 px-2 font-extrabold text-right w-20">
                        Days
                      </th>
                      <th className="py-2 px-2 font-extrabold text-right w-24">
                        Price
                      </th>
                      <th className="py-2 pl-2 font-extrabold text-right w-28">
                        Amount
                      </th>
                      <th className="w-8 no-print"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((r, i) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                        <td className="py-1.5 px-2">
                          <input
                            value={r.description}
                            onChange={(e) =>
                              updateRow(r.id, "description", e.target.value)
                            }
                            placeholder="Treatment / medicine name"
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#0f4a29]"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            value={r.qty}
                            onChange={(e) =>
                              updateRow(r.id, "qty", e.target.value)
                            }
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#0f4a29]"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            value={r.rate}
                            onChange={(e) =>
                              updateRow(r.id, "rate", e.target.value)
                            }
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#0f4a29]"
                          />
                        </td>
                        <td className="py-1.5 pl-2 text-right font-extrabold">
                          {fmtINR((Number(r.qty) || 0) * (Number(r.rate) || 0))}
                        </td>
                        <td className="py-1.5 pl-1 no-print">
                          <button
                            onClick={() => removeRow(r.id)}
                            className="text-slate-300 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  onClick={addRow}
                  className="no-print mt-2 flex items-center gap-1 text-[11px] font-extrabold text-[#0f4a29] dark:text-[#52b788]"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Line Item
                </button>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-full sm:w-72 space-y-1.5 text-xs font-medium bg-slate-50/70 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Subtotal</span>
                    <span className="font-extrabold">{fmtINR(subtotal)}</span>
                  </div>

                  <div
                    className={`flex justify-between items-center ${Number(discountVal) === 0 ? "print:hidden print-hide" : ""}`}
                  >
                    <span className="text-slate-400">Discount (₹)</span>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-24 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>

                  <div
                    className={`flex justify-between items-center ${Number(gstPercent) === 0 ? "print:hidden print-hide" : ""}`}
                  >
                    <span className="text-slate-400">GST (%)</span>
                    <input
                      type="number"
                      value={gstPercent}
                      onChange={(e) => setGstPercent(e.target.value)}
                      className="w-24 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>

                  <div
                    className={`flex justify-between ${Number(gstVal) === 0 ? "print:hidden print-hide" : ""}`}
                  >
                    <span className="text-slate-400">GST Amount</span>
                    <span className="font-extrabold">{fmtINR(gstVal)}</span>
                  </div>

                  <div className="flex justify-between border-t-2 border-[#0f4a29] dark:border-[#52b788] pt-1.5 mt-1.5">
                    <span className="font-extrabold">Grand Total</span>
                    <span className="font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                      {fmtINR(grandTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Paid / Advances</span>
                    <input
                      type="number"
                      value={paid}
                      onChange={(e) => setPaid(e.target.value)}
                      className="w-24 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="font-extrabold">Balance</span>
                    <span
                      className={`font-extrabold ${balance > 0 ? "text-rose-500" : "text-[#0f4a29] dark:text-[#52b788]"}`}
                    >
                      {fmtINR(balance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment method + notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium border-t border-slate-100 dark:border-slate-800 pt-4">
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Payment Method
                  </div>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0f4a29]"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={!notes.trim() ? "print:hidden print-hide" : ""}>
                  <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Notes
                  </div>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Next visit date"
                    className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0f4a29]"
                  />
                </div>
              </div>

              {/* Signature */}
              <div className="flex justify-end pt-8">
                <div className="text-center">
                  <div className="w-40 border-t border-slate-400 dark:border-slate-600 pt-1 text-[11px] font-bold text-slate-500">
                    Authorized Signature
                  </div>
                </div>
              </div>

              {/* Footer: clinic name + address */}
              <div className="text-center border-t border-slate-200 dark:border-slate-800 pt-3">
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
                {savedInvoiceId && (
                  <button
                    onClick={startNewInvoice}
                    className="px-5 py-2.5 rounded-full text-xs font-extrabold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    New Invoice
                  </button>
                )}
                <button
                  onClick={savedInvoiceId ? handleUpdate : handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving
                    ? "Saving..."
                    : savedInvoiceId
                      ? "Update Invoice"
                      : "Save Invoice"}
                </button>
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
    </div>,
    document.body,
  );
}
