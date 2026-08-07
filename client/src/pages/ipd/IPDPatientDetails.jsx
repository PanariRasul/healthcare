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
  Paperclip,
  Upload,
  Trash2,
  Receipt,
  Pencil,
  Clock,
  Wallet,
  Pill,
  Bell,
  Utensils,
  FileText,
} from "lucide-react";

const docTypes = ["Prescription", "Lab Report", "Scan Report", "Hospital Bill"];

// ---- small display helpers ----
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const fmtMoney = (n) => `₹${(Number(n) || 0).toLocaleString()}`;
const dash = (v) => (v === null || v === undefined || v === "" ? "—" : v);

// Compact "label / value" grid, reused across sections so every field the
// form collects has somewhere to show up on the details page.
function InfoGrid({ items, cols = "grid-cols-2" }) {
  return (
    <div className={`grid ${cols} gap-3 text-xs font-medium`}>
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
            {item.label}
          </div>
          <div className="text-slate-900 dark:text-white font-extrabold">
            {item.val ?? "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, val }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
      <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
        {label}
      </div>
      <div className="font-extrabold text-xs text-slate-900 dark:text-white">
        {val}
      </div>
    </div>
  );
}

export default function IPDPatientDetails({
  patient: initP,
  onBack,
  onEdit,
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

  const dailyCharges = p.dailyCharges || [];
  const additionalCharges = p.additionalCharges || [];
  const medicines = p.medicines || [];
  const hasFollowUp =
    p.followUpDate || p.condition || p.followUpDesc || p.reminderEnabled;

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={p.name}
        subtitle={`IPD No: #${p.serialNumber || "—"}`}
        action={
          <div className="flex items-center gap-2">
            {!readOnly && (
              <>
                <button
                  onClick={() => onEdit?.(p)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={() => setInvoicing(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold shadow-xs"
                >
                  <Receipt className="w-4 h-4" /> Generate Invoice
                </button>
              </>
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

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-6xl">
        <SectionCard title="Personal Information" icon={User}>
          <InfoGrid
            items={[
              { label: "Name", val: p.name },
              { label: "Age", val: `${p.age} years` },
              { label: "Gender", val: p.gender },
              { label: "Phone", val: dash(p.phone) },
              { label: "Aadhar", val: dash(p.aadhar) },
              { label: "Status", val: <StatusBadge status={p.status} /> },
            ]}
          />
        </SectionCard>

        <SectionCard title="Admission & Discharge" icon={BedDouble}>
          <InfoGrid
            items={[
              { label: "Admission Date", val: fmtDate(p.admissionDate) },
              { label: "Admission Time", val: dash(p.admissionTime) },
              {
                label: "Expected Stay",
                val: p.expectedDays ? `${p.expectedDays} days` : "—",
              },
              { label: "Discharge Date", val: fmtDate(p.dischargeDate) },
              { label: "Discharge Time", val: dash(p.dischargeTime) },
              {
                label: "Discharge Status",
                val: <StatusBadge status={p.dischargeStatus} />,
              },
            ]}
          />
        </SectionCard>

        {hasFollowUp && (
          <SectionCard title="Follow-up & Reminders" icon={Bell}>
            <InfoGrid
              items={[
                { label: "Follow-up Date", val: fmtDate(p.followUpDate) },
                { label: "Condition", val: dash(p.condition) },
                {
                  label: "Follow-up Status",
                  val: <StatusBadge status={p.followUpStatus} />,
                },
                {
                  label: "Reminder",
                  val: p.reminderEnabled ? "Enabled" : "Disabled",
                },
                {
                  label: "Reminder Status",
                  val: <StatusBadge status={p.reminderStatus} />,
                },
                {
                  label: "Reminder Sent",
                  val: fmtDate(p.reminderSentDate),
                },
              ]}
            />
            {p.followUpDesc && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">
                  Follow-up Notes
                </div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {p.followUpDesc}
                </div>
              </div>
            )}
          </SectionCard>
        )}

        <SectionCard title="Payment Information" icon={CreditCard}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile label="Deposit" val={fmtMoney(p.deposit)} />
            <StatTile label="Cash" val={fmtMoney(p.cash)} />
            <StatTile label="UPI" val={fmtMoney(p.upi)} />
            <StatTile label="Card" val={fmtMoney(p.card)} />
            <StatTile label="Total Paid" val={fmtMoney(p.totalPaid)} />
            <StatTile label="Total Stay" val={fmtMoney(p.totalStay)} />
            <StatTile label="Balance" val={fmtMoney(p.balance)} />
            <StatTile
              label="Settlement"
              val={<StatusBadge status={p.settlementStatus} />}
            />
          </div>
        </SectionCard>

        <SectionCard title="Diet & Supplements" icon={Utensils}>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Oil" val={dash(p.oil)} />
            <StatTile label="Protein" val={dash(p.protein)} />
            <StatTile label="Syrup" val={dash(p.syrup)} />
          </div>
        </SectionCard>

        <SectionCard title="Daily / Room Charges" icon={Clock}>
          {dailyCharges.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4 font-medium">
              No room charges recorded.
            </p>
          ) : (
            <div className="space-y-2">
              {dailyCharges.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-4 gap-2 items-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 text-xs font-medium"
                >
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Date
                    </div>
                    <div className="font-extrabold">{fmtDate(c.date)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Days
                    </div>
                    <div className="font-extrabold">{c.days}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Rate / Day
                    </div>
                    <div className="font-extrabold">{fmtMoney(c.rate)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Amount
                    </div>
                    <div className="font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                      {fmtMoney(c.amount)}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-500">
                  Room Charges Total:{" "}
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {fmtMoney(
                      dailyCharges.reduce((s, c) => s + (c.amount || 0), 0),
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Additional Charges" icon={Wallet}>
          {additionalCharges.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4 font-medium">
              No additional charges recorded.
            </p>
          ) : (
            <div className="space-y-2">
              {additionalCharges.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-4 gap-2 items-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 text-xs font-medium"
                >
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Label
                    </div>
                    <div className="font-extrabold">{c.label}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Type
                    </div>
                    <div className="font-extrabold">
                      {c.chargeType === "PER_DAY" ? "Per Day" : "One-Time"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Rate{c.chargeType === "PER_DAY" ? ` × ${c.days}d` : ""}
                    </div>
                    <div className="font-extrabold">{fmtMoney(c.rate)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Amount
                    </div>
                    <div className="font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                      {fmtMoney(c.amount)}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-500">
                  Additional Charges Total:{" "}
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {fmtMoney(
                      additionalCharges.reduce(
                        (s, c) => s + (c.amount || 0),
                        0,
                      ),
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Prescribed Medicines" icon={Pill}>
          {medicines.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4 font-medium">
              No medicines prescribed.
            </p>
          ) : (
            <div className="space-y-2">
              {medicines.map((m) => (
                <div
                  key={m.id}
                  className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {m.name} × {m.quantity} {m.unit}
                    </span>
                  </div>
                  {(m.dosage ||
                    m.frequency ||
                    m.duration ||
                    m.instructions) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      {m.dosage && <span>Dosage: {m.dosage}</span>}
                      {m.frequency && <span>Frequency: {m.frequency}</span>}
                      {m.duration && <span>Duration: {m.duration}</span>}
                      {m.instructions && (
                        <span>Instructions: {m.instructions}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {p.notes && (
          <SectionCard title="Notes" icon={FileText}>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {p.notes}
            </p>
          </SectionCard>
        )}

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
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc.id)}
                      className="mt-1 text-[10px] font-bold text-rose-500 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
