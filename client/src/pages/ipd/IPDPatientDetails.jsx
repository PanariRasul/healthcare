// client/src/pages/ipd/IPDPatientDetails.jsx
//
// Adds three things over the previous version:
//   1. Proforma Invoice — a read-only, printable view of the bill as it
//      stands. Doesn't save or change anything.
//   2. Refund — record money handed back to the patient (deposit ₹10,000
//      against a ₹5,000 bill leaves ₹5,000 to return). It shows here and on
//      the invoice; when there's no refund, nothing about refunds appears.
//   3. Invoice status — whether the patient's single invoice is a draft or
//      finalized, since discharge is blocked until it's finalized.
//
// All dates render as dd/mm/yyyy.

import { useEffect, useState, useRef } from "react";
import { SectionCard, StatusBadge, PageHeader } from "../../components/UI";
import InvoiceModal from "../../components/InvoiceModal";
import ProformaInvoiceModal from "../../components/ProformaInvoiceModal";
import DischargeModal from "./DischargeModal";
import IPDRefundModal from "./IPDRefundModal";
import { uploadDocument, deleteDocument, fetchPatient } from "./api/ipd.api";
import { fetchPatientInvoice } from "../../api/invoice.api";
import { fmtDate, fmtDateTime, fmtINR } from "../../lib/dateFormat";
import {
  ArrowLeft,
  User,
  BedDouble,
  CreditCard,
  Paperclip,
  Upload,
  Trash2,
  Receipt,
  FileText,
  Pencil,
  Clock,
  Wallet,
  Bell,
  Utensils,
  DoorOpen,
  Undo2,
  Lock,
  ShieldCheck,
} from "lucide-react";

const docTypes = ["Prescription", "Lab Report", "Scan Report", "Hospital Bill"];

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

function StatTile({ label, val, tone = "default" }) {
  const tones = {
    default:
      "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white",
    refund:
      "bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/30 text-sky-700 dark:text-sky-400",
  };
  return (
    <div className={`rounded-2xl p-3 border ${tones[tone]}`}>
      <div className="text-slate-400 text-[10px] uppercase font-bold mb-0.5">
        {label}
      </div>
      <div className="font-extrabold text-xs">{val}</div>
    </div>
  );
}

// "Swipe" style toggle for the Discharge action. Off = Admitted, On =
// Discharged. Clicking it opens the confirmation modal rather than
// discharging immediately, so one accidental tap can't discharge anyone —
// and that modal blocks discharge until the invoice is finalized.
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
  const [proforma, setProforma] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [discharging, setDischarging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [invoice, setInvoice] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(true);

  const loadInvoice = () => {
    setInvoiceLoading(true);
    fetchPatientInvoice("IPD", p.id)
      .then(setInvoice)
      .catch(() => setInvoice(null))
      .finally(() => setInvoiceLoading(false));
  };

  useEffect(() => {
    loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  const refreshPatient = async () => {
    setRefreshing(true);
    try {
      const fresh = await fetchPatient(p.id);
      setP(fresh);
    } catch (err) {
      setError(err.message || "The page couldn't refresh — reload to be sure.");
    } finally {
      setRefreshing(false);
    }
  };

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
      setError(err.message || "Could not upload that document.");
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
      setError(err.message || "Could not delete that document.");
    }
  };

  const handleDischargeModalClosed = async (didChange) => {
    setDischarging(false);
    if (!didChange) return;
    await refreshPatient();
    loadInvoice();
  };

  const handleRefundClosed = (updated) => {
    setRefunding(false);
    if (updated) {
      setP(updated);
      loadInvoice();
    }
  };

  const dailyCharges = p.dailyCharges || [];
  const additionalCharges = p.additionalCharges || [];
  const hasFollowUp =
    p.followUpDate || p.condition || p.followUpDesc || p.reminderEnabled;

  // --- Financial computations ---
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
  const basePaid = parseFloat(p.totalPaid) || 0;
  const refundAmount = parseFloat(p.refundAmount) || 0;
  const hasRefund = refundAmount > 0;
  const totalPaymentsOverall = basePaid + additionalChargesPaid - refundAmount;
  const estimatedBalance = grandGrossTotal - totalPaymentsOverall;

  // What the clinic is holding over and above the bill.
  const refundable =
    Math.round((basePaid + additionalChargesPaid - refundAmount - grandGrossTotal) * 100) /
    100;

  const invoiceLocked = invoice?.status === "FINALIZED";

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title={p.name}
        subtitle={`IPD No: #${p.serialNumber || "—"}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setProforma(true)}
              title="See and print the bill as it stands"
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold"
            >
              <FileText className="w-4 h-4" /> Proforma Invoice
            </button>
            {!readOnly && (
              <>
                <button
                  onClick={() => setRefunding(true)}
                  title="Record money returned to the patient"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold"
                >
                  <Undo2 className="w-4 h-4" /> Refund
                </button>
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
                  <Receipt className="w-4 h-4" />
                  {invoiceLocked
                    ? "View Invoice"
                    : invoice
                      ? "Edit Invoice"
                      : "Generate Invoice"}
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
          Updating...
        </div>
      )}

      <div className="-mt-4 flex flex-wrap items-center gap-2">
        {p.fromOPD && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase px-3 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            Moved from OPD
          </span>
        )}

        {/* Invoice state — the thing that gates discharge. */}
        {!invoiceLoading &&
          (invoiceLocked ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-3 py-1 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border border-[#0f4a29]/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Invoice {invoice.invoiceNumber} finalized ·{" "}
              {fmtDate(invoice.finalizedAt)}
            </span>
          ) : invoice ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <Receipt className="w-3.5 h-3.5" />
              Invoice {invoice.invoiceNumber} — draft, not yet finalized
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              <Receipt className="w-3.5 h-3.5" />
              No invoice generated yet
            </span>
          ))}

        {hasRefund && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-3 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
            <Undo2 className="w-3.5 h-3.5" />
            {fmtINR(refundAmount)} refunded
          </span>
        )}
      </div>

      {invoicing && (
        <InvoiceModal
          type="IPD"
          patient={p}
          onClose={() => {
            setInvoicing(false);
            loadInvoice();
            refreshPatient();
          }}
        />
      )}

      {proforma && (
        <ProformaInvoiceModal
          type="IPD"
          patient={p}
          onClose={() => setProforma(false)}
        />
      )}

      {refunding && (
        <IPDRefundModal patient={p} onClose={handleRefundClosed} />
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
                { label: "Reminder Sent", val: fmtDate(p.reminderSentDate) },
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
                    <div className="font-extrabold">{fmtDate(c.date)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      To Date
                    </div>
                    <div className="font-extrabold">
                      {c.toDate ? fmtDate(c.toDate) : "Running"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Days
                    </div>
                    <div className="font-extrabold">
                      {c.days}
                      {c.daysManual && (
                        <span
                          title="Entered by hand rather than calculated from the dates"
                          className="ml-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-amber-50 text-amber-600 border-amber-200"
                        >
                          Manual
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Rate / Day
                    </div>
                    <div className="font-extrabold">{fmtINR(c.rate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400 text-[10px] uppercase font-bold">
                      Amount
                    </div>
                    <div className="font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                      {fmtINR(c.amount)}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-500">
                  Room Charges Total:{" "}
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {fmtINR(totalStay)}
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
                      <div className="font-extrabold">{fmtINR(c.rate)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase font-bold">
                        Amount
                      </div>
                      <div className="font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                        {fmtINR(c.amount)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center pt-3 border-t border-slate-200 dark:border-slate-700">
                    <div>
                      <div className="text-slate-400 text-[10px] uppercase font-bold">
                        Amount Paid
                      </div>
                      <div className="font-extrabold">
                        {fmtINR(c.amountPaid)}
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
          )}
        </SectionCard>

        <SectionCard title="Payment Information" icon={CreditCard}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatTile label="Deposit" val={fmtINR(p.deposit)} />
            <StatTile label="Cash" val={fmtINR(p.cash)} />
            <StatTile label="UPI" val={fmtINR(p.upi)} />
            <StatTile label="Card" val={fmtINR(p.card)} />
          </div>

          {/* Refund block — only rendered when a refund exists, or when
              there's an overpayment worth flagging. */}
          {hasRefund ? (
            <div className="mb-4 bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Undo2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Refunded to Patient
                    </div>
                    <div className="font-extrabold text-sm text-sky-700 dark:text-sky-400">
                      {fmtINR(refundAmount)}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                      {p.refundMethod ? `${p.refundMethod} · ` : ""}
                      {fmtDate(p.refundDate)}
                      {p.refundReason ? ` · ${p.refundReason}` : ""}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                      This appears on the invoice.
                    </div>
                  </div>
                </div>
                {!readOnly && (
                  <button
                    onClick={() => setRefunding(true)}
                    className="shrink-0 text-[11px] font-extrabold text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    Change
                  </button>
                )}
              </div>
            </div>
          ) : (
            refundable > 0 &&
            !readOnly && (
              <button
                onClick={() => setRefunding(true)}
                className="mb-4 w-full flex items-center justify-between gap-3 bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 rounded-2xl p-4 text-left"
              >
                <span className="flex items-start gap-2.5">
                  <Undo2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    This patient has paid{" "}
                    <span className="font-extrabold text-sky-700 dark:text-sky-400">
                      {fmtINR(refundable)}
                    </span>{" "}
                    more than their bill. Record a refund if that money is
                    going back to them.
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-extrabold text-white bg-sky-600 rounded-full px-3 py-1">
                  Record refund
                </span>
              </button>
            )
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
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
                Ledger: {fmtINR(basePaid)} | Addtl Paid:{" "}
                {fmtINR(additionalChargesPaid)}
                {hasRefund ? ` | Refunded: −${fmtINR(refundAmount)}` : ""}
              </div>
            </div>

            <div
              className={`rounded-2xl p-3 border ${
                estimatedBalance > 0
                  ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/30"
                  : "bg-[#0f4a29]/10 border-[#0f4a29]/20"
              }`}
            >
              <div className="text-[10px] font-bold uppercase text-slate-400">
                {estimatedBalance < 0 ? "Advance Held" : "Estimated Balance Due"}
              </div>
              <div
                className={`font-extrabold text-sm ${
                  estimatedBalance > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-[#0f4a29] dark:text-[#52b788]"
                }`}
              >
                {fmtINR(Math.abs(estimatedBalance))}
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
                className="bg-[#0f4a29] text-white px-4 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? "Uploading..." : "Upload File"}
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
                    {doc.type} · {fmtDate(doc.createdAt)}
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