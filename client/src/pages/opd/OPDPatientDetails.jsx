// client/src/pages/opd/OPDPatientDetails.jsx
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  User,
  CreditCard,
  CalendarClock,
  FileText,
  Stethoscope,
  Bell,
  Save,
  Loader2,
  Pill,
  Plus,
  Trash2,
  AlertTriangle,
  Receipt,
  ArrowRightLeft,
  ShieldCheck,
} from "lucide-react";
import { SectionCard, StatusBadge, PageHeader } from "../../components/UI";
import InvoiceModal from "../../components/InvoiceModal";
import ProformaInvoiceModal from "../../components/ProformaInvoiceModal";
import { fetchPatientInvoice } from "../../api/invoice.api";
import { fmtDate, fmtINR } from "../../lib/dateFormat";
import { api } from "../../lib/api";

const followUpStatusColors = {
  Pending:
    "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  Completed:
    "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20",
  Missed:
    "bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-200",
};

export default function OPDPatientDetails({
  patient: initP,
  onBack,
  onUpdated,
  isDoctor = false,
}) {
  // `patient` is required, but read every field through optional chaining so
  // a missing prop renders the "no patient" notice below instead of throwing
  // during the very first render. Hooks can't be skipped with an early
  // return, so the guard has to live in the initialisers themselves.
  const [p, setP] = useState(initP || null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [doctorForm, setDoctorForm] = useState({
    diagnosis: initP?.diagnosis || "",
    prescription: initP?.prescription || "",
    doctorNotes: initP?.doctorNotes || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [error, setError] = useState("");

  const [medicineOptions, setMedicineOptions] = useState([]);
  const [medicinesLoading, setMedicinesLoading] = useState(true);
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [rxQuantity, setRxQuantity] = useState("");
  const [rxDosage, setRxDosage] = useState("");
  const [rxSaving, setRxSaving] = useState(false);
  const [rxError, setRxError] = useState("");
  const [deletingRxId, setDeletingRxId] = useState(null);
  const [invoicing, setInvoicing] = useState(false);
  const [proforma, setProforma] = useState(false);
  const [movingToIPD, setMovingToIPD] = useState(false);

  // Each OPD patient has exactly one invoice. Knowing whether it exists and
  // whether it's locked drives the button label and the status pill below.
  const [invoice, setInvoice] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(true);

  const loadInvoice = () => {
    if (!initP?.id) {
      setInvoiceLoading(false);
      return;
    }
    setInvoiceLoading(true);
    fetchPatientInvoice("OPD", initP.id)
      .then(setInvoice)
      .catch(() => setInvoice(null))
      .finally(() => setInvoiceLoading(false));
  };

  useEffect(() => {
    loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initP?.id]);

  const invoiceLocked = invoice?.status === "FINALIZED";

  useEffect(() => {
    if (!initP?.id) {
      setLoadingPatient(false);
      return;
    }
    (async () => {
      setLoadingPatient(true);
      try {
        const { patient } = await api.get(`/opd/patients/${initP.id}`);
        setP(patient);
      } catch (err) {
        setError(err.message || "Could not load latest patient data.");
      } finally {
        setLoadingPatient(false);
      }
    })();
  }, [initP?.id]);

  useEffect(() => {
    (async () => {
      setMedicinesLoading(true);
      try {
        const { medicines } = await api.get("/pharmacy/medicines");
        setMedicineOptions(medicines);
      } catch (err) {
        setRxError(err.message || "Could not load medicine list.");
      } finally {
        setMedicinesLoading(false);
      }
    })();
  }, []);

  // Reached when this component is mounted without a patient — usually a
  // routing/import mistake (e.g. the wrong component exported from a file).
  // A blank screen makes that almost impossible to diagnose, so say what
  // happened.
  if (!p) {
    return (
      <div className="space-y-4 font-sans bg-[#f4f5f7] dark:bg-slate-950 p-6 rounded-3xl">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl px-4 py-3 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            No patient was passed to this screen, so there is nothing to show.
            Go back to the OPD directory and open a patient from the list.
          </span>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to List
          </button>
        )}
      </div>
    );
  }

  const handleMoveToIPD = async () => {
    const confirmed = window.confirm(
      `Move ${p.name} from OPD to IPD? This admits them as an inpatient and removes this record from the OPD list.`,
    );
    if (!confirmed) return;

    setMovingToIPD(true);
    setError("");
    try {
      await api.post(`/opd/patients/${p.id}/move-to-ipd`, {});
      // Patient no longer exists in OPD once moved, so go back to the list
      // (its refresh-on-return will drop it) instead of trying to re-render
      // this page against a record that's gone.
      onBack();
    } catch (err) {
      setError(err.message || "Could not move patient to IPD.");
    } finally {
      setMovingToIPD(false);
    }
  };

  const persist = async (patch) => {
    const { patient: updated } = await api.put(`/opd/patients/${p.id}`, {
      ...p,
      ...patch,
    });
    setP(updated);
    if (onUpdated) onUpdated(updated);
    return updated;
  };

  const handleDoctorSave = async () => {
    setSaving(true);
    setError("");
    try {
      await persist(doctorForm);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Could not save notes.");
    } finally {
      setSaving(false);
    }
  };

  const handleFollowUpStatus = async (status) => {
    setStatusSaving(true);
    setError("");
    try {
      await persist({ followUpStatus: status });
    } catch (err) {
      setError(err.message || "Could not update follow-up status.");
    } finally {
      setStatusSaving(false);
    }
  };

  const handleAddPrescription = async () => {
    setRxError("");
    if (!selectedMedicineId) {
      setRxError("Select a medicine.");
      return;
    }
    const qty = parseInt(rxQuantity, 10);
    if (!qty || qty <= 0) {
      setRxError("Enter a valid quantity.");
      return;
    }

    setRxSaving(true);
    try {
      const { patient: updated } = await api.post(
        `/opd/patients/${p.id}/prescriptions`,
        {
          medicineId: selectedMedicineId,
          quantity: qty,
          dosageInstructions: rxDosage.trim(),
        },
      );
      setP(updated);
      if (onUpdated) onUpdated(updated);
      const { medicines } = await api.get("/pharmacy/medicines");
      setMedicineOptions(medicines);
      setSelectedMedicineId("");
      setRxQuantity("");
      setRxDosage("");
    } catch (err) {
      setRxError(err.message || "Could not add prescribed medicine.");
    } finally {
      setRxSaving(false);
    }
  };

  const handleDeletePrescription = async (itemId) => {
    setDeletingRxId(itemId);
    setRxError("");
    try {
      await api.del(`/opd/patients/${p.id}/prescriptions/${itemId}`);
      setP((prev) => ({
        ...prev,
        prescribedMedicines: prev.prescribedMedicines.filter(
          (pm) => pm.id !== itemId,
        ),
      }));
      if (onUpdated)
        onUpdated({
          ...p,
          prescribedMedicines: p.prescribedMedicines.filter(
            (pm) => pm.id !== itemId,
          ),
        });
    } catch (err) {
      setRxError(err.message || "Could not delete this prescription record.");
    } finally {
      setDeletingRxId(null);
    }
  };

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={p.name}
        subtitle={`OPD Token: #${p.serialNumber || "—"}`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleMoveToIPD}
              disabled={movingToIPD}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-xs"
            >
              {movingToIPD ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="w-4 h-4" />
              )}
              Move to IPD
            </button>
            <button
              onClick={() => setProforma(true)}
              title="See and print the bill as it stands"
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold"
            >
              <FileText className="w-4 h-4" /> Proforma Invoice
            </button>
            <button
              onClick={() => setInvoicing(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold shadow-xs"
            >
              <Receipt className="w-4 h-4" />
              {invoiceLocked
                ? "View Invoice"
                : invoice
                  ? "Edit Invoice"
                  : "Generate Invoice"}
            </button>
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold"
            >
              <ArrowLeft className="w-4 h-4" /> Back to List
            </button>
          </div>
        }
      />

      {/* One invoice per patient — its state is shown here because a draft
          can still be edited, while a finalized bill is locked for good. */}
      {!invoiceLoading && (
        <div className="-mt-2">
          {invoiceLocked ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-3 py-1 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border border-[#0f4a29]/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Invoice {invoice.invoiceNumber} finalized ·{" "}
              {fmtDate(invoice.finalizedAt)} · {fmtINR(invoice.grandTotal)}
            </span>
          ) : invoice ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <Receipt className="w-3.5 h-3.5" />
              Invoice {invoice.invoiceNumber} — draft, still editable
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              <Receipt className="w-3.5 h-3.5" />
              No invoice generated yet
            </span>
          )}
        </div>
      )}

      {invoicing && (
        <InvoiceModal
          type="OPD"
          patient={p}
          onClose={() => {
            setInvoicing(false);
            loadInvoice();
          }}
        />
      )}

      {proforma && (
        <ProformaInvoiceModal
          type="OPD"
          patient={p}
          onClose={() => setProforma(false)}
        />
      )}

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 ">
        <SectionCard title="Personal Information" icon={User}>
          <div className="grid grid-cols-2 gap-3 text-xs font-medium">
            {[
              { label: "Token No.", val: `#${p.serialNumber}` },
              { label: "Name", val: p.name },
              { label: "Age", val: `${p.age} years` },
              { label: "Gender", val: p.gender },
              { label: "Place", val: p.place },
              { label: "Phone", val: p.phone },
              { label: "Visit Date", val: fmtDate(p.visitDate) },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                  {item.label}
                </div>
                <div className="text-slate-900 dark:text-white font-extrabold">
                  {item.val || "—"}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Payment Information" icon={CreditCard}>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-3 text-center">
              <div className="font-extrabold text-base text-amber-700">
                {fmtINR(p.cash)}
              </div>
              <div className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">
                Cash
              </div>
            </div>
            <div className="bg-[#0f4a29]/10 border border-[#0f4a29]/20 rounded-2xl p-3 text-center">
              <div className="font-extrabold text-base text-[#0f4a29] dark:text-[#52b788]">
                {fmtINR(p.upi)}
              </div>
              <div className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">
                UPI
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-3 text-center">
              <div className="font-extrabold text-base text-slate-900 dark:text-white">
                {fmtINR(p.total)}
              </div>
              <div className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">
                Total Paid
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Follow-Up & Clinical Notes" icon={CalendarClock}>
          <div className="space-y-3 text-xs font-medium">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                  Follow-Up Date
                </div>
                <div className="text-slate-900 dark:text-white font-extrabold">
                  {p.followUpDate ? fmtDate(p.followUpDate) : "Not scheduled"}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                  Condition
                </div>
                <StatusBadge status={p.condition || "Stable"} />
              </div>
            </div>

            <div>
              <div className="text-slate-400 text-[10px] uppercase font-bold mb-1.5">
                Update Status
              </div>
              <div className="flex gap-2 flex-wrap">
                {["Pending", "Completed", "Missed"].map((s) => (
                  <button
                    key={s}
                    disabled={statusSaving}
                    onClick={() => handleFollowUpStatus(s)}
                    className={`px-3 py-1 rounded-full text-xs font-extrabold border transition-all ${p.followUpStatus === s
                        ? followUpStatusColors[s]
                        : "bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700"
                      }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Prescribed Medicines" icon={Pill}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={selectedMedicineId}
                onChange={(e) => setSelectedMedicineId(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
              >
                <option value="">Select Tablet...</option>
                {medicineOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.drugName} ({m.quantity} in stock)
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={rxQuantity}
                onChange={(e) => setRxQuantity(e.target.value)}
                placeholder="Qty"
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
              />
              <button
                onClick={handleAddPrescription}
                className="py-2 bg-[#0f4a29] text-white text-xs font-extrabold rounded-full shadow-xs"
              >
                + Add
              </button>
            </div>

            <div className="space-y-2">
              {(p.prescribedMedicines || []).map((pm) => (
                <div
                  key={pm.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {pm.drugName} × {pm.quantity}
                  </span>
                  <button
                    onClick={() => handleDeletePrescription(pm.id)}
                    className="text-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

      </div>
    </div>
  );
}