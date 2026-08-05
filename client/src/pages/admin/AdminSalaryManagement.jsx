// client/src/pages/admin/AdminSalaryManagement.jsx
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { PageHeader, TableCard, Th, Td } from "../../components/UI";
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
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const STATUS_STYLES = {
  DRAFT:
    "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  FINALIZED:
    "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  PAID: "bg-[#0f4a29]/10 dark:bg-[#52b788]/20 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20",
};

function money(value) {
  const num = Number(value ?? 0);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

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

  const [defaultPaidLeaves, setDefaultPaidLeaves] = useState(0);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
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
      const { salaries: data, summary: sum } = await api.get(
        `/admin/salaries?year=${year}&month=${month}`,
      );
      setSalaries(data);
      setSummary(sum);
    } catch (err) {
      setError(err.message || "Could not load salary records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaries();
  }, [year, month]);

  const shiftMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setMonth(m);
    setYear(y);
  };

  const handleGenerate = async () => {
    setError("");
    setInfo("");
    setGenerating(true);
    try {
      const res = await api.post("/admin/salaries/generate", {
        year,
        month,
        paidLeaves: defaultPaidLeaves,
      });
      setInfo(
        res.skippedNoSalary?.length
          ? `${res.message} Skipped: ${res.skippedNoSalary.join(", ")}.`
          : res.message,
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

  const changePaidLeaves = (value) => {
    setEditForm((f) => ({
      ...f,
      paidLeaves: value,
      lopDays: editAttendance
        ? suggestLop({ ...editAttendance, paidLeaves: value })
        : f.lopDays,
    }));
  };

  const saveEdit = async (id) => {
    setError("");
    setInfo("");
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
    setError("");
    setInfo("");
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
    setError("");
    setInfo("");
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
    setError("");
    setInfo("");
    try {
      await api.del(`/admin/salaries/${deleteTarget.id}`);
      setInfo(`Removed ${deleteTarget.employee.fullName}'s record.`);
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
    setError("");
    setInfo("");
    try {
      await api.put(`/admin/salaries/${payTarget.id}/mark-paid`, {
        paymentMethod,
        paidDate,
      });
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
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      {/* Header with Month Navigator */}
      <PageHeader
        title="Salary Management"
        subtitle="Manage monthly payroll, adjustments, and payment disbursements"
        action={
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-1.5 rounded-full shadow-2xs">
            <button
              onClick={() => shiftMonth(-1)}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-extrabold text-slate-900 dark:text-white px-2">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              onClick={() => shiftMonth(1)}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-[#0f4a29]/10 dark:bg-[#52b788]/20 border border-[#0f4a29]/20 text-[#0f4a29] dark:text-[#52b788] rounded-2xl px-4 py-3 text-xs font-bold">
          {info}
        </div>
      )}

      {/* Generate Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-slate-500 font-medium max-w-xl">
          Generate draft payroll records for{" "}
          <span className="font-extrabold text-slate-900 dark:text-white">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          . Present days and deductions are auto-calculated from attendance
          logs.
        </p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full shadow-xs disabled:opacity-50 shrink-0 flex items-center gap-2"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Wallet className="w-4 h-4" />
          )}
          {generating ? "Generating..." : "Generate Payroll"}
        </button>
      </div>

      {/* Summary Cards */}
      {summary && salaries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <SummaryCard label="Records" value={salaries.length} />
          <SummaryCard label="Net Payable" value={money(summary.totalNet)} />
          <SummaryCard label="Total Bonus" value={money(summary.totalBonus)} />
          <SummaryCard
            label="Deductions"
            value={money(summary.totalDeduction)}
          />
          <SummaryCard
            label="Paid / Pending"
            value={`${summary.paidCount} / ${summary.pendingCount}`}
          />
        </div>
      )}

      {/* Main Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            payroll...
          </div>
        </div>
      ) : salaries.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-10 text-center text-slate-400 text-xs font-bold">
          No payroll records generated for {MONTH_NAMES[month - 1]} {year}.
        </div>
      ) : (
        <TableCard>
          <thead>
            <tr>
              {[
                "Employee",
                "Base",
                "Present/Off/Absent",
                "Paid Lv.",
                "LOP Days",
                "Deduction",
                "Bonus",
                "Net",
                "Status",
                "Actions",
              ].map((h) => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {salaries.map((s) => (
              <tr
                key={s.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                {editingId === s.id ? (
                  <td
                    colSpan={10}
                    className="p-5 bg-slate-50/50 dark:bg-slate-950/40"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <MiniField
                        label="Base Salary"
                        type="number"
                        value={editForm.baseSalary}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, baseSalary: v }))
                        }
                      />
                      <MiniField
                        label="Paid Leaves"
                        type="number"
                        value={editForm.paidLeaves}
                        onChange={changePaidLeaves}
                      />
                      <MiniField
                        label="LOP Days"
                        type="number"
                        value={editForm.lopDays}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, lopDays: v }))
                        }
                      />
                      <div>
                        <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                          Status
                        </label>
                        <select
                          value={editForm.status}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              status: e.target.value,
                            }))
                          }
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
                        >
                          <option value="DRAFT">Draft</option>
                          <option value="FINALIZED">Finalized</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <MiniField
                        label="Bonus (₹)"
                        type="number"
                        value={editForm.bonus}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, bonus: v }))
                        }
                      />
                      <MiniField
                        label="Bonus Reason"
                        value={editForm.bonusReason}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, bonusReason: v }))
                        }
                        placeholder="e.g. Festival"
                      />
                      <MiniField
                        label="Adjustment (±₹)"
                        type="number"
                        value={editForm.otherAdjustment}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, otherAdjustment: v }))
                        }
                      />
                      <MiniField
                        label="Adjustment Note"
                        value={editForm.adjustmentNote}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, adjustmentNote: v }))
                        }
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditAttendance(null);
                        }}
                        className="text-xs font-bold text-slate-500 px-3 py-1.5"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(s.id)}
                        disabled={saving}
                        className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-4 py-1.5 rounded-full shadow-xs"
                      >
                        Save Changes
                      </button>
                    </div>
                  </td>
                ) : (
                  <>
                    <Td className="font-extrabold text-slate-900 dark:text-white">
                      <button
                        onClick={() => openHistory(s.employee)}
                        className="hover:text-[#0f4a29] hover:underline text-left"
                      >
                        {s.employee.fullName}
                      </button>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {s.employee.designation}
                      </div>
                    </Td>
                    <Td className="font-bold">{money(s.baseSalary)}</Td>
                    <Td className="text-xs font-medium">
                      {s.presentDays} / {s.leaveDays} / {s.absentDays}
                    </Td>
                    <Td>{s.paidLeaves}</Td>
                    <Td>{s.lopDays}</Td>
                    <Td className="text-rose-500 font-bold">
                      -{money(s.leaveDeduction)}
                    </Td>
                    <Td className="text-[#0f4a29] dark:text-[#52b788] font-bold">
                      {s.bonus ? `+${money(s.bonus)}` : "—"}
                    </Td>
                    <Td className="font-extrabold text-slate-900 dark:text-white">
                      {money(s.netSalary)}
                    </Td>
                    <Td>
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${STATUS_STYLES[s.status]}`}
                      >
                        {s.status}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex gap-1 items-center">
                        {s.status !== "PAID" && (
                          <button
                            onClick={() => startEdit(s)}
                            className="p-1 text-slate-400 hover:text-slate-700"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {s.status !== "PAID" && (
                          <button
                            onClick={() => recalc(s.id)}
                            disabled={busyId === s.id}
                            className="p-1 text-slate-400 hover:text-slate-700"
                          >
                            {busyId === s.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        {s.status === "FINALIZED" && (
                          <button
                            onClick={() => openPay(s)}
                            className="p-1 text-emerald-600"
                          >
                            <Banknote className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {s.status === "PAID" && (
                          <button
                            onClick={() => reopen(s.id)}
                            disabled={busyId === s.id}
                            className="p-1 text-slate-400 hover:text-slate-700"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {s.status !== "PAID" && (
                          <button
                            onClick={() => setDeleteTarget(s)}
                            className="p-1 text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => openHistory(s.employee)}
                          className="p-1 text-slate-400 hover:text-slate-700"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 max-w-sm w-full shadow-2xl">
            <h4 className="font-extrabold text-slate-900 dark:text-white mb-2">
              Remove Record?
            </h4>
            <p className="text-xs text-slate-500 font-medium mb-6">
              Remove payroll entry for {deleteTarget.employee.fullName}?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-xs font-bold text-slate-500 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="bg-rose-600 text-white text-xs font-extrabold px-4 py-2 rounded-full"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {payTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 max-w-sm w-full shadow-2xl">
            <h4 className="font-extrabold text-slate-900 dark:text-white mb-4 text-sm">
              Disburse — {money(payTarget.netSalary)}
            </h4>
            <div className="space-y-3 mb-5">
              <MiniField
                label="Payment Method"
                value={paymentMethod}
                onChange={setPaymentMethod}
                placeholder="Cash / Bank Transfer"
              />
              <MiniField
                label="Paid Date"
                type="date"
                value={paidDate}
                onChange={setPaidDate}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPayTarget(null)}
                className="text-xs font-bold text-slate-500 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmPay}
                className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-4 shadow-xs">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
        {label}
      </div>
      <div className="text-base font-extrabold text-slate-900 dark:text-white">
        {value}
      </div>
    </div>
  );
}

function MiniField({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
      />
    </div>
  );
}
