// client/src/pages/ipd/IPDPatientDetails.jsx
import { useState, useRef } from "react";
import { SectionCard, StatusBadge, PageHeader } from "../../components/UI";
import InvoiceModal from "../../components/InvoiceModal";
import { uploadDocument, deleteDocument } from "./api/ipd.api";
import {
  ArrowLeft,
  User,
  BedDouble,
  CreditCard,
  BarChart3,
  FlaskConical,
  Paperclip,
  Upload,
  Trash2,
  Receipt,
} from "lucide-react";

const docTypes = ["Prescription", "Lab Report", "Scan Report", "Hospital Bill"];

export default function IPDPatientDetails({
  patient: initP,
  onBack,
  readOnly = false,
}) {
  const [p, setP] = useState(initP);
  const fileRef = useRef();
  const [docType, setDocType] = useState("Prescription");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [invoicing, setInvoicing] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const doc = await uploadDocument(p.id, file, docType);
      setP((prev) => ({
        ...prev,
        documents: [doc, ...(prev.documents || [])],
      }));
    } catch (err) {
      setError(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const deleteDoc = async (id) => {
    try {
      await deleteDocument(p.id, id);
      setP((prev) => ({
        ...prev,
        documents: prev.documents.filter((d) => d.id !== id),
      }));
    } catch (err) {
      setError(err.message || "Failed to delete document");
    }
  };

  const isImage = (ft) => ft && ft.startsWith("image");

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={p.name}
        subtitle={`IPD No: #${p.serialNumber || "—"}`}
        action={
          <div className="flex items-center gap-2">
            {!readOnly && (
              <button
                onClick={() => setInvoicing(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold shadow-xs"
              >
                <Receipt className="w-4 h-4" /> Generate Invoice
              </button>
            )}
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold"
            >
              <ArrowLeft className="w-4 h-4" /> Back to List
            </button>
          </div>
        }
      />

      {invoicing && (
        <InvoiceModal
          type="IPD"
          patient={p}
          onClose={() => setInvoicing(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-6xl">
        <SectionCard title="Personal Information" icon={User}>
          <div className="grid grid-cols-2 gap-3 text-xs font-medium">
            {[
              { label: "Name", val: p.name },
              { label: "Age", val: `${p.age} years` },
              { label: "Gender", val: p.gender },
              { label: "Phone", val: p.phone },
              { label: "Aadhar", val: p.aadhar },
              { label: "Status", val: <StatusBadge status={p.status} /> },
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

        <SectionCard title="Admission Information" icon={BedDouble}>
          <div className="grid grid-cols-2 gap-3 text-xs font-medium">
            {[
              {
                label: "Admission Date",
                val: p.admissionDate
                  ? new Date(p.admissionDate).toLocaleDateString()
                  : "—",
              },
              { label: "Admission Time", val: p.admissionTime },
              {
                label: "Expected Stay",
                val: p.expectedDays ? `${p.expectedDays} days` : "—",
              },
              {
                label: "Discharge Date",
                val: p.dischargeDate
                  ? new Date(p.dischargeDate).toLocaleDateString()
                  : "—",
              },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                  {item.label}
                </div>
                <div className="text-slate-900 dark:text-white font-extrabold">
                  {item.val}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Payment Information" icon={CreditCard}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Deposit", val: `₹${p.deposit?.toLocaleString()}` },
              { label: "Cash", val: `₹${p.cash?.toLocaleString()}` },
              { label: "UPI", val: `₹${p.upi?.toLocaleString()}` },
              { label: "Total Paid", val: `₹${p.totalPaid?.toLocaleString()}` },
              { label: "Total Stay", val: `₹${p.totalStay?.toLocaleString()}` },
              { label: "Balance", val: `₹${p.balance?.toLocaleString()}` },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800"
              >
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
                  {item.label}
                </div>
                <div className="font-extrabold text-xs text-slate-900 dark:text-white">
                  {item.val}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Documents" icon={Paperclip}>
          {!readOnly && (
            <div className="flex gap-2 mb-4">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
              >
                {docTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="bg-[#0f4a29] text-white px-4 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" /> Upload File
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={handleFile}
                accept="image/*,.pdf"
              />
            </div>
          )}

          {!p.documents || p.documents.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4 font-medium">
              No documents uploaded.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {p.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5"
                >
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#0f4a29] dark:text-[#52b788] truncate block"
                  >
                    {doc.name}
                  </a>
                  <span className="text-[10px] text-slate-400 font-medium block">
                    {doc.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}