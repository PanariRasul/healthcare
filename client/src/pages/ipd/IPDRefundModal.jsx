// client/src/pages/ipd/IPDRefundModal.jsx
//
// Records money handed BACK to the patient — the deposit-₹10,000 against a
// ₹5,000 bill case, where ₹5,000 goes back.
//
// The amount is saved on the patient and mirrored onto their invoice, so the
// refund prints on the bill. When there's no refund the invoice shows no
// refund line at all.
//
// A finalized invoice keeps whatever figures it was issued with — record the
// refund BEFORE finalizing if it needs to appear on the printed bill.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Undo2, Loader2, AlertTriangle, Lock } from "lucide-react";
import { setRefund } from "./api/ipd.api";
import { fetchPatientInvoice } from "../../api/invoice.api";
import { fmtINR, toISODate, todayISO, fmtDate } from "../../lib/dateFormat";

const REFUND_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Other"];

/**
 * @param {object} patient  full IPD patient record
 * @param {(updatedPatient: object|null) => void} onClose  null = nothing changed
 */
export default function IPDRefundModal({ patient, onClose }) {
  const [amount, setAmount] = useState(
    patient.refundAmount ? String(patient.refundAmount) : "",
  );
  const [reason, setReason] = useState(patient.refundReason || "");
  const [date, setDate] = useState(
    toISODate(patient.refundDate) || todayISO(),
  );
  const [method, setMethod] = useState(patient.refundMethod || "Cash");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(true);

  useEffect(() => {
    fetchPatientInvoice("IPD", patient.id)
      .then(setInvoice)
      .catch(() => setInvoice(null))
      .finally(() => setInvoiceLoading(false));
  }, [patient.id]);

  const totalPaid = Number(patient.totalPaid) || 0;
  const alreadyRefunded = Number(patient.refundAmount) || 0;

  // The bill to measure against. The invoice is authoritative once one
  // exists — it's the document the refund will print on. Before that, fall
  // back to the patient's recorded charges.
  const bill = invoice
    ? Number(invoice.grandTotal) || 0
    : Number(patient.totalStay) || 0;

  // THE REFUND RULE: only an overpayment can be refunded — what the patient
  // handed over above the bill. Deposit ₹10,000 against a ₹5,000 bill
  // leaves ₹5,000 to return; paid ₹5,000 against a ₹5,000 bill leaves
  // nothing. Refunding more would show as pending that the patient doesn't
  // actually owe.
  const maxRefund = Math.round(Math.max(0, totalPaid - bill) * 100) / 100;
  // What's still returnable after any refund already recorded.
  const suggested =
    Math.round(Math.max(0, maxRefund - alreadyRefunded) * 100) / 100;

  const parsed = parseFloat(amount);
  const isValid = Number.isFinite(parsed) && parsed >= 0;
  const tooMuch = isValid && parsed > maxRefund;
  const invoiceLocked = invoice?.status === "FINALIZED";

  const save = async (e) => {
    e.preventDefault();
    setError("");

    if (!isValid) {
      setError("Enter the refund amount — use 0 to clear a refund.");
      return;
    }
    if (tooMuch) {
      setError(
        maxRefund === 0
          ? `There is nothing to refund. The bill is ${fmtINR(bill)} and the patient has paid ${fmtINR(totalPaid)} — a refund only applies when they have paid more than the bill.`
          : `The refund can be at most ${fmtINR(maxRefund)}. The bill is ${fmtINR(bill)} and the patient has paid ${fmtINR(totalPaid)}, so only the ${fmtINR(maxRefund)} paid above the bill can go back.`,
      );
      return;
    }

    setSaving(true);
    try {
      const { patient: updated } = await setRefund(patient.id, {
        refundAmount: parsed,
        refundReason: reason.trim() || null,
        refundDate: parsed > 0 ? date || todayISO() : null,
        refundMethod: parsed > 0 ? method : null,
      });
      onClose(updated);
    } catch (err) {
      setError(err.message || "Could not record the refund.");
      setSaving(false);
    }
  };

  const fieldCls =
    "w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
      onClick={() => !saving && onClose(null)}
    >
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-sky-100 dark:bg-sky-500/20 flex items-center justify-center shrink-0">
              <Undo2 className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                Record Refund
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {patient.name} · #{patient.serialNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Where the money stands */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              { label: "Total Bill", val: fmtINR(bill) },
              { label: "Paid", val: fmtINR(totalPaid) },
              { label: "Refundable", val: fmtINR(maxRefund) },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-3"
              >
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  {s.label}
                </div>
                <div className="font-extrabold text-slate-900 dark:text-white">
                  {s.val}
                </div>
              </div>
            ))}
          </div>

          {maxRefund === 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl px-4 py-3 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span className="font-extrabold">Nothing to refund.</span> The
              bill is {fmtINR(bill)} and the patient has paid{" "}
              {fmtINR(totalPaid)}. A refund only returns what they paid above
              the bill, so refunding here would show as pending on their
              record. Lower the charges instead if the bill is wrong.
            </div>
          )}

          {suggested > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(suggested))}
              className="w-full flex items-center justify-between gap-2 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/30 rounded-2xl px-4 py-3 text-left"
            >
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                This patient has paid{" "}
                <span className="font-extrabold text-sky-700 dark:text-sky-400">
                  {fmtINR(suggested)}
                </span>{" "}
                more than their bill.
              </span>
              <span className="shrink-0 text-[11px] font-extrabold text-white bg-sky-600 rounded-full px-3 py-1">
                Use this
              </span>
            </button>
          )}

          {!invoiceLoading && invoiceLocked && (
            <div className="bg-slate-900 dark:bg-slate-800 rounded-2xl px-4 py-3 text-white text-xs font-bold flex items-start gap-2.5">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div>
                  Invoice {invoice.invoiceNumber} is already finalized.
                </div>
                <div className="font-medium text-slate-300">
                  The refund will be recorded against the patient, but the
                  printed invoice keeps the figures it was issued with.
                </div>
              </div>
            </div>
          )}

          {!invoiceLoading && !invoice && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl px-4 py-3 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                No invoice yet. The refund is saved now and will appear on the
                invoice as soon as you generate it.
              </span>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Refund Amount (₹)
              </label>
              <input
                type="number"
                min="0"
                max={maxRefund}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                className={fieldCls}
              />
              <p className="text-[10px] text-slate-400 font-medium mt-1">
                Up to {fmtINR(maxRefund)}. Set to 0 to remove a refund.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Refund Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldCls}
              />
              {date && (
                <p className="text-[10px] text-slate-400 font-bold mt-1">
                  {fmtDate(date)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Paid Back By
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
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
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Excess deposit returned"
                className={fieldCls}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => onClose(null)}
            disabled={saving}
            className="px-5 py-2.5 rounded-full text-xs font-extrabold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-xs disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Undo2 className="w-4 h-4" />
            )}
            {saving ? "Saving..." : "Save Refund"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}