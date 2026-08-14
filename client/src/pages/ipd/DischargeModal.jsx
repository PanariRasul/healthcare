// client/src/pages/ipd/DischargeModal.jsx
//
// Quick-action modal for transitioning a patient's discharge status. Calls
// the dedicated PATCH /api/ipd/patients/:id/discharge endpoint — never the
// full patient update — so this can never touch billing figures, daily
// charges, medicines, or additional charges. See dischargePatient() in
// ipd.controller.js for details.
//
// Deliberately minimal: the only thing the user enters is the discharge
// date. The discharge time is always stamped automatically from the
// server's current clock at the moment of confirmation — there's nothing
// to fill in for it.
import { useState } from "react";
import { createPortal } from "react-dom";
import { dischargePatient } from "./api/ipd.api";
import { X, DoorOpen, Undo2, Loader2 } from "lucide-react";

const todayDateInput = () => new Date().toISOString().split("T")[0];

/**
 * @param {object} patient - the patient row/record being acted on
 * @param {(didChange: boolean) => void} onClose
 */
export default function DischargeModal({ patient, onClose }) {
  const isDischarged = patient.status === "Discharged";

  const [date, setDate] = useState(
    patient.dischargeDate
      ? new Date(patient.dischargeDate).toISOString().split("T")[0]
      : todayDateInput(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const admissionDateOnly = patient.admissionDate
    ? new Date(patient.admissionDate).toISOString().split("T")[0]
    : null;

  const close = () => onClose(false);

  const submitDischarge = async (e) => {
    e.preventDefault();
    setError("");

    if (admissionDateOnly && date < admissionDateOnly) {
      setError("Discharge date cannot be before the admission date.");
      return;
    }

    setSaving(true);
    try {
      // No dischargeTime sent — the server stamps the current system time
      // automatically the moment this is confirmed.
      await dischargePatient(patient.id, {
        dischargeStatus: "Discharged",
        dischargeDate: date,
      });
      onClose(true);
    } catch (err) {
      setError(err.message || "Failed to update discharge status");
    } finally {
      setSaving(false);
    }
  };

  const undoDischarge = async () => {
    setError("");
    setSaving(true);
    try {
      await dischargePatient(patient.id, { dischargeStatus: "Admitted" });
      onClose(true);
    } catch (err) {
      setError(err.message || "Failed to undo discharge");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isDischarged ? "Undo discharge" : "Discharge patient"}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <DoorOpen className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />
              {isDischarged ? "Undo Discharge" : "Discharge Patient"}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {patient.name} — #{patient.serialNumber}
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold"
            >
              {error}
            </div>
          )}

          {isDischarged ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                This will move <strong>{patient.name}</strong> back to{" "}
                <strong>Admitted</strong> and clear the recorded discharge
                date/time. Use this if the patient was discharged by mistake
                or has been re-admitted.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 text-xs font-extrabold py-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={undoDischarge}
                  disabled={saving}
                  className="flex-[2] flex items-center justify-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold py-2.5 rounded-full transition-all shadow-xs disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Undo2 className="w-4 h-4" />
                  )}
                  {saving ? "Reverting..." : "Undo Discharge"}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={submitDischarge} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  Discharge Date
                </label>
                <input
                  type="date"
                  value={date}
                  min={admissionDateOnly || undefined}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  autoFocus
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                />
                <p className="text-[10px] text-slate-400 font-medium mt-1.5">
                  Discharge time is recorded automatically from the current
                  time — nothing else to fill in.
                </p>
              </div>

              {patient.balance > 0 && (
                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl px-3 py-2">
                  This patient still has a pending balance of ₹
                  {patient.balance.toLocaleString("en-IN")}. They'll still show
                  up as "Discharged" with that balance owing — settle it from
                  the Payments page if needed.
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 text-xs font-extrabold py-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-[2] flex items-center justify-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold py-2.5 rounded-full transition-all shadow-xs disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <DoorOpen className="w-4 h-4" />
                  )}
                  {saving ? "Saving..." : "Confirm Discharge"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}