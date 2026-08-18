// client/src/pages/ipd/IPDPaymentModal.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPatientPayments, addPayment } from "./api/ipdPayment.api";
import InvoiceModal from "../../../components/InvoiceModal";
import { X, IndianRupee, Clock, Loader2, Receipt } from "lucide-react";

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "OTHER", label: "Other" },
];

const fmtMoney = (n) => `₹${(n || 0).toLocaleString("en-IN")}`;
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

// Keep in sync with the server's MAX_PAYMENT_AMOUNT — this is just an early,
// friendlier warning; the server is the source of truth and re-validates.
const MAX_PAYMENT_AMOUNT = 1_00_00_000; // ₹1 crore

export default function IPDPaymentModal({ patientId, onClose }) {
  const [patient, setPatient] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [changed, setChanged] = useState(false);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  // When the entered amount exceeds the balance, we ask the user to
  // explicitly confirm before recording it as an advance credit — cheap
  // insurance against a typo turning into an accidental overpayment.
  const [confirmingOverpay, setConfirmingOverpay] = useState(false);
  const successTimeoutRef = useRef(null);

  useEffect(() => {
    return () => window.clearTimeout(successTimeoutRef.current);
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPatientPayments(patientId);
      setPatient(data.patient);
      setPayments(data.payments);
    } catch (err) {
      setError(err.message || "Failed to load payment details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [patientId]);

  // Close on Escape, same as clicking the backdrop.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose(changed);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changed, onClose]);

  const parsedAmount = parseFloat(amount);
  const isAmountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const willOverpay =
    isAmountValid && patient && parsedAmount > patient.balance;
  const creditAfterSave = willOverpay
    ? Math.round((parsedAmount - patient.balance) * 100) / 100
    : 0;

  const resetForm = () => {
    setAmount("");
    setReferenceNumber("");
    setNotes("");
    setConfirmingOverpay(false);
  };

  const performSave = async (amt) => {
    setSaving(true);
    setError("");
    try {
      const result = await addPayment({
        patientId,
        amount: amt,
        method,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setChanged(true);
      resetForm();
      setSuccessMessage(
        result?.overpaidBy > 0
          ? `Payment recorded. ₹${result.overpaidBy.toLocaleString("en-IN")} saved as advance credit and will be adjusted against future charges.`
          : "Payment recorded successfully.",
      );
      window.clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = window.setTimeout(() => setSuccessMessage(""), 5000);
      await load();
    } catch (err) {
      setError(err.message || "Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!isAmountValid) {
      setError("Enter a valid payment amount.");
      return;
    }
    if (parsedAmount > MAX_PAYMENT_AMOUNT) {
      setError(
        `That amount looks unusually large (max ${fmtMoney(MAX_PAYMENT_AMOUNT)} per payment). Please double-check it.`,
      );
      return;
    }

    // Overpayment is allowed on purpose — reception can collect more than
    // the current balance. The extra becomes a credit that's carried
    // forward and auto-adjusted against the next billing cycle. We just
    // ask for one explicit confirmation click first, to catch typos.
    if (willOverpay && !confirmingOverpay) {
      setConfirmingOverpay(true);
      return;
    }

    await performSave(parsedAmount);
  };

  const close = () => onClose(changed);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={patient ? `Payments for ${patient.name}` : "Patient payments"}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              {patient
                ? `${patient.name} — #${patient.serialNumber}`
                : "Loading Patient..."}
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Record new payment or view transactions
            </p>
          </div>
          <div className="flex items-center gap-2">
            {patient && (
              <button
                onClick={() => setInvoicing(true)}
                title="Generate Invoice"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold shadow-xs"
              >
                <Receipt className="w-3.5 h-3.5" /> Invoice
              </button>
            )}
            <button
              onClick={close}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs font-bold text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29] mr-2" />{" "}
              Loading Details...
            </div>
          ) : (
            <>
              {error && (
                <div
                  role="alert"
                  className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold"
                >
                  {error}
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl px-4 py-3 text-[#0f4a29] dark:text-[#52b788] text-xs font-bold"
                >
                  {successMessage}
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-3.5 text-center">
                  <div className="font-extrabold text-base text-slate-900 dark:text-white">
                    {fmtMoney(patient?.totalStay)}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Total Bill
                  </div>
                </div>
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-3.5 text-center">
                  <div className="font-extrabold text-base text-[#0f4a29] dark:text-[#52b788]">
                    {fmtMoney(patient?.totalPaid)}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Total Paid
                  </div>
                </div>
                <div
                  className={`border rounded-2xl p-3.5 text-center ${
                    patient?.balance < 0
                      ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30"
                      : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30"
                  }`}
                >
                  <div
                    className={`font-extrabold text-base ${
                      patient?.balance < 0 ? "text-[#0f4a29] dark:text-[#52b788]" : "text-rose-500"
                    }`}
                  >
                    {fmtMoney(Math.abs(patient?.balance || 0))}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    {patient?.balance < 0 ? "Advance Credit" : "Remaining Balance"}
                  </div>
                </div>
              </div>

              {/* Payment Form — always available, including after the balance is
                  cleared, since overpayments (advance credit) are allowed */}
              {patient && (
                <form
                  onSubmit={handleSave}
                  className="bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        Amount (₹)
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setConfirmingOverpay(false);
                        }}
                        min={0}
                        aria-describedby="amount-hint"
                        placeholder={
                          patient.balance > 0
                            ? `Balance ${fmtMoney(patient.balance)}`
                            : `Already ${fmtMoney(Math.abs(patient.balance))} in credit`
                        }
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
                      <p
                        id="amount-hint"
                        className={`mt-1 text-[10px] font-bold ${
                          willOverpay ? "text-amber-600 dark:text-amber-400" : "text-slate-400"
                        }`}
                      >
                        {willOverpay
                          ? `Exceeds balance by ${fmtMoney(creditAfterSave)} — will be saved as advance credit.`
                          : "Overpayment is allowed and carried forward as credit."}
                      </p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      >
                        {METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        Ref / Transaction No. (Optional)
                      </label>
                      <input
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder="UPI Ref / Slip No."
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                        Notes (Optional)
                      </label>
                      <input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Payment details"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
                    </div>
                  </div>

                  {confirmingOverpay && willOverpay ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingOverpay(false)}
                        className="flex-1 text-xs font-extrabold py-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex-[2] flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold py-2.5 rounded-full transition-all shadow-xs disabled:opacity-50"
                      >
                        <IndianRupee className="w-4 h-4" />{" "}
                        {saving
                          ? "Recording..."
                          : `Confirm ${fmtMoney(creditAfterSave)} Advance & Save`}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="submit"
                      disabled={saving || !isAmountValid}
                      className="w-full flex items-center justify-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold py-2.5 rounded-full transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <IndianRupee className="w-4 h-4" />{" "}
                      {saving ? "Recording..." : "Save Payment"}
                    </button>
                  )}
                </form>
              )}

              {/* History Table */}
              <div>
                <h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white mb-3">
                  <Clock className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
                  Payment History
                </h4>
                {payments.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium py-4 text-center">
                    No payment transactions recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-slate-400">
                          <th className="py-2.5 px-2 font-extrabold">Date</th>
                          <th className="py-2.5 px-2 font-extrabold text-right">
                            Amount
                          </th>
                          <th className="py-2.5 px-2 font-extrabold">Method</th>
                          <th className="py-2.5 px-2 font-extrabold">Ref</th>
                          <th className="py-2.5 px-2 font-extrabold">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr
                            key={p.id}
                            className="border-b border-slate-100 dark:border-slate-800/60"
                          >
                            <td className="py-2.5 px-2 text-slate-500 font-medium whitespace-nowrap">
                              {fmtDateTime(p.paymentDate)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                              {fmtMoney(p.amount)}
                            </td>
                            <td className="py-2.5 px-2 font-bold text-slate-800 dark:text-white">
                              {METHODS.find((m) => m.value === p.method)
                                ?.label || p.method}
                            </td>
                            <td className="py-2.5 px-2 text-slate-500 font-medium">
                              {p.referenceNumber || "—"}
                            </td>
                            <td className="py-2.5 px-2 text-slate-500 font-medium truncate max-w-[150px]">
                              {p.notes || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {invoicing && patient && (
        <InvoiceModal
          type="IPD"
          patient={patient}
          onClose={() => setInvoicing(false)}
        />
      )}
    </div>,
    document.body,
  );
}