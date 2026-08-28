// client/src/pages/ipd/IPDPatientDetails.jsx
import { useState, useRef } from "react";
import { SectionCard, StatusBadge, PageHeader } from "../../components/UI";
import InvoiceModal from "../../components/InvoiceModal";
import DischargeModal from "./DischargeModal";
import { uploadDocument, deleteDocument, fetchPatient } from "./api/ipd.api";
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
  Bell,
  Utensils,
  FileText,
  DoorOpen,
} from "lucide-react";

const docTypes = ["Prescription", "Lab Report", "Scan Report", "Hospital Bill"];

// ---- small display helpers ----
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";
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

// "Swipe" style toggle switch for the Discharge action. Off = Admitted, On
// = Discharged. Clicking it doesn't discharge immediately — it opens the
// confirmation modal (which asks for the discharge date), so a single
// accidental tap can't discharge someone by mistake.
function DischargeToggle({ discharged, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={discharged}
      title={discharged ? "Undo Discharge" : "Discharge Patient"}
      className="flex items-center gap-2.5 px-3 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-extrabold"
    >
      <DoorOpen
        className={`w-4 h-4 ${
          discharged ? "text-[#0f4a29] dark:text-[#52b788]" : "text-slate-400"
        }`}
      />
      <span className="text-slate-700 dark:text-slate-300">
        {discharged ? "Discharged" : "Discharge"}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          discharged ? "bg-[#0f4a29]" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`absolute left-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            discharged ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
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
  const [discharging, setDischarging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleDischargeModalClosed = async (didChange) => {
    setDischarging(false);
    if (!didChange) return;
    setRefreshing(true);
    try {
      const fresh = await fetchPatient(p.id);
      setP(fresh);
    } catch (err) {
      setError(
        err.message || "Discharge saved, but the page failed to refresh.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const dailyCharges = p.dailyCharges || [];
  const additionalCharges = p.additionalCharges || [];
  const hasFollowUp =
    p.followUpDate || p.condition || p.followUpDesc || p.reminderEnabled;

  // --- Financial Computations ---
  const totalStay = dailyCharges.reduce(
    (s, c) => s + (parseFloat(c.amount) || 0),
    0,
  );

  const additionalChargesGross = additionalCharges.reduce(
    (s, c) => s + (parseFloat(c.amount) || 0),
    0,
  );

  const additionalChargesPaid = additionalCharges.reduce(
    (s, c) => s + (parseFloat(c.amountPaid) || 0),
    0,
  );

  const additionalChargesNet = Math.max(
    0,
    additionalChargesGross - additionalChargesPaid,
  );

  const grandGrossTotal = totalStay + additionalChargesGross;
  // Use DB totalPaid which natively tracks actual Payments Ledger via Modal
  const basePaid = parseFloat(p.totalPaid) || 0;
  const totalPaymentsOverall = basePaid + additionalChargesPaid;
  const estimatedBalance = grandGrossTotal - totalPaymentsOverall;

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={p.name}
        subtitle={`IPD No: #${p.serialNumber || "—"}`}
        action={
          <div className="flex items-center gap-2">
            {!readOnly && (
              <>
                <DischargeToggle
                  discharged={p.status === "Discharged"}
                  onClick={() => setDischarging(true)}
                />
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

      {refreshing && (
        <div className="-mt-4 text-[11px] font-bold text-slate-400">
          Updating discharge status...
        </div>
      )}

      {p.fromOPD && (
        <div className="-mt-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase px-3 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            Moved from OPD
          </span>
        </div>
      )}

      {invoicing && (
        <InvoiceModal
          type="IPD"
          patient={p}
          onClose={() => setInvoicing(false)}
        />
      )}

      {discharging && (
        <DischargeModal patient={p} onClose={handleDischargeModalClosed} />
      )}

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Personal Information" icon={User}>
          <InfoGrid
            items={[
              { label: "Name", val: p.name },
              { label: "Age", val: `${p.age} years` },
              { label: "Gender", val: p.gender },
              { label: "Phone", val: dash(p.phone) },
              { label: "Aadhar", val: dash(p.aadhar) },
              { label: "Status", val: <StatusBadge status={p.status} /> },
              { label: "Address", val: dash(p.address) },
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

        <SectionCard title="Diet & Supplements" icon={Utensils}>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Oil" val={dash(p.oil)} />
            <StatTile label="Protein" val={dash(p.protein)} />
            <StatTile label="Syrup" val={dash(p.syrup)} />
          </div>
        </SectionCard>

        <SectionCard
          title="Per Day Bed Charges / Per Day Treatment Charges"
          icon={Clock}
        >
          {dailyCharges.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4 font-medium">
              No room charges recorded.
            </p>
          ) : (
            <div className="space-y-2">
              {dailyCharges.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-5 gap-2 items-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 text-xs font-medium"
                >
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      From Date
                    </div>
                    <div className="font-extrabold">
                      {fmtDate(c.date || c.fromDate)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      To Date
                    </div>
                    <div className="font-extrabold">{fmtDate(c.toDate)}</div>
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
                  <div className="text-right">
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
                    {fmtMoney(totalStay)}
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
            <div className="space-y-4">
              {additionalCharges.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 flex flex-col space-y-3 text-xs font-medium"
                >
                  <div className="grid grid-cols-4 gap-2 items-center">
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
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase font-bold">
                        Amount
                      </div>
                      <div className="font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                        {fmtMoney(c.amount)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center pt-3 border-t border-slate-200 dark:border-slate-700">
                    <div>
                      <div className="text-slate-400 text-[10px] uppercase font-bold">
                        Amount Paid
                      </div>
                      <div className="font-extrabold">
                        {fmtMoney(c.amountPaid)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px] uppercase font-bold">
                        Payment Date
                      </div>
                      <div className="font-extrabold">
                        {fmtDate(c.paymentDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase font-bold">
                        Status
                      </div>
                      <div className="flex justify-end pt-0.5">
                        {c.paymentStatus === "Partial Paid" ? (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded border bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/30">
                            Partial Paid
                          </span>
                        ) : c.paymentStatus === "Paid" ? (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded border bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/30">
                            Paid
                          </span>
                        ) : (
                          <span className="font-extrabold text-slate-600">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-end gap-4 text-xs font-bold text-slate-500 w-full">
                  <span>
                    Gross Total:{" "}
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {fmtMoney(additionalChargesGross)}
                    </span>
                  </span>
                  {additionalChargesPaid > 0 && (
                    <span>
                      Total Paid:{" "}
                      <span className="text-sm font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                        {fmtMoney(additionalChargesPaid)}
                      </span>
                    </span>
                  )}
                  <span>
                    Net Due:{" "}
                    <span className="text-sm font-extrabold text-rose-500">
                      {fmtMoney(additionalChargesNet)}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Payment Information" icon={CreditCard}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatTile label="Deposit" val={fmtMoney(p.deposit)} />
            <StatTile label="Cash" val={fmtMoney(p.cash)} />
            <StatTile label="UPI" val={fmtMoney(p.upi)} />
            <StatTile label="Card" val={fmtMoney(p.card)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Gross Total Charges
              </div>
              <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                {fmtMoney(grandGrossTotal)}
              </div>
              <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                Room: {fmtMoney(totalStay)} | Addtl:{" "}
                {fmtMoney(additionalChargesGross)}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Total Amount Paid
              </div>
              <div className="font-extrabold text-sm text-[#0f4a29] dark:text-[#52b788]">
                {fmtMoney(totalPaymentsOverall)}
              </div>
              <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                Ledger Payments: {fmtMoney(basePaid)} | Addtl Paid:{" "}
                {fmtMoney(additionalChargesPaid)}
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
                {fmtMoney(estimatedBalance)}
              </div>
            </div>
          </div>
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
