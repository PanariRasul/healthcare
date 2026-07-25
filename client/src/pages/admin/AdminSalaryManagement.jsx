// client/src/pages/admin/AdminSalaryManagement.jsx
// Monthly salary management for the Employee directory (Employee table —
// not login accounts; see AdminEmployeeDirectory.jsx). Workflow:
//   1. Pick a month/year and hit "Generate" — creates one DRAFT record per
//      active employee, auto-filled from that month's Attendance (present/
//      leave/absent days -> a suggested loss-of-pay deduction).
//   2. Edit any row inline — paid leaves, bonus, one-off adjustments — net
//      salary recalculates automatically.
//   3. Finalize, then Mark Paid once payment actually goes out.
//   4. "History" on any employee shows every past month's record.
//
// Salary math: Net Salary is always derived from Present Days worked. Every
// ON_LEAVE or ABSENT day is automatically Loss of Pay (LOP) unless it's
// covered by the Paid Leaves quota for the month — see suggestLop/
// deriveTotals in salary.controller.js. Paid Leaves and LOP Days both stay
// admin-editable on top of that suggestion.
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import {
  Wallet,
  Loader2,
  RefreshCw,
  Check,
  X,
  Pencil,
  Trash2,
  History,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Undo2,
} from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_STYLES = {
  DRAFT: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  FINALIZED: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  PAID: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
};

function money(value) {
  const num = Number(value ?? 0);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// Mirrors the backend's suggestLop() so the LOP Days field can auto-update
// in the UI the instant Paid Leaves is edited, without waiting on a
// round-trip to the server. The server re-derives the same number on save
// regardless, so this is purely for instant visual feedback.
function suggestLop({ leaveDays, absentDays, paidLeaves }) {
  const n = Number(paidLeaves);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, (leaveDays || 0) + (absentDays || 0) - n);
}

const editableFields = (s) => ({
  baseSalary: s.baseSalary,
  paidLeaves: s.paidLeaves,
  lopDays: s.lopDays,
  bonus: s.bonus,
  bonusReason: s.bonusReason || "",
  otherAdjustment: s.otherAdjustment,
  adjustmentNote: s.adjustmentNote || "",
  notes: s.notes || "",
  status: s.status === "PAID" ? "FINALIZED" : s.status,
});

export default function AdminSalaryManagement() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [salaries, setSalaries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // 0 by default: with no paid-leave quota granted, every absent/leave day
  // shows up as LOP immediately. Admins raise this per-generation only for
  // months where they want to excuse some days upfront.
  const [defaultPaidLeaves, setDefaultPaidLeaves] = useState(0);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  // The attendance counts (leaveDays/absentDays) for whichever row is being
  // edited — not sent to the server, just kept around so the LOP Days field
  // can auto-recompute live as Paid Leaves is typed.
  const [editAttendance, setEditAttendance] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [payTarget, setPayTarget] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paidDate, setPaidDate] = useState("");

  const [historyEmp, setHistoryEmp] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchSalaries = async () => {
    setLoading(true);
    setError("");
    try {
      const { salaries: data, summary: sum } = await api.get(`/admin/salaries?year=${year}&month=${month}`);
      setSalaries(data);
      setSummary(sum);
    } catch (err) {
      setError(err.message || "Could not load salary records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSalaries(); }, [year, month]);

  const shiftMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m);
    setYear(y);
  };

  const handleGenerate = async () => {
    setError(""); setInfo("");
    setGenerating(true);
    try {
      const res = await api.post("/admin/salaries/generate", { year, month, paidLeaves: defaultPaidLeaves });
      setInfo(
        res.skippedNoSalary?.length
          ? `${res.message} Skipped (no salary on file): ${res.skippedNoSalary.join(", ")}.`
          : res.message
      );
      fetchSalaries();
    } catch (err) {
      setError(err.message || "Could not generate salary records.");
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditForm(editableFields(s));
    setEditAttendance({ leaveDays: s.leaveDays, absentDays: s.absentDays });
  };

  // Paid Leaves changing re-suggests LOP Days automatically (matches the
  // backend's behavior on save) — but if the admin then types their own
  // LOP Days value afterward, that explicit entry is what gets saved.
  const changePaidLeaves = (value) => {
    setEditForm((f) => ({
      ...f,
      paidLeaves: value,
      lopDays: editAttendance ? suggestLop({ ...editAttendance, paidLeaves: value }) : f.lopDays,
    }));
  };

  const saveEdit = async (id) => {
    setError(""); setInfo("");
    setSaving(true);
    try {
      await api.put(`/admin/salaries/${id}`, editForm);
      setInfo("Salary record updated.");
      setEditingId(null);
      setEditAttendance(null);
      fetchSalaries();
    } catch (err) {
      setError(err.message || "Could not update salary record.");
    } finally {
      setSaving(false);
    }
  };

  const recalc = async (id) => {
    setError(""); setInfo("");
    setBusyId(id);
    try {
      await api.put(`/admin/salaries/${id}/recalculate`);
      setInfo("Recalculated from current attendance.");
      fetchSalaries();
    } catch (err) {
      setError(err.message || "Could not recalculate.");
    } finally {
      setBusyId(null);
    }
  };

  const reopen = async (id) => {
    setError(""); setInfo("");
    setBusyId(id);
    try {
      await api.put(`/admin/salaries/${id}/reopen`);
      setInfo("Record reopened — status set back to Finalized.");
      fetchSalaries();
    } catch (err) {
      setError(err.message || "Could not reopen record.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setError(""); setInfo("");
    try {
      await api.del(`/admin/salaries/${deleteTarget.id}`);
      setInfo(`Removed ${deleteTarget.employee.fullName}'s record for ${MONTH_NAMES[month - 1]} ${year}.`);
      setDeleteTarget(null);
      fetchSalaries();
    } catch (err) {
      setError(err.message || "Could not remove salary record.");
    }
  };

  const openPay = (s) => {
    setPayTarget(s);
    setPaymentMethod("");
    setPaidDate(new Date().toISOString().split("T")[0]);
  };

  const confirmPay = async () => {
    if (!payTarget) return;
    setError(""); setInfo("");
    try {
      await api.put(`/admin/salaries/${payTarget.id}/mark-paid`, { paymentMethod, paidDate });
      setInfo(`Marked ${payTarget.employee.fullName} as paid.`);
      setPayTarget(null);
      fetchSalaries();
    } catch (err) {
      setError(err.message || "Could not mark as paid.");
    }
  };

  const openHistory = async (emp) => {
    setHistoryEmp(emp);
    setHistoryLoading(true);
    try {
      const data = await api.get(`/admin/salaries/employee/${emp.id}`);
      setHistoryData(data);
    } catch (err) {
      setError(err.message || "Could not load salary history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-teal-500" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Salary Management</h3>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-sm font-semibold text-slate-800 dark:text-white min-w-[140px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-400 text-sm font-medium">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/30 rounded-xl px-4 py-3 text-teal-700 dark:text-teal-400 text-sm font-medium">
          {info}
        </div>
      )}

      {/* Generate bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-4 flex-wrap">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Generate draft salary rows for every active employee for <span className="font-semibold text-slate-700 dark:text-slate-200">{MONTH_NAMES[month - 1]} {year}</span>, auto-filled from attendance. Absent and unpaid leave days are deducted as Loss of Pay automatically.
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {/* <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Paid leaves/mo</label>
            <input
              type="number"
              min={0}
              value={defaultPaidLeaves}
              onChange={(e) => setDefaultPaidLeaves(Number(e.target.value))}
              className="w-16 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
            />
          </div> */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:scale-[1.02] transition-transform shadow-lg shadow-teal-500/20 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            {generating ? "Generating..." : "Generate for this month"}
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && salaries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard label="Records" value={salaries.length} />
          <SummaryCard label="Net Payable" value={money(summary.totalNet)} />
          <SummaryCard label="Total Bonus" value={money(summary.totalBonus)} />
          <SummaryCard label="Total Deducted" value={money(summary.totalDeduction)} />
          <SummaryCard label="Paid / Pending" value={`${summary.paidCount} / ${summary.pendingCount}`} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm font-medium">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading salary records...
          </div>
        </div>
      ) : salaries.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-slate-400 dark:text-slate-500 text-sm">
          No salary records for {MONTH_NAMES[month - 1]} {year} yet. Click "Generate for this month" above.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  {["Employee", "Base", "Present/Off Days/Absent", "Paid Lv.", "LOP Days", "Deduction", "Bonus", "Net", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      title={h === "LOP Days" ? "Auto-suggested from Absent + unpaid Leave days, minus Paid Leaves. Editable." : undefined}
                      className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salaries.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800/50 align-top">
                    {editingId === s.id ? (
                      <td colSpan={10} className="px-4 py-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                          <MiniField label="Base Salary (₹)" type="number" value={editForm.baseSalary} onChange={(v) => setEditForm(f => ({ ...f, baseSalary: v }))} />
                          <MiniField label="Paid Leaves" type="number" value={editForm.paidLeaves} onChange={changePaidLeaves} />
                          <MiniField label="LOP Days (auto)" type="number" value={editForm.lopDays} onChange={(v) => setEditForm(f => ({ ...f, lopDays: v }))} />
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Status</label>
                            <select
                              value={editForm.status}
                              onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
                            >
                              <option value="DRAFT">Draft</option>
                              <option value="FINALIZED">Finalized</option>
                            </select>
                          </div>
                        </div>
                        {editAttendance && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2 mb-3">
                            Attendance this month: {editAttendance.absentDays} absent + {editAttendance.leaveDays} unpaid leave day(s). LOP Days recalculates automatically when Paid Leaves changes — edit it directly to override.
                          </p>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                          <MiniField label="Bonus (₹)" type="number" value={editForm.bonus} onChange={(v) => setEditForm(f => ({ ...f, bonus: v }))} />
                          <MiniField label="Bonus Reason" value={editForm.bonusReason} onChange={(v) => setEditForm(f => ({ ...f, bonusReason: v }))} placeholder="e.g. Diwali bonus" />
                          <MiniField label="Adjustment (±₹)" type="number" value={editForm.otherAdjustment} onChange={(v) => setEditForm(f => ({ ...f, otherAdjustment: v }))} />
                          <MiniField label="Adjustment Note" value={editForm.adjustmentNote} onChange={(v) => setEditForm(f => ({ ...f, adjustmentNote: v }))} placeholder="e.g. advance recovery" />
                        </div>
                        <div className="mb-3">
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Notes</label>
                          <textarea
                            value={editForm.notes}
                            onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                            rows={2}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(s.id)} disabled={saving} className="flex items-center gap-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50">
                            <Check className="w-3.5 h-3.5" /> Save
                          </button>
                          <button onClick={() => { setEditingId(null); setEditAttendance(null); }} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 px-3 py-2">
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3.5">
                          <button onClick={() => openHistory(s.employee)} className="font-medium text-slate-800 dark:text-white hover:text-teal-500 hover:underline text-left">
                            {s.employee.fullName}
                          </button>
                          <div className="text-xs text-slate-400 dark:text-slate-500">{s.employee.designation}</div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{money(s.baseSalary)}</td>
                        <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                          {s.presentDays} / {s.leaveDays} / {s.absentDays}
                          <div className="text-slate-400 dark:text-slate-600">of {s.totalDays} days</div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{s.paidLeaves}</td>
                        <td
                          className="px-4 py-3.5 text-slate-600 dark:text-slate-300"
                          title={`${s.absentDays} absent + ${s.leaveDays} unpaid leave − ${s.paidLeaves} paid leave(s) = ${s.lopDays} LOP day(s)`}
                        >
                          {s.lopDays}
                        </td>
                        <td className="px-4 py-3.5 text-rose-500 whitespace-nowrap">-{money(s.leaveDeduction)}</td>
                        <td className="px-4 py-3.5 text-emerald-600 dark:text-emerald-400 whitespace-nowrap" title={s.bonusReason || ""}>
                          {s.bonus ? `+${money(s.bonus)}` : "—"}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-white whitespace-nowrap" title={s.otherAdjustment ? `${s.otherAdjustment > 0 ? "+" : ""}${money(s.otherAdjustment)}${s.adjustmentNote ? ` — ${s.adjustmentNote}` : ""}` : ""}>
                          {money(s.netSalary)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${STATUS_STYLES[s.status]}`}>
                            {s.status}
                          </span>
                          {s.status === "PAID" && s.paidDate && (
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{s.paidDate.split("T")[0]}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-1">
                            {s.status !== "PAID" && (
                              <IconBtn title="Edit" onClick={() => startEdit(s)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                            )}
                            {s.status !== "PAID" && (
                              <IconBtn title="Recalculate from attendance" onClick={() => recalc(s.id)} disabled={busyId === s.id}>
                                {busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              </IconBtn>
                            )}
                            {s.status === "FINALIZED" && (
                              <IconBtn title="Mark paid" onClick={() => openPay(s)}><Banknote className="w-3.5 h-3.5 text-emerald-500" /></IconBtn>
                            )}
                            {s.status === "PAID" && (
                              <IconBtn title="Reopen" onClick={() => reopen(s.id)} disabled={busyId === s.id}><Undo2 className="w-3.5 h-3.5" /></IconBtn>
                            )}
                            {s.status !== "PAID" && (
                              <IconBtn title="Delete" onClick={() => setDeleteTarget(s)}><Trash2 className="w-3.5 h-3.5 text-rose-500" /></IconBtn>
                            )}
                            <IconBtn title="History" onClick={() => openHistory(s.employee)}><History className="w-3.5 h-3.5" /></IconBtn>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <h4 className="font-semibold text-slate-800 dark:text-white mb-2">
            Remove {deleteTarget.employee.fullName}'s {MONTH_NAMES[month - 1]} {year} record?
          </h4>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">This cannot be undone. They can be re-generated later.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2">Cancel</button>
            <button onClick={confirmDelete} className="bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">Remove</button>
          </div>
        </Modal>
      )}

      {/* Mark paid */}
      {payTarget && (
        <Modal onClose={() => setPayTarget(null)}>
          <h4 className="font-semibold text-slate-800 dark:text-white mb-4">
            Mark {payTarget.employee.fullName} as paid — {money(payTarget.netSalary)}
          </h4>
          <div className="space-y-3 mb-5">
            <MiniField label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} placeholder="Cash / Bank Transfer / UPI" />
            <MiniField label="Paid Date" type="date" value={paidDate} onChange={setPaidDate} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setPayTarget(null)} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2">Cancel</button>
            <button onClick={confirmPay} className="bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">Confirm Paid</button>
          </div>
        </Modal>
      )}

      {/* History */}
      {historyEmp && (
        <Modal onClose={() => { setHistoryEmp(null); setHistoryData(null); }} wide>
          <h4 className="font-semibold text-slate-800 dark:text-white mb-4">{historyEmp.fullName} — Salary History</h4>
          {historyLoading || !historyData ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : historyData.salaries.length === 0 ? (
            <div className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">No salary records yet for this employee.</div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50">
                    {["Month", "Base", "LOP Days", "Bonus", "Net", "Status"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyData.salaries.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800/50">
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{MONTH_NAMES[s.month - 1]} {s.year}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{money(s.baseSalary)}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{s.lopDays}</td>
                      <td className="px-3 py-2.5 text-emerald-600 dark:text-emerald-400">{s.bonus ? money(s.bonus) : "—"}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-white">{money(s.netSalary)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-bold text-slate-800 dark:text-white">{value}</div>
    </div>
  );
}

function MiniField({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
      />
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-slate-900 rounded-2xl p-6 w-full shadow-2xl ${wide ? "max-w-2xl" : "max-w-sm"}`}
      >
        {children}
      </div>
    </div>
  );
}