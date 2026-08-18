// client/src/components/PharmacyInvoiceModal.jsx
//
// Pharmacy-only billing — separate from the OPD/IPD "Generate Invoice" flow
// in InvoiceModal.jsx. For over-the-counter medicine sales that aren't tied
// to an OPD consultation or IPD stay.
//
// Usage: <PharmacyInvoiceModal onClose={() => setInvoicing(false)} />
// Or, to open straight onto an existing saved invoice (e.g. from the
// Pharmacy Billing list page): pass `invoiceToEdit={invoiceRow}` — this
// skips the setup screen entirely and loads that invoice's line items into
// the editor immediately.
//
// Flow:
//   1. Setup screen — pick an existing (registered OPD) patient by search,
//      or type in a walk-in customer's details by hand. Nothing is saved to
//      the Patient table for a walk-in; a synthetic local id (prefixed
//      "manual-") is used purely so the invoice has a patientId to store.
//   2. Invoice editor — each line item's "medicine" field is a live
//      autocomplete against the pharmacy's medicine list (typing filters by
//      drug name / generic name / batch as you go); selecting a match
//      prefills the description and per-tablet selling price, both still
//      editable afterwards. Typing something that matches nothing just
//      stays as a free-text line item.
//   3. Saves through the same /api/invoices backend as OPD/IPD, tagged
//      patientType: "PHARMACY" — its own invoice number series
//      (VPC-INV-PHARMACY-000001...), kept fully separate from OPD/IPD
//      invoice history.

import { useEffect, useState } from "react";
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
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  fetchNextInvoiceNumber,
  fetchPatientInvoices,
  createInvoice,
  updateInvoice,
  markInvoiceReturn,
} from "../api/invoice.api";

// Same letterhead as InvoiceModal.jsx — edit both if the clinic details change.
const CLINIC = {
  name: "Virupakshipuram Paralysis Centre",
  tagline: "Pharmacy Billing",
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
        month: "short",
        year: "numeric",
      })
    : "—";

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

let rowSeq = 0;
const nextRowId = () => `prow-${Date.now()}-${rowSeq++}`;
let manualSeq = 0;
const nextManualId = () => `manual-${Date.now()}-${manualSeq++}`;
const blankRow = () => ({
  id: nextRowId(),
  medicineId: null,
  description: "",
  qty: 1,
  rate: 0,
  returnedQty: 0,
});

// NONE / PARTIAL / FULL -> badge label + color classes for the return status pill.
const RETURN_STATUS_META = {
  NONE: null,
  PARTIAL: {
    label: "Partially Returned",
    className:
      "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-700 dark:text-amber-400",
  },
  FULL: {
    label: "Fully Returned",
    className:
      "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400",
  },
};

export default function PharmacyInvoiceModal({
  onClose,
  invoiceToEdit = null,
}) {
  const { user } = useAuth();

  // Only roles that actually have OPD access can search the OPD patient
  // directory — Admin/Pharmacy/Manager (and anyone else) may not have the
  // OPD module assigned, and /opd/patients rejects them for it. Calling it
  // anyway was tripping the app's session-expiry handling on the 401/403
  // and force-logging the user out, which looked like a crash back to
  // /login. Skip the call entirely for anyone without OPD access instead.
  const hasOpdAccess =
    user?.role === "receptionist" ||
    user?.role === "doctor" ||
    (user?.modules || []).includes("OPD");

  // ---- Setup screen: existing patient search vs. walk-in entry ----
  const [chosenPatient, setChosenPatient] = useState(null);
  const [setupTab, setSetupTab] = useState(
    hasOpdAccess ? "existing" : "manual",
  );
  const [allPatients, setAllPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(hasOpdAccess);
  const [patientSearch, setPatientSearch] = useState("");
  const [manualForm, setManualForm] = useState({
    name: "",
    age: "",
    gender: "",
    phone: "",
    place: "",
  });
  const [manualFormError, setManualFormError] = useState("");

  useEffect(() => {
    if (!hasOpdAccess) return;
    api
      .get("/opd/patients")
      .then(({ patients: data }) => setAllPatients(data))
      .catch(() => setAllPatients([]))
      .finally(() => setPatientsLoading(false));
  }, [hasOpdAccess]);

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

  // Search results already carry everything the invoice header needs
  // (name/age/gender/phone/place/serialNumber) — no extra fetch required.
  const selectExistingPatient = (p) => setChosenPatient(p);

  const submitManualPatient = () => {
    setManualFormError("");
    if (!manualForm.name.trim()) {
      setManualFormError("Customer name is required.");
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
    });
  };

  const backToSetup = () => {
    setChosenPatient(null);
    setSavedInvoiceId(null);
  };

  // ---- Medicine catalogue for the line-item autocomplete ----
  const [medicines, setMedicines] = useState([]);
  const [medicinesLoading, setMedicinesLoading] = useState(true);
  useEffect(() => {
    api
      .get("/pharmacy/medicines")
      .then(({ medicines: data }) => setMedicines(data))
      .catch(() => setMedicines([]))
      .finally(() => setMedicinesLoading(false));
  }, []);

  // Only one row's suggestion dropdown is open at a time.
  const [activeSearchRowId, setActiveSearchRowId] = useState(null);
  const suggestionsFor = (row) => {
    const q = row.description.trim().toLowerCase();
    if (!q) return [];
    return medicines
      .filter(
        (m) =>
          m.drugName.toLowerCase().includes(q) ||
          (m.genericName || "").toLowerCase().includes(q) ||
          (m.batchNumber || "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  };

  const [lineItems, setLineItems] = useState([blankRow()]);
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ---- Returns (patient brings tablets back) ----
  const [returnStatus, setReturnStatus] = useState("NONE"); // NONE | PARTIAL | FULL
  const [returnedAt, setReturnedAt] = useState(null);
  const [returnedByDisplay, setReturnedByDisplay] = useState("");
  const [returnNotesSaved, setReturnNotesSaved] = useState("");
  const [showReturnPanel, setShowReturnPanel] = useState(false);
  const [returnQtyByRow, setReturnQtyByRow] = useState({}); // { [rowId]: string }
  const [returnFormNotes, setReturnFormNotes] = useState("");
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState("");

  // Runs once a patient is chosen (setup screen completed) — preps a fresh
  // blank invoice and loads that patient's prior Pharmacy invoices, if any.
  // Skipped when jumping straight into an existing invoice (invoiceToEdit)
  // — that path populates everything itself via viewPastInvoice below, and
  // this reset would otherwise immediately clobber it with a blank one.
  useEffect(() => {
    if (!chosenPatient?.id || chosenPatient.__skipReset) return;
    setLineItems([blankRow()]);
    setDiscount(0);
    setGstPercent(0);
    setPaid(0);
    setPaymentMethod("Cash");
    setNotes("");
    setSavedInvoiceId(null);
    setInvoiceDate(new Date());
    setCreatedByDisplay(user?.fullName || "");
    setSaveError("");
    setReturnStatus("NONE");
    setReturnedAt(null);
    setReturnedByDisplay("");
    setReturnNotesSaved("");
    setShowReturnPanel(false);
    setReturnQtyByRow({});
    setReturnFormNotes("");
    setReturnError("");

    fetchNextInvoiceNumber("PHARMACY")
      .then((r) => setInvoiceNumber(r.invoiceNumber))
      .catch(() => {});

    if (chosenPatient.__manual) {
      setHistory([]);
      setHistoryLoading(false);
    } else {
      setHistoryLoading(true);
      fetchPatientInvoices("PHARMACY", chosenPatient.id)
        .then((invs) => setHistory(invs))
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenPatient?.id]);

  const updateRow = (id, field, value) => {
    setLineItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const selectMedicineForRow = (rowId, med) => {
    setLineItems((rows) =>
      rows.map((r) =>
        r.id === rowId
          ? {
              ...r,
              medicineId: med.id,
              description: `${med.drugName}${med.batchNumber ? ` (Batch ${med.batchNumber})` : ""}`,
              rate: Number((med.sellingPricePerTablet || 0).toFixed(2)),
            }
          : r,
      ),
    );
    setActiveSearchRowId(null);
  };

  const addRow = () => setLineItems((rows) => [...rows, blankRow()]);
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

  function viewPastInvoice(inv) {
    const items = Array.isArray(inv.lineItems) ? inv.lineItems : [];
    setLineItems(
      items.length
        ? items.map((it) => ({
            id: nextRowId(),
            medicineId: it.medicineId || null,
            description: it.description,
            qty: it.qty,
            rate: it.rate,
            returnedQty: Number(it.returnedQty) || 0,
          }))
        : [blankRow()],
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
    setReturnStatus(inv.returnStatus || "NONE");
    setReturnedAt(inv.returnedAt || null);
    setReturnedByDisplay(inv.returnedByName || "");
    setReturnNotesSaved(inv.returnNotes || "");
    setShowReturnPanel(false);
    setReturnQtyByRow({});
    setReturnFormNotes("");
    setReturnError("");
    setShowHistory(false);
  }

  // Opened directly onto a specific invoice (e.g. "View" from the Pharmacy
  // Billing list) — jump straight past the setup screen into the editor,
  // preloaded with that invoice's details, instead of making the user
  // re-pick the patient they already picked when they created it.
  useEffect(() => {
    if (!invoiceToEdit) return;
    const isRealPatient = !String(invoiceToEdit.patientId || "").startsWith(
      "manual-",
    );
    setChosenPatient({
      __manual: !isRealPatient,
      __skipReset: true,
      id: invoiceToEdit.patientId,
      name: invoiceToEdit.patientName,
      age: null,
      gender: "",
      phone: "",
      place: "",
    });
    viewPastInvoice(invoiceToEdit);
    if (isRealPatient) {
      setHistoryLoading(true);
      fetchPatientInvoices("PHARMACY", invoiceToEdit.patientId)
        .then((invs) => setHistory(invs))
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNewInvoice() {
    setLineItems([blankRow()]);
    setDiscount(0);
    setGstPercent(0);
    setPaid(0);
    setPaymentMethod("Cash");
    setNotes("");
    setSavedInvoiceId(null);
    setInvoiceDate(new Date());
    setCreatedByDisplay(user?.fullName || "");
    setSaveError("");
    setReturnStatus("NONE");
    setReturnedAt(null);
    setReturnedByDisplay("");
    setReturnNotesSaved("");
    setShowReturnPanel(false);
    setReturnQtyByRow({});
    setReturnFormNotes("");
    setReturnError("");
    fetchNextInvoiceNumber("PHARMACY")
      .then((r) => setInvoiceNumber(r.invoiceNumber))
      .catch(() => {});
    setShowHistory(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        patientType: "PHARMACY",
        patientId: chosenPatient.id,
        patientName: chosenPatient.name,
        lineItems: lineItems.map(({ medicineId, description, qty, rate }) => ({
          medicineId: medicineId || null,
          description,
          qty: Number(qty) || 0,
          rate: Number(rate) || 0,
          amount: (Number(qty) || 0) * (Number(rate) || 0),
          returnedQty: 0,
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
      if (!chosenPatient.__manual) {
        fetchPatientInvoices("PHARMACY", chosenPatient.id)
          .then((invs) => setHistory(invs))
          .catch(() => {});
      }
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
        lineItems: lineItems.map(
          ({ medicineId, description, qty, rate, returnedQty }) => ({
            medicineId: medicineId || null,
            description,
            qty: Number(qty) || 0,
            rate: Number(rate) || 0,
            amount: (Number(qty) || 0) * (Number(rate) || 0),
            returnedQty: Number(returnedQty) || 0,
          }),
        ),
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
      if (!chosenPatient.__manual) {
        fetchPatientInvoices("PHARMACY", chosenPatient.id)
          .then((invs) => setHistory(invs))
          .catch(() => {});
      }
    } catch (err) {
      setSaveError(err.message || "Failed to update invoice");
    } finally {
      setSaving(false);
    }
  }

  // How many units of this row are still eligible to be returned right now
  // (sold − already returned). Only medicine-linked rows can be auto-restocked.
  const maxReturnableFor = (row) =>
    Math.max(0, (Number(row.qty) || 0) - (Number(row.returnedQty) || 0));

  const returnableRows = lineItems.filter(
    (r) => r.medicineId && maxReturnableFor(r) > 0,
  );

  async function handleConfirmReturn() {
    setReturnError("");

    const items = lineItems
      .map((row, index) => ({
        index,
        row,
        returnQty: Number(returnQtyByRow[row.id]) || 0,
      }))
      .filter((x) => x.returnQty > 0);

    if (items.length === 0) {
      setReturnError(
        "Enter how many tablets are being returned for at least one medicine.",
      );
      return;
    }

    // Verify the counts one more time on the client before sending — the
    // server re-verifies again against the saved invoice as the final check.
    for (const { row, returnQty } of items) {
      const max = maxReturnableFor(row);
      if (returnQty > max) {
        setReturnError(
          `"${row.description}" — only ${max} tablet(s) can be returned (sold ${row.qty}, already returned ${row.returnedQty || 0}). Please recheck the count.`,
        );
        return;
      }
    }

    setReturning(true);
    try {
      const updated = await markInvoiceReturn(savedInvoiceId, {
        items: items.map(({ index, returnQty }) => ({ index, returnQty })),
        notes: returnFormNotes,
      });

      // Merge the server's authoritative returnedQty back onto our rows.
      const updatedLineItems = Array.isArray(updated.lineItems)
        ? updated.lineItems
        : [];
      setLineItems((rows) =>
        rows.map((r, i) => ({
          ...r,
          returnedQty: Number(updatedLineItems[i]?.returnedQty) || 0,
        })),
      );
      setReturnStatus(updated.returnStatus || "NONE");
      setReturnedAt(updated.returnedAt || new Date().toISOString());
      setReturnedByDisplay(updated.returnedByName || user?.fullName || "");
      setReturnNotesSaved(updated.returnNotes || "");
      setReturnQtyByRow({});
      setReturnFormNotes("");
      setShowReturnPanel(false);
    } catch (err) {
      setReturnError(err.message || "Failed to process the return.");
    } finally {
      setReturning(false);
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
              {chosenPatient ? "Pharmacy Invoice" : "Create Pharmacy Invoice"}
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              {chosenPatient
                ? "Medicine billing — review & edit before printing"
                : "Pick an existing patient or enter walk-in customer details"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {chosenPatient && (
              <>
                <button
                  onClick={backToSetup}
                  title="Choose a different patient"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-extrabold"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
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
                  title="Past pharmacy invoices for this patient"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-extrabold"
                >
                  <History className="w-4 h-4" />
                  {showHistory ? "Hide" : "Show"} History
                  {history.length > 0 ? ` (${history.length})` : ""}
                </button>
                {savedInvoiceId && returnableRows.length > 0 && (
                  <button
                    onClick={() => setShowReturnPanel((v) => !v)}
                    title="Record tablets returned by the patient"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-extrabold"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {showReturnPanel ? "Hide Return" : "Mark Return"}
                  </button>
                )}
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

        {chosenPatient && showReturnPanel && (
          <div className="no-print mx-6 mt-4 bg-amber-50/60 dark:bg-amber-950/10 border border-amber-200/80 dark:border-amber-900/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Record a Return
              </h4>
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/70 font-medium leading-relaxed">
              Enter exactly how many tablets/strips the patient is physically
              returning for each medicine — double-check the count before
              confirming. Only that quantity is added back to pharmacy stock.
              A patient can return every tablet they bought or only some of
              them; you can also record further returns later.
            </p>

            <div className="space-y-2">
              {returnableRows.map((row) => {
                const max = maxReturnableFor(row);
                return (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-900/30 rounded-xl px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {row.description || "Medicine"}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        Sold {row.qty}
                        {Number(row.returnedQty) > 0
                          ? ` · Already returned ${row.returnedQty}`
                          : ""}{" "}
                        · Max returnable now:{" "}
                        <span className="font-extrabold text-amber-600 dark:text-amber-400">
                          {max}
                        </span>
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={max}
                      value={returnQtyByRow[row.id] ?? ""}
                      onChange={(e) =>
                        setReturnQtyByRow((m) => ({
                          ...m,
                          [row.id]: e.target.value,
                        }))
                      }
                      placeholder="0"
                      className="w-24 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-right font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-amber-700/80 dark:text-amber-400/70 mb-1">
                Return Notes (optional)
              </label>
              <input
                value={returnFormNotes}
                onChange={(e) => setReturnFormNotes(e.target.value)}
                placeholder="e.g. Reason for return, condition of strips"
                className="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-amber-500"
              />
            </div>

            {returnError && (
              <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl px-3 py-2 text-rose-600 dark:text-rose-400 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {returnError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowReturnPanel(false);
                  setReturnQtyByRow({});
                  setReturnError("");
                }}
                className="px-4 py-2 rounded-full text-xs font-extrabold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReturn}
                disabled={returning}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold px-5 py-2 rounded-full shadow-xs disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {returning ? "Confirming..." : "Confirm Return & Restock"}
              </button>
            </div>
          </div>
        )}

        {!chosenPatient ? (
          <div className="p-6 space-y-5">
            {hasOpdAccess && (
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
            )}

            {setupTab === "existing" && hasOpdAccess ? (
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
                  For a walk-in customer who isn't in the OPD directory. These
                  details are only used on this invoice — no patient record is
                  created.
                </p>
                {manualFormError && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
                    {manualFormError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                      Customer Name
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
        ) : (
          <>
            {showHistory && (
              <div className="no-print mx-6 mt-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                  Previous Pharmacy Invoices
                </h4>
                {historyLoading ? (
                  <p className="text-xs text-slate-400 font-medium">
                    Loading...
                  </p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium">
                    No pharmacy invoices generated yet for this patient.
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
              </div>

              {returnStatus !== "NONE" && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 border rounded-2xl px-4 py-2 text-xs font-bold ${RETURN_STATUS_META[returnStatus]?.className || ""}`}
                >
                  <span className="flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    {RETURN_STATUS_META[returnStatus]?.label}
                    {returnedAt ? ` · ${fmtDateTime(returnedAt)}` : ""}
                    {returnedByDisplay ? ` · by ${returnedByDisplay}` : ""}
                  </span>
                  {returnNotesSaved && (
                    <span className="no-print font-medium opacity-80">
                      "{returnNotesSaved}"
                    </span>
                  )}
                </div>
              )}

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
                    Patient Type
                  </div>
                  <div className="font-extrabold">
                    {chosenPatient.__manual
                      ? "Walk-in"
                      : `OPD #${chosenPatient.serialNumber || "—"}`}
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-medium border-y border-slate-100 dark:border-slate-800 py-4">
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Patient
                  </div>
                  <div className="font-extrabold">{chosenPatient.name}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Age
                  </div>
                  <div className="font-extrabold">
                    {chosenPatient.age ? `${chosenPatient.age} yrs` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Gender
                  </div>
                  <div className="font-extrabold">
                    {chosenPatient.gender || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Phone
                  </div>
                  <div className="font-extrabold">
                    {chosenPatient.phone || "—"}
                  </div>
                </div>
              </div>

              {/* Medicine line items — description field is a live
                  autocomplete against the pharmacy catalogue. */}
              <div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-800 dark:border-slate-200 text-left">
                      <th className="py-2 pr-2 font-extrabold w-8">#</th>
                      <th className="py-2 px-2 font-extrabold">Medicine</th>
                      <th className="py-2 px-2 font-extrabold text-right w-20">
                        Qty
                      </th>
                      <th className="py-2 px-2 font-extrabold text-right w-24">
                        Rate
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
                        <td className="py-1.5 pr-2 text-slate-400 align-top">
                          {i + 1}
                        </td>
                        <td className="py-1.5 px-2 relative">
                          <input
                            value={r.description}
                            onChange={(e) => {
                              updateRow(r.id, "description", e.target.value);
                              updateRow(r.id, "medicineId", null);
                              setActiveSearchRowId(r.id);
                            }}
                            onFocus={() => setActiveSearchRowId(r.id)}
                            onBlur={() =>
                              setTimeout(
                                () =>
                                  setActiveSearchRowId((id) =>
                                    id === r.id ? null : id,
                                  ),
                                150,
                              )
                            }
                            placeholder="Start typing a medicine name..."
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#0f4a29]"
                          />
                          {activeSearchRowId === r.id &&
                            r.description.trim() && (
                              <div className="no-print absolute z-20 left-2 right-2 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                {medicinesLoading ? (
                                  <div className="px-3 py-2 text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Loading medicines...
                                  </div>
                                ) : suggestionsFor(r).length === 0 ? (
                                  <div className="px-3 py-2 text-[11px] text-slate-400 font-medium">
                                    No matches — this will stay as a free-text
                                    line item.
                                  </div>
                                ) : (
                                  suggestionsFor(r).map((med) => (
                                    <button
                                      key={med.id}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() =>
                                        selectMedicineForRow(r.id, med)
                                      }
                                      className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    >
                                      <div className="font-extrabold text-slate-900 dark:text-white">
                                        {med.drugName}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-medium">
                                        Batch {med.batchNumber} · {med.quantity}{" "}
                                        in stock · ₹
                                        {(
                                          med.sellingPricePerTablet || 0
                                        ).toFixed(2)}
                                        /tab
                                      </div>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                        </td>
                        <td className="py-1.5 px-2 align-top">
                          <input
                            type="number"
                            value={r.qty}
                            onChange={(e) =>
                              updateRow(r.id, "qty", e.target.value)
                            }
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#0f4a29]"
                          />
                        </td>
                        <td className="py-1.5 px-2 align-top">
                          <input
                            type="number"
                            value={r.rate}
                            onChange={(e) =>
                              updateRow(r.id, "rate", e.target.value)
                            }
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#0f4a29]"
                          />
                        </td>
                        <td className="py-1.5 pl-2 text-right font-extrabold align-top">
                          {fmtINR((Number(r.qty) || 0) * (Number(r.rate) || 0))}
                          {Number(r.returnedQty) > 0 && (
                            <div className="text-[9px] font-bold text-amber-600 dark:text-amber-400 normal-case">
                              ↩ {r.returnedQty} returned
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 pl-1 no-print align-top">
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
                  <Plus className="w-3.5 h-3.5" /> Add Medicine Line
                </button>
              </div>

              <div className="flex justify-end">
                <div className="w-full sm:w-72 space-y-1.5 text-xs font-medium bg-slate-50/70 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Subtotal</span>
                    <span className="font-extrabold">{fmtINR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Discount (₹)</span>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-24 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">GST (%)</span>
                    <input
                      type="number"
                      value={gstPercent}
                      onChange={(e) => setGstPercent(e.target.value)}
                      className="w-24 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#0f4a29]"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">GST Amount</span>
                    <span className="font-extrabold">{fmtINR(gstVal)}</span>
                  </div>
                  <div className="flex justify-between border-t-2 border-[#0f4a29] dark:border-[#52b788] pt-1.5 mt-1.5">
                    <span className="font-extrabold">Grand Total</span>
                    <span className="font-extrabold text-[#0f4a29] dark:text-[#52b788]">{fmtINR(grandTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Paid</span>
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
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Notes
                  </div>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Doctor / prescription reference"
                    className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0f4a29]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-8">
                <div className="text-center">
                  <div className="w-40 border-t border-slate-400 dark:border-slate-600 pt-1 text-[11px] font-bold text-slate-500">
                    Authorized Signature
                  </div>
                </div>
              </div>

              <div className="text-center border-t border-slate-200 dark:border-slate-800 pt-3">
                <p className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                  {CLINIC.footerName}
                </p>
                <p className="text-[10px] text-slate-400 max-w-xl mx-auto leading-snug">
                  {CLINIC.footerAddress}
                </p>
              </div>

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