// client/src/pages/ipd/DischargeModal.jsx
//
// Quick-action modal for transitioning a patient's discharge status. Calls
// the dedicated PATCH /api/ipd/:id/discharge endpoint — never the full
// patient update — so this can never touch billing figures, daily charges,
// medicines, or additional charges.
//
// INVOICE GATE
//   A patient can only be discharged once their invoice has been FINALIZED.
//   On open this asks the server what state the bill is in and shows one of
//   three screens:
//     - no invoice yet      -> explains what to do, opens Generate Invoice
//     - invoice still draft -> explains what finalizing means, opens it
//     - invoice finalized   -> the normal discharge confirmation
//   The server enforces the same rule, so this can't be bypassed.
//
// The only thing the user enters is the discharge date. The discharge time
// is stamped from the server's clock at the moment of confirmation.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { dischargePatient, fetchDischargeReadiness } from "./api/ipd.api";
import InvoiceModal from "../../components/InvoiceModal";
import {
  X,
  DoorOpen,
  Undo2,
  Loader2,
  Lock,
  ShieldCheck,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtINR, toISODate, todayISO } from "../../lib/dateFormat";

/**
 * @param {object} patient - the patient row/record being acted on
 * @param {(didChange: boolean) => void} onClose
 */
export default function DischargeModal({ patient, onClose }) {
  const isDischarged = patient.status === "Discharged";

  const [date, setDate] = useState(
    toISODate(patient.dischargeDate) || todayISO(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Invoice gate state
  const [checking, setChecking] = useState(!isDischarged);
  const [readiness, setReadiness] = useState(null);
  const [showInvoice, setShowInvoice] = useState(false);

  const admissionDateOnly = toISODate(patient.admissionDate);

  const loadReadiness = () => {
    setChecking(true);
    fetchDischargeReadiness(patient.id)
      .then(setReadiness)
      .catch((err) =>
        setError(err.message || "Could not check this patient's invoice."),
      )
      .finally(() => setChecking(false));
  };

  useEffect(() => {
    // Undoing a discharge doesn't need the bill to be locked, so skip the
    // check entirely in that direction.
    if (isDischarged) return;
    loadReadiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  const close = () => onClose(false);

  const submitDischarge = async (e) => {
    e.preventDefault();
    setError("");

    if (admissionDateOnly && date < admissionDateOnly) {
      setError("The discharge date can't be before the admission date.");
      return;
    }

    setSaving(true);
    try {
      await dischargePatient(patient.id, {
        dischargeStatus: "Discharged",
        dischargeDate: date,
      });
      onClose(true);
    } catch (err) {
      // The server re-checks the invoice; if it's not locked, drop back to
      // the gate screen rather than showing a bare error.
      if (err.code === "NO_INVOICE" || err.code === "INVOICE_NOT_FINALIZED") {
        setError("");
        loadReadiness();
      } else {
        setError(err.message || "Could not update the discharge status.");
      }
      setSaving(false);
    }
  };

  const submitUndo = async () => {
    setError("");
    setSaving(true);
    try {
      await dischargePatient(patient.id, { dischargeStatus: "Admitted" });
      onClose(true);
    } catch (err) {
      setError(err.message || "Could not undo the discharge.");
      setSaving(false);
    }
  };

  const blocked = !isDischarged && readiness && !readiness.ready;
  const invoice = readiness?.invoice || null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
        onClick={() => !saving && close()}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  isDischarged
                    ? "bg-slate-100 dark:bg-slate-800"
                    : blocked
                      ? "bg-amber-100 dark:bg-amber-500/20"
                      : "bg-[#0f4a29]/10"
                }`}
              >
                {isDischarged ? (
                  <Undo2 className="w-4 h-4 text-slate-500" />
                ) : blocked ? (
                  <Lock className="w-4 h-4 text-amber-600" />
                ) : (
                  <DoorOpen className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />
                )}
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                  {isDischarged
                    ? "Undo discharge"
                    : blocked
                      ? "Finalize the invoice first"
                      : "Discharge patient"}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {patient.name} · #{patient.serialNumber}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {error && (
              <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
                {error}
              </div>
            )}

            {/* ---------- Undo ---------- */}
            {isDischarged ? (
              <>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  This moves {patient.name} back to Admitted and clears the
                  discharge date and time. Billing, charges and the invoice are
                  left untouched.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-full text-xs font-extrabold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitUndo}
                    disabled={saving}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-xs disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Undo2 className="w-4 h-4" />
                    )}
                    {saving ? "Working..." : "Undo discharge"}
                  </button>
                </div>
              </>
            ) : checking ? (
              /* ---------- Checking ---------- */
              <div className="flex items-center justify-center py-10 text-xs font-bold text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-[#0f4a29] mr-2" />
                Checking this patient's invoice...
              </div>
            ) : blocked ? (
              /* ---------- Blocked: bill not locked ---------- */
              <>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl px-4 py-3 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{readiness.message}</span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <p className="font-extrabold text-slate-900 dark:text-white">
                    What to do
                  </p>
                  <ol className="space-y-1.5 list-decimal pl-4">
                    <li>
                      Open the invoice and check every charge — bed and
                      treatment days, additional charges, medicines.
                    </li>
                    <li>
                      Record any refund due to the patient, so it prints on the
                      bill.
                    </li>
                    <li>
                      Press <span className="font-extrabold">Finalize Invoice</span>{" "}
                      and confirm. This locks the bill for good — nobody can
                      edit it afterwards, so check it carefully first.
                    </li>
                    <li>Come back here and discharge the patient.</li>
                  </ol>
                  <p className="pt-1">
                    Each patient gets one invoice. You can edit it as many
                    times as you need up until you finalize it.
                  </p>
                </div>

                {invoice && (
                  <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-1.5 text-xs">
                    <div className="flex justify-between font-medium text-slate-600 dark:text-slate-300">
                      <span>Invoice</span>
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        {invoice.invoiceNumber}
                      </span>
                    </div>
                    <div className="flex justify-between font-medium text-slate-600 dark:text-slate-300">
                      <span>Grand total</span>
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        {fmtINR(invoice.grandTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between font-medium text-slate-600 dark:text-slate-300">
                      <span>Balance</span>
                      <span
                        className={`font-extrabold ${
                          invoice.balance > 0
                            ? "text-rose-500"
                            : "text-[#0f4a29] dark:text-[#52b788]"
                        }`}
                      >
                        {fmtINR(Math.abs(invoice.balance))}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    className="px-5 py-2.5 rounded-full text-xs font-extrabold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInvoice(true)}
                    className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-xs"
                  >
                    <Receipt className="w-4 h-4" />
                    {invoice ? "Open invoice" : "Generate invoice"}
                  </button>
                </div>
              </>
            ) : (
              /* ---------- Ready: normal discharge ---------- */
              <form onSubmit={submitDischarge} className="space-y-4">
                <div className="bg-[#0f4a29]/10 border border-[#0f4a29]/20 rounded-2xl px-4 py-3 text-xs font-bold text-[#0f4a29] dark:text-[#52b788] flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div>
                      Invoice {invoice?.invoiceNumber} is finalized
                      {invoice?.finalizedAt
                        ? ` (${fmtDateTime(invoice.finalizedAt)})`
                        : ""}
                      .
                    </div>
                    {invoice && invoice.balance > 0 && (
                      <div className="font-medium text-rose-600 dark:text-rose-400">
                        {fmtINR(invoice.balance)} is still outstanding on the
                        bill.
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  This marks {patient.name} as discharged and moves them into
                  Discharged Patients. The discharge time is stamped
                  automatically. Charges, payments and the invoice stay exactly
                  as they are.
                </p>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Discharge Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    min={admissionDateOnly || undefined}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                  />
                  <p className="text-[10px] text-slate-400 font-bold mt-1">
                    {fmtDate(date)}
                    {admissionDateOnly
                      ? ` · Admitted ${fmtDate(admissionDateOnly)}`
                      : ""}
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-full text-xs font-extrabold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-xs disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <DoorOpen className="w-4 h-4" />
                    )}
                    {saving ? "Discharging..." : "Discharge patient"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {showInvoice && (
        <InvoiceModal
          type="IPD"
          patient={patient}
          onClose={() => {
            setShowInvoice(false);
            loadReadiness(); // pick up a freshly finalized bill
          }}
        />
      )}
    </>,
    document.body,
  );
}