// client/src/pages/ipd/IPDPaymentModal.jsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPatientPayments, addPayment } from "./api/ipdPayment.api";
import { X, IndianRupee, Clock, Loader2 } from "lucide-react";

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

export default function IPDPaymentModal({ patientId, onClose }) {
  const [patient, setPatient] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    if (patient && amt > patient.balance) {
      setError(
        `Amount cannot exceed the remaining balance of ${fmtMoney(patient.balance)}.`,
      );
      return;
    }

    setSaving(true);
    try {
      await addPayment({
        patientId,
        amount: amt,
        method,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setChanged(true);
      setAmount("");
      setReferenceNumber("");
      setNotes("");
      await load();
    } catch (err) {
      setError(err.message || "Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  const close = () => onClose(changed);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
      onClick={close}
    >
      <div
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
          <button
            onClick={close}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
                  {error}
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
                <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl p-3.5 text-center">
                  <div className="font-extrabold text-base text-rose-500">
                    {fmtMoney(patient?.balance)}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Remaining Balance
                  </div>
                </div>
              </div>

              {/* Payment Form */}
              {patient && patient.balance > 0 && (
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
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        max={patient.balance}
                        min={0}
                        placeholder={`Up to ${patient.balance}`}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
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

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold py-2.5 rounded-full transition-all shadow-xs disabled:opacity-50"
                  >
                    <IndianRupee className="w-4 h-4" />{" "}
                    {saving ? "Recording..." : "Save Payment"}
                  </button>
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
    </div>,
    document.body,
  );
}
