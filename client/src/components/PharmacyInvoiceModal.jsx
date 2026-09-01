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

import { useCallback, useEffect, useRef, useState } from "react";
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

// Clinic details
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
  maxStock: undefined,
});

// NONE / PARTIAL / FULL -> badge label + color classes for the return status pill.
const RETURN_STATUS_META = {
  NONE: null,
  PARTIAL: {
    label: "Partially Returned",
    className: "bg-amber-50 border-amber-200 text-amber-700",
  },
  FULL: {
    label: "Fully Returned",
    className: "bg-rose-50 border-rose-200 text-rose-600",
  },
};

// --- Fixed half-A4 print sizing --------------------------------------
const MM_TO_PX = 96 / 25.4;
const HALF_PAGE_HEIGHT_MM = 148.5;
const HALF_PAGE_PAD_TOP_MM = 10;
const HALF_PAGE_PAD_BOTTOM_MM = 8;
const HALF_PAGE_CONTENT_HEIGHT_PX =
  (HALF_PAGE_HEIGHT_MM - HALF_PAGE_PAD_TOP_MM - HALF_PAGE_PAD_BOTTOM_MM) *
  MM_TO_PX;
const PRINT_SAFETY_MARGIN = 0.93;
const HALF_PAGE_PRINT_TARGET_PX =
  HALF_PAGE_CONTENT_HEIGHT_PX * PRINT_SAFETY_MARGIN;
const PRINT_MIN_SCALE = 0.55;

export default function PharmacyInvoiceModal({
  onClose,
  invoiceToEdit = null,
}) {
  const { user } = useAuth();

  const hasOpdAccess =
    user?.role === "receptionist" ||
    user?.role === "doctor" ||
    (user?.modules || []).includes("OPD");

  const [chosenPatient, setChosenPatient] = useState(null);
  const [setupTab, setSetupTab] = useState("existing");
  const [allPatients, setAllPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
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
    const requests = [
      hasOpdAccess
        ? api
            .get("/opd/patients")
            .then(({ patients }) =>
              (patients || []).map((p) => ({ ...p, patientType: "OPD" })),
            )
            .catch((err) => {
              console.error(
                "Failed to load OPD patients for Pharmacy Billing:",
                err,
              );
              return [];
            })
        : Promise.resolve([]),
      api
        .get("/ipd/patients?limit=1000")
        .then(({ data }) =>
          (data || []).map((p) => ({ ...p, patientType: "IPD" })),
        )
        .catch((err) => {
          console.error(
            "Failed to load IPD patients for Pharmacy Billing:",
            err,
          );
          return [];
        }),
    ];

    Promise.all(requests)
      .then(([opdPatients, ipdPatients]) =>
        setAllPatients([...opdPatients, ...ipdPatients]),
      )
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

  const [medicines, setMedicines] = useState([]);
  const [medicinesLoading, setMedicinesLoading] = useState(true);
  useEffect(() => {
    api
      .get("/pharmacy/medicines")
      .then(({ medicines: data }) => setMedicines(data))
      .catch(() => setMedicines([]))
      .finally(() => setMedicinesLoading(false));
  }, []);

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

  const [returnStatus, setReturnStatus] = useState("NONE");
  const [returnedAt, setReturnedAt] = useState(null);
  const [returnedByDisplay, setReturnedByDisplay] = useState("");
  const [returnNotesSaved, setReturnNotesSaved] = useState("");
  const [showReturnPanel, setShowReturnPanel] = useState(false);
  const [returnQtyByRow, setReturnQtyByRow] = useState({});
  const [returnFormNotes, setReturnFormNotes] = useState("");
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState("");

  useEffect(() => {
    if (!chosenPatient?.id || chosenPatient.__skipReset) return;
    setLineItems([blankRow()]);
    setDiscount(0);
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
              maxStock: med.quantity, // Save the stock limit
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
  // GST completely removed from calculation
  const grandTotal = Math.max(0, subtotal - discountVal);
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
            maxStock: undefined,
          }))
        : [blankRow()],
    );
    setDiscount(inv.discount || 0);
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
    if (savedInvoiceId) {
      const ok = window.confirm(
        `You're currently editing invoice ${invoiceNumber}. Starting a new invoice will discard any unsaved changes on screen (the already-saved invoice itself is not affected). Continue?`,
      );
      if (!ok) return;
    }
    setLineItems([blankRow()]);
    setDiscount(0);
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

  const savingRef = useRef(false);

  const printAreaRef = useRef(null);
  const printContentRef = useRef(null);

  const fitToHalfPage = useCallback(() => {
    const content = printContentRef.current;
    if (!content) return;
    content.style.transform = "none";
    content.style.width = "100%";
    void content.offsetHeight;
    const naturalHeight = content.scrollHeight;
    const scale =
      naturalHeight > 0
        ? Math.max(
            PRINT_MIN_SCALE,
            Math.min(1, HALF_PAGE_PRINT_TARGET_PX / naturalHeight),
          )
        : 1;
    content.style.transformOrigin = "top left";
    content.style.transform = `scale(${scale})`;
    content.style.width = `${100 / scale}%`;
  }, []);

  const resetScale = useCallback(() => {
    const content = printContentRef.current;
    if (!content) return;
    content.style.transform = "";
    content.style.width = "";
    content.style.transformOrigin = "";
  }, []);

  useEffect(() => {
    window.addEventListener("beforeprint", fitToHalfPage);
    window.addEventListener("afterprint", resetScale);
    return () => {
      window.removeEventListener("beforeprint", fitToHalfPage);
      window.removeEventListener("afterprint", resetScale);
    };
  }, [fitToHalfPage, resetScale]);

async function handleSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const formattedLineItems = lineItems.map(({ medicineId, description, qty, rate }) => {
        const itemQty = Number(qty) || 0;
        const itemRate = Number(rate) || 0;
        return {
          medicineId: medicineId || null,
          description,
          qty: itemQty,
          rate: itemRate,
          amount: Number((itemQty * itemRate).toFixed(2)),
        };
      });

      const payload = {
        patientType: "PHARMACY",
        patientId: chosenPatient.id,
        patientName: chosenPatient.name,
        lineItems: formattedLineItems,
        subtotal: Number(subtotal.toFixed(2)),
        discount: discountVal,
        gstPercent: 0,
        gstAmount: 0,
        grandTotal: Number(grandTotal.toFixed(2)),
        paid: paidVal,
        balance: Math.max(0, Number((grandTotal - paidVal).toFixed(2))),
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
      setDiscount(saved.discount);
      setPaid(saved.paid);

      if (!chosenPatient.__manual) {
        fetchPatientInvoices("PHARMACY", chosenPatient.id)
          .then((invs) => setHistory(invs))
          .catch(() => {});
      }
    } catch (err) {
      setSaveError(err.message || "Failed to save invoice");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const formattedLineItems = lineItems.map(({ medicineId, description, qty, rate, returnedQty }) => {
        const itemQty = Number(qty) || 0;
        const itemRate = Number(rate) || 0;
        return {
          medicineId: medicineId || null,
          description,
          qty: itemQty,
          rate: itemRate,
          amount: Number((itemQty * itemRate).toFixed(2)),
          returnedQty: Number(returnedQty) || 0,
        };
      });

      const payload = {
        lineItems: formattedLineItems,
        subtotal: Number(subtotal.toFixed(2)),
        discount: discountVal,
        gstPercent: 0,
        gstAmount: 0,
        grandTotal: Number(grandTotal.toFixed(2)),
        paid: paidVal,
        balance: Math.max(0, Number((grandTotal - paidVal).toFixed(2))),
        paymentMethod,
        notes,
      };

      const updated = await updateInvoice(savedInvoiceId, payload);
      setInvoiceDate(updated.createdAt);
      setDiscount(updated.discount);
      setPaid(updated.paid);
      setLineItems((rows) =>
        rows.map((r, i) => ({
          ...r,
          returnedQty: Number(updated.lineItems?.[i]?.returnedQty) || 0,
        })),
      );

      if (!chosenPatient.__manual) {
        fetchPatientInvoices("PHARMACY", chosenPatient.id)
          .then((invs) => setHistory(invs))
          .catch(() => {});
      }
    } catch (err) {
      setSaveError(err.message || "Failed to update invoice");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

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

  const handlePrint = () => {
    fitToHalfPage();
    window.print();
    resetScale();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm invoice-modal-backdrop">
      <style>{`
        @media print {
          @page { margin: 0; size: auto; }
          html, body { margin: 0 !important; padding: 0 !important; height: auto !important; background: #fff !important; }
          body > *:not(.invoice-modal-backdrop) { display: none !important; }
          .invoice-modal-backdrop {
            position: fixed !important; inset: 0 !important;
            margin: 0 !important; padding: 0 !important;
            background: none !important; backdrop-filter: none !important;
            display: block !important;
          }
          body * { visibility: hidden; }
          .invoice-print-area, .invoice-print-area * { visibility: visible; }
          .invoice-print-area {
            position: absolute; top: 0; left: 0; width: 100% !important; max-width: 100% !important; margin: 0;
            padding: 10mm 12mm 8mm;
            box-shadow: none !important; border: none !important; max-height: none !important;
            border-radius: 0 !important;
            height: 148.5mm !important;
            box-sizing: border-box;
            overflow: hidden !important;
            background: #ffffff !important;
          }
          .no-print { display: none !important; }
          .print-hide { display: none !important; }
          .invoice-print-area input, .invoice-print-area select, .invoice-print-area textarea {
            border: none !important; background: transparent !important;
            padding: 0 !important; box-shadow: none !important; -webkit-appearance: none;
            appearance: none;
          }
          .invoice-print-area, .invoice-print-area * { font-size: 12px !important; line-height: 1.4 !important; color: #0f172a !important; }
        }
      `}</style>

      <div
        ref={printAreaRef}
        className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl invoice-print-area"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white z-10 no-print">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">
              {chosenPatient ? "Pharmacy Invoice" : "Create Pharmacy Invoice"}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={startNewInvoice}
                  title="Start a fresh invoice"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#047857] hover:bg-[#065f46] text-white text-xs font-bold"
                >
                  <Plus className="w-4 h-4" />
                  New Invoice
                </button>
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  title="Past pharmacy invoices for this patient"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold"
                >
                  <History className="w-4 h-4" />
                  {showHistory ? "Hide" : "Show"} History
                  {history.length > 0 ? ` (${history.length})` : ""}
                </button>
                {savedInvoiceId && returnableRows.length > 0 && (
                  <button
                    onClick={() => setShowReturnPanel((v) => !v)}
                    title="Record tablets returned by the patient"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {showReturnPanel ? "Hide Return" : "Mark Return"}
                  </button>
                )}
              </>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {chosenPatient && showReturnPanel && (
          <div className="no-print mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-700">
                Record a Return
              </h4>
            </div>
            <p className="text-[11px] text-amber-700/80 font-medium leading-relaxed">
              Enter exactly how many tablets/strips the patient is physically
              returning for each medicine — double-check the count before
              confirming.
            </p>
            <div className="space-y-2">
              {returnableRows.map((row) => {
                const max = maxReturnableFor(row);
                return (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-white border border-amber-100 rounded-md px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {row.description || "Medicine"}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        Sold {row.qty}
                        {Number(row.returnedQty) > 0
                          ? ` · Already returned ${row.returnedQty}`
                          : ""}{" "}
                        · Max returnable now:{" "}
                        <span className="font-extrabold text-amber-600">
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
                      className="w-24 bg-transparent border border-slate-200 rounded px-2 py-1.5 text-xs text-right font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                );
              })}
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-amber-700/80 mb-1">
                Return Notes (optional)
              </label>
              <input
                value={returnFormNotes}
                onChange={(e) => setReturnFormNotes(e.target.value)}
                placeholder="e.g. Reason for return"
                className="w-full bg-white border border-amber-200 rounded-md px-3 py-2 text-xs font-medium focus:outline-none focus:border-amber-500"
              />
            </div>
            {returnError && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-rose-600 text-xs font-bold">
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
                className="px-4 py-2 rounded-md text-xs font-bold border border-slate-200 text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReturn}
                disabled={returning}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-5 py-2 rounded-md disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {returning ? "Confirming..." : "Confirm Return & Restock"}
              </button>
            </div>
          </div>
        )}

        {!chosenPatient ? (
          <div className="p-6 space-y-5">
            <div className="flex gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-md w-fit">
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
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold transition-all ${
                      active
                        ? "bg-[#047857] text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
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
                    placeholder="Search by name, token/IPD no., or phone..."
                    className="w-full bg-white border border-slate-200 rounded-md pl-9 pr-4 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#047857]"
                  />
                </div>
                {patientsLoading ? (
                  <div className="flex items-center justify-center py-10 text-xs font-bold text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin text-[#047857] mr-2" />
                    Loading patients...
                  </div>
                ) : matchingPatients.length === 0 ? (
                  <p className="text-slate-400 text-xs py-10 text-center font-medium">
                    No matching patients found.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-72 overflow-y-auto">
                    {matchingPatients.slice(0, 50).map((p) => (
                      <button
                        key={`${p.patientType}-${p.id}`}
                        onClick={() => selectExistingPatient(p)}
                        className="w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                            {p.name}
                            <span
                              className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${p.patientType === "IPD" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                            >
                              {p.patientType}
                            </span>
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            #{p.serialNumber || "—"}
                            {p.phone ? ` · ${p.phone}` : ""}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-[#047857] shrink-0">
                          Select →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 font-medium">
                  For a walk-in customer who isn't in the OPD/IPD directory.
                  These details are only used on this invoice — no patient
                  record is created.
                </p>
                {manualFormError && (
                  <div className="bg-rose-50 border border-rose-200 rounded-md px-4 py-3 text-rose-600 text-xs font-bold">
                    {manualFormError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Customer Name{" "}
                      <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <input
                      value={manualForm.name}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="Full name"
                      className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#047857]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Age
                    </label>
                    <input
                      type="number"
                      value={manualForm.age}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, age: e.target.value }))
                      }
                      placeholder="Age in years"
                      className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#047857]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Gender
                    </label>
                    <select
                      value={manualForm.gender}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, gender: e.target.value }))
                      }
                      className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#047857]"
                    >
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Phone
                    </label>
                    <input
                      value={manualForm.phone}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      placeholder="10-digit mobile"
                      className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#047857]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Place
                    </label>
                    <input
                      value={manualForm.place}
                      onChange={(e) =>
                        setManualForm((f) => ({ ...f, place: e.target.value }))
                      }
                      placeholder="City / Town"
                      className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#047857]"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={submitManualPatient}
                    className="flex items-center gap-1.5 bg-[#047857] hover:bg-[#065f46] text-white text-xs font-bold px-6 py-2.5 rounded-md shadow-sm"
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
              <div className="no-print mx-4 mt-4 bg-slate-50 border border-slate-200 rounded-md p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Previous Pharmacy Invoices
                </h4>
                {historyLoading ? (
                  <p className="text-xs text-slate-500 font-medium">
                    Loading...
                  </p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-slate-500 font-medium">
                    No pharmacy invoices generated yet for this patient.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {history.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {inv.invoiceNumber}
                          </div>
                          <div className="text-slate-500 font-medium">
                            {fmtDateTime(inv.createdAt)} ·{" "}
                            {fmtINR(inv.grandTotal)}
                            {inv.createdByName && ` · by ${inv.createdByName}`}
                            {inv.balance > 0 && (
                              <span className="text-rose-600 font-bold">
                                {" "}
                                · Balance {fmtINR(inv.balance)}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => viewPastInvoice(inv)}
                          className="px-3 py-1 rounded-md bg-[#047857] text-white font-bold"
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              ref={printContentRef}
              // Force print removal of max-w constraints so the invoice utilizes full width during printing
              className="p-4 sm:p-6 space-y-4 text-[#0f172a] bg-white w-full max-w-[720px] print:max-w-none mx-auto"
            >
              {/* Pharmacy Header & Letterhead */}
              <div className="flex justify-between items-start pb-2 border-b-2 border-[#cbd5e1]">
                <div>
                  <h1 className="text-base font-black uppercase tracking-tight text-[#064e3b] flex items-center gap-1.5">
                    {CLINIC.logoUrl && (
                      <img
                        src={CLINIC.logoUrl}
                        alt="Clinic logo"
                        className="h-6 w-6 object-contain shrink-0"
                      />
                    )}
                    {CLINIC.name}
                  </h1>
                  <p className="text-[10px] text-slate-600 leading-tight max-w-[280px] mt-1">
                    {CLINIC.footerAddress}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-0.5 rounded font-black text-[9px] tracking-wider uppercase border bg-[#ecfdf5] text-[#047857] border-[#cbd5e1]">
                    PHARMACY INVOICE
                  </span>
                  <p className="text-[9.5px] text-slate-600 font-mono mt-1 font-semibold">
                    {CLINIC.tagline}
                  </p>
                  <p className="text-[9.5px] text-slate-600 font-mono font-semibold">
                    GSTIN: 29ABBFV4474H1ZS
                  </p>
                </div>
              </div>

              {/* Status alerts */}
              {returnStatus !== "NONE" && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 border rounded-md px-3 py-1.5 text-[10px] font-bold ${RETURN_STATUS_META[returnStatus]?.className || ""}`}
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
                <div className="no-print bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5 text-emerald-700 text-[10px] font-bold">
                  Editing saved invoice ({invoiceNumber}).
                </div>
              )}
              {saveError && (
                <div className="no-print bg-rose-50 border border-rose-200 rounded-md px-3 py-1.5 text-rose-600 text-[10px] font-bold">
                  {saveError}
                </div>
              )}

              {/* Patient & Bill Meta Ribbon */}
              <div className="grid grid-cols-2 gap-2 my-2 p-1.5 rounded border text-[10.5px] bg-[#ecfdf5] border-[#cbd5e1]">
                <div>
                  <p>
                    <strong>Patient:</strong>{" "}
                    <span className="font-semibold">{chosenPatient.name}</span>
                  </p>
                  <p>
                    <strong>Type:</strong>{" "}
                    <span>
                      {chosenPatient.__manual
                        ? "Walk-in"
                        : `OPD #${chosenPatient.serialNumber || "—"}`}
                    </span>
                  </p>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <p>
                    <strong>Bill #:</strong>{" "}
                    <span className="font-bold text-[#047857]">
                      {invoiceNumber || "—"}
                    </span>
                  </p>
                  <p>
                    <strong>Date:</strong> <span>{fmtDate(invoiceDate)}</span>
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div className="rounded border bg-white mb-2 border-[#cbd5e1] overflow-visible">
                <table className="w-full text-left border-collapse text-[10.5px]">
                  <thead>
                    <tr className="text-white font-bold uppercase text-[8.5px] tracking-wider bg-[#064e3b]">
                      <th className="py-1 px-1.5 w-6 text-center border-r border-[#047857]">
                        #
                      </th>
                      <th className="py-1 px-1.5 border-r border-[#047857]">
                        Medicine Trade Description
                      </th>
                      <th className="py-1 px-1.5 text-center border-r border-[#047857] w-16">
                        Qty
                      </th>
                      <th className="py-1 px-1.5 text-right border-r border-[#047857] w-20">
                        Rate
                      </th>
                      <th className="py-1 px-1.5 text-right pr-2 w-24">
                        Total
                      </th>
                      <th className="w-6 no-print bg-slate-100"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((r, i) => (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50 transition border-b border-slate-200"
                      >
                        <td className="py-1 px-1.5 text-center font-mono font-bold text-slate-500 text-[10px] align-top">
                          {i + 1}
                        </td>
                        <td className="py-1 px-1.5 font-medium relative align-top">
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
                            placeholder="Type medicine..."
                            className="w-full bg-transparent border border-slate-200 rounded px-1.5 py-0.5 text-[10.5px] focus:outline-none focus:border-[#047857]"
                          />
                          {activeSearchRowId === r.id &&
                            r.description.trim() && (
                              <div className="no-print absolute z-20 left-0 mt-1 w-64 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {medicinesLoading ? (
                                  <div className="px-3 py-2 text-[10px] text-slate-400 font-medium">
                                    Loading...
                                  </div>
                                ) : suggestionsFor(r).length === 0 ? (
                                  <div className="px-3 py-2 text-[10px] text-slate-400 font-medium">
                                    No matches — will stay free-text.
                                  </div>
                                ) : (
                                  suggestionsFor(r).map((med) => {
                                    const isOOS = med.quantity <= 0;
                                    return (
                                      <button
                                        key={med.id}
                                        type="button"
                                        disabled={isOOS}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() =>
                                          selectMedicineForRow(r.id, med)
                                        }
                                        className={`w-full text-left px-3 py-2 transition-colors ${
                                          isOOS
                                            ? "opacity-50 cursor-not-allowed bg-rose-50"
                                            : "hover:bg-slate-50"
                                        }`}
                                      >
                                        <div className="flex justify-between items-start">
                                          <div className="font-bold text-slate-900 text-[10px]">
                                            {med.drugName}
                                          </div>
                                          {isOOS && (
                                            <span className="text-[9px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                                              Out of Stock
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[9px] text-slate-500 font-medium mt-0.5">
                                          Batch {med.batchNumber} · ₹
                                          {(
                                            med.sellingPricePerTablet || 0
                                          ).toFixed(2)}
                                          /tab
                                          {!isOOS &&
                                            ` · ${med.quantity} in stock`}
                                        </div>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}
                        </td>
                        <td className="py-1 px-1.5 text-center font-bold font-mono text-[11px] align-top">
                          <input
                            type="number"
                            value={r.qty}
                            onChange={(e) =>
                              updateRow(r.id, "qty", e.target.value)
                            }
                            className={`w-full bg-transparent border rounded px-1.5 py-0.5 text-center text-[10.5px] focus:outline-none ${
                              r.maxStock !== undefined && r.qty > r.maxStock
                                ? "border-rose-500 text-rose-600"
                                : "border-slate-200 focus:border-[#047857]"
                            }`}
                          />
                          {r.maxStock !== undefined && r.qty > r.maxStock && (
                            <div className="text-[8px] text-rose-500 normal-case leading-tight mt-0.5 whitespace-nowrap">
                              Max: {r.maxStock}
                            </div>
                          )}
                        </td>
                        <td className="py-1 px-1.5 text-right font-mono text-[10px] align-top">
                          <input
                            type="number"
                            value={r.rate}
                            onChange={(e) =>
                              updateRow(r.id, "rate", e.target.value)
                            }
                            className="w-full bg-transparent border border-slate-200 rounded px-1.5 py-0.5 text-right text-[10.5px] focus:outline-none focus:border-[#047857]"
                          />
                        </td>
                        <td className="py-1 px-1.5 text-right font-mono font-bold text-slate-900 text-[11px] pr-2 align-top">
                          {fmtINR((Number(r.qty) || 0) * (Number(r.rate) || 0))}
                          {Number(r.returnedQty) > 0 && (
                            <div className="text-[8px] font-bold text-amber-600 normal-case mt-0.5">
                              ↩ {r.returnedQty} ret.
                            </div>
                          )}
                        </td>
                        <td className="py-1 px-1 no-print align-top text-center">
                          <button
                            onClick={() => removeRow(r.id)}
                            className="text-slate-300 hover:text-rose-500 p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bg-white border-t border-slate-200 p-1 no-print">
                  <button
                    onClick={addRow}
                    className="flex items-center gap-1 text-[10px] font-bold text-[#047857] px-2"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>
              </div>

              {/* Summary & Net Total Grid */}
              <div className="grid grid-cols-12 gap-3 pt-2 border-t border-[#cbd5e1] items-start">
                <div className="col-span-6 text-[9.5px] font-mono text-slate-500 space-y-1">
                  <p>
                    Terms: Medicines once sold cannot be returned or exchanged.
                  </p>

                  <div className="pt-2 grid grid-cols-2 gap-2 text-xs font-sans pr-4">
                    <div>
                      <div className="text-slate-400 text-[9px] uppercase font-bold mb-0.5">
                        Pay Mode
                      </div>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-[10px] focus:outline-none focus:border-[#047857]"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[9px] uppercase font-bold mb-0.5">
                        Notes
                      </div>
                      <input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ref..."
                        className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-[10px] focus:outline-none focus:border-[#047857]"
                      />
                    </div>
                  </div>
                </div>

                <div className="col-span-6 rounded p-2 font-mono text-[11px] bg-[#ecfdf5] border border-[#cbd5e1] space-y-1.5">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Gross Subtotal:</span>
                    <span className="font-semibold text-slate-800">
                      {fmtINR(subtotal)}
                    </span>
                  </div>

                  {/* Conditionally hide Discount block on print if it's 0 */}
                  <div
                    className={`flex justify-between items-center text-[#047857] font-medium ${Number(discountVal) === 0 ? "print:hidden print-hide" : ""}`}
                  >
                    <span>Discount (₹):</span>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-20 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right focus:outline-none focus:border-[#047857]"
                    />
                  </div>

                  <div className="flex justify-between items-center text-slate-600 font-medium">
                    <span>Paid (₹):</span>
                    <input
                      type="number"
                      value={paid}
                      onChange={(e) => setPaid(e.target.value)}
                      className="w-20 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-right focus:outline-none focus:border-[#047857]"
                    />
                  </div>
                  <div className="pt-1.5 border-t border-[#cbd5e1] flex justify-between items-end font-black text-xs text-[#047857] font-sans">
                    <span>NET PAYABLE:</span>
                    <span className="font-mono text-sm">
                      {fmtINR(grandTotal)}
                    </span>
                  </div>
                  {balance > 0 && (
                    <div className="flex justify-between items-end font-black text-[10px] text-rose-600 font-sans pt-0.5">
                      <span>BALANCE:</span>
                      <span className="font-mono text-xs">
                        {fmtINR(balance)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Controls */}
              <div className="no-print flex flex-wrap justify-end gap-2 pt-4 border-t border-slate-200 mt-4">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-md text-xs font-bold border border-slate-200 text-slate-600 bg-white"
                >
                  Close
                </button>
                {savedInvoiceId && (
                  <button
                    onClick={startNewInvoice}
                    className="px-5 py-2 rounded-md text-xs font-bold border border-slate-200 text-slate-600 bg-white"
                  >
                    New Invoice
                  </button>
                )}
                <button
                  onClick={savedInvoiceId ? handleUpdate : handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs disabled:opacity-50"
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
                  className="flex items-center gap-2 bg-[#047857] hover:bg-[#065f46] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
                >
                  <Printer className="w-4 h-4" /> Print / PDF
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
