// client/src/pages/admin/AdminSalaryManagement.jsx
import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { PageHeader, TableCard, Th, Td } from "../../components/UI";
import {
  Wallet,
  Loader2,
  RefreshCw,
  X,
  Pencil,
  Trash2,
  FileText,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Download,
  Lock,
} from "lucide-react";

// Edit these to match the actual hospital — shown on every printed/downloaded
// salary slip alongside the logo at client/public/healthcare.jpg (served at
// "/healthcare.jpg").
const HOSPITAL = {
  name: "Virupakshipuram Paralysis Centre",
  address:
    "No.6, G R Plaza, 24th Main Rd, opp. Empire Restaurant, 5th Phase, Ayodya Nagar, J P Nagar Phase 5, J. P. Nagar, Bengaluru,Karnataka 560078",
  phone: "+91 6364231861",
  email: "virupakshipuramparalysishealth@gmail.com",
  logo: "/healthcare.jpg",
};

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

// The slip only ever shows two states to keep it readable for an employee:
// PAID stays "Paid", both DRAFT and FINALIZED read as "Pending" (still
// awaiting disbursement). The admin table elsewhere keeps the 3-state detail.
const SLIP_STATUS = (status) => (status === "PAID" ? "Paid" : "Pending");

function money(value) {
  const num = Number(value ?? 0);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function suggestLop({ leaveDays, absentDays, paidLeaves }) {
  const n = Number(paidLeaves);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, (leaveDays || 0) + (absentDays || 0) - n);
}

// Same math as the server's deriveTotals (salary.controller.js) — used here
// purely for a live preview while editing, before the save round-trips.
function previewTotals({
  baseSalary,
  totalDays,
  lopDays,
  bonus,
  otherAdjustment,
}) {
  const base = Number(baseSalary) || 0;
  const days = Number(totalDays) || 0;
  const lop = Number(lopDays) || 0;
  const bon = Number(bonus) || 0;
  const adj = Number(otherAdjustment) || 0;
  const perDaySalary = days > 0 ? base / days : 0;
  const leaveDeduction = perDaySalary * lop;
  const netSalary = base - leaveDeduction + bon + adj;
  return { perDaySalary, leaveDeduction, netSalary };
}

const editableFields = (s) => ({
  baseSalary: s.baseSalary,
  totalDays: s.totalDays,
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

  const [slipEmp, setSlipEmp] = useState(null);
  const [slipData, setSlipData] = useState(null);
  const [slipLoading, setSlipLoading] = useState(false);
  const [selectedSlipId, setSelectedSlipId] = useState(null);

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
      refreshSlipIfOpen();
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
      refreshSlipIfOpen();
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
      refreshSlipIfOpen();
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
      refreshSlipIfOpen();
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
      refreshSlipIfOpen();
    } catch (err) {
      setError(err.message || "Could not mark as paid.");
    }
  };

  // Opens the Salary Slip viewer for an employee. `focusId` preselects a
  // specific month's record (e.g. clicking "Slip" on a row); otherwise the
  // most recent month is shown first.
  const openSlip = async (emp, focusId) => {
    setSlipEmp(emp);
    setSlipLoading(true);
    try {
      const data = await api.get(`/admin/salaries/employee/${emp.id}`);
      setSlipData(data);
      setSelectedSlipId(focusId || data.salaries?.[0]?.id || null);
    } catch (err) {
      setError(err.message || "Could not load salary history.");
    } finally {
      setSlipLoading(false);
    }
  };

  // Re-pulls the slip viewer's data without touching its open/selected
  // state — used after an action (mark paid, edit, delete) taken elsewhere
  // on the page so an open slip never shows stale numbers.
  const refreshSlipIfOpen = async () => {
    if (!slipEmp) return;
    try {
      const data = await api.get(`/admin/salaries/employee/${slipEmp.id}`);
      setSlipData(data);
    } catch {
      // Non-fatal — the slip just won't refresh until reopened.
    }
  };

  const closeSlip = () => {
    setSlipEmp(null);
    setSlipData(null);
    setSelectedSlipId(null);
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
          logs. Employees who already have a record for this month — pending or
          paid — are skipped automatically, so it's safe to run this again after
          adding a new employee mid-month.
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
                    <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
                      Base & Attendance
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                      <MiniField
                        label="Base Salary (₹)"
                        type="number"
                        value={editForm.baseSalary}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, baseSalary: v }))
                        }
                      />
                      <MiniField
                        label="Total Working Days"
                        type="number"
                        value={editForm.totalDays}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, totalDays: v }))
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

                    <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
                      Earnings & Deductions
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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
                        label="Other Adjustment (±₹)"
                        type="number"
                        value={editForm.otherAdjustment}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, otherAdjustment: v }))
                        }
                        placeholder="+ allowance, − fine/advance"
                      />
                      <MiniField
                        label="Adjustment Note"
                        value={editForm.adjustmentNote}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, adjustmentNote: v }))
                        }
                      />
                    </div>

                    <MiniField
                      label="Notes"
                      value={editForm.notes}
                      onChange={(v) => setEditForm((f) => ({ ...f, notes: v }))}
                      placeholder="Internal note for this month's record"
                    />

                    {/* Live preview — same math as the server, so what's
                        shown here always matches what Save will produce. */}
                    {(() => {
                      const preview = previewTotals(editForm);
                      return (
                        <div className="grid grid-cols-3 gap-3 mt-4">
                          <div className="bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-200 dark:border-slate-800">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Per Day Salary (Auto)
                            </div>
                            <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                              {money(preview.perDaySalary)}
                            </div>
                          </div>
                          <div className="bg-rose-50 dark:bg-rose-500/10 rounded-2xl p-3 border border-rose-200 dark:border-rose-500/20">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Leave Deduction (Auto)
                            </div>
                            <div className="font-extrabold text-sm text-rose-500">
                              -{money(preview.leaveDeduction)}
                            </div>
                          </div>
                          <div className="bg-[#0f4a29]/10 rounded-2xl p-3 border border-[#0f4a29]/20">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Net Salary (Auto)
                            </div>
                            <div className="font-extrabold text-sm text-[#0f4a29] dark:text-[#52b788]">
                              {money(preview.netSalary)}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2 justify-end pt-4">
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
                        onClick={() => openSlip(s.employee, s.id)}
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
                          onClick={() => openSlip(s.employee, s.id)}
                          title="View Salary Slip"
                          className="p-1 text-slate-400 hover:text-[#0f4a29]"
                        >
                          <FileText className="w-3.5 h-3.5" />
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

      {/* Salary Slip Viewer */}
      {slipEmp && (
        <SalarySlipModal
          employee={slipEmp}
          salaries={slipData?.salaries || []}
          loading={slipLoading}
          selectedId={selectedSlipId}
          onSelect={setSelectedSlipId}
          onClose={closeSlip}
          onMarkPaid={(s) => openPay(s)}
        />
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

// ---------------------------------------------------------------------
// Salary Slip Viewer
//
// Shows a professional, printable payslip for one employee/month, with a
// month picker down the side so any past month can be pulled up without
// leaving the modal. "Download PDF" uses the browser's native print flow
// (Save as PDF) against a print-only stylesheet that hides everything on
// the page except the slip itself — this needs no extra libraries and
// works fully offline, which matters for on-prem hospital deployments.
// ---------------------------------------------------------------------
function SalarySlipModal({
  employee,
  salaries,
  loading,
  selectedId,
  onSelect,
  onClose,
  onMarkPaid,
}) {
  const printRef = useRef(null);
  const selected = salaries.find((s) => s.id === selectedId) || null;

  const handleDownload = () => {
    window.print();
  };

  const slipNumber = selected
    ? `PAY-${selected.year}${String(selected.month).padStart(2, "0")}-${employee.id.slice(-6).toUpperCase()}`
    : "";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4">
      {/* Print-only stylesheet: hides the whole app except the slip when
          the browser print dialog (Download PDF) is triggered. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #salary-slip-printable, #salary-slip-printable * { visibility: visible; }
          #salary-slip-printable {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            margin: 0;
            padding: 24px;
          }
          #salary-slip-modal-chrome { display: none !important; }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] shadow-2xl w-full max-w-5xl max-h-[92vh] flex overflow-hidden">
        {/* Month sidebar */}
        <div
          id="salary-slip-modal-chrome"
          className="w-48 sm:w-56 shrink-0 border-r border-slate-100 dark:border-slate-800 flex flex-col"
        >
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Salary Slips
            </p>
            <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
              {employee.fullName}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
              </div>
            ) : salaries.length === 0 ? (
              <p className="text-slate-400 text-xs font-medium p-3">
                No salary records yet.
              </p>
            ) : (
              salaries.map((s) => {
                const active = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all ${
                      active
                        ? "bg-[#0f4a29] text-white"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>
                      {MONTH_NAMES[s.month - 1].slice(0, 3)} {s.year}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        s.status === "PAID"
                          ? active
                            ? "bg-white"
                            : "bg-[#0f4a29] dark:bg-[#52b788]"
                          : active
                            ? "bg-white/60"
                            : "bg-amber-400"
                      }`}
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Slip content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            id="salary-slip-modal-chrome"
            className="flex items-center justify-between gap-3 p-4 border-b border-slate-100 dark:border-slate-800 shrink-0"
          >
            <div className="flex items-center gap-2">
              {selected && selected.status === "PAID" && (
                <span className="flex items-center gap-1 text-[10px] font-extrabold text-slate-400">
                  <Lock className="w-3 h-3" /> Locked — paid records can't be
                  edited
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selected && selected.status === "FINALIZED" && (
                <button
                  onClick={() => onMarkPaid({ ...selected, employee })}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-4 py-2 rounded-full shadow-xs"
                >
                  <Banknote className="w-3.5 h-3.5" /> Mark as Paid
                </button>
              )}
              <button
                onClick={handleDownload}
                disabled={!selected}
                className="flex items-center gap-1.5 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-4 py-2 rounded-full shadow-xs disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" /> Download PDF
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950">
            {!selected ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs font-bold py-16">
                {loading
                  ? "Loading salary slip..."
                  : "Select a month to view its slip."}
              </div>
            ) : (
              <div
                id="salary-slip-printable"
                ref={printRef}
                className="bg-white text-slate-900 rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 max-w-3xl mx-auto"
              >
                {/* Letterhead */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-800">
                  <div className="flex items-center gap-3">
                    <img
                      src={HOSPITAL.logo}
                      alt="Hospital Logo"
                      className="w-14 h-14 object-contain rounded-xl shrink-0"
                    />
                    <div>
                      <p className="font-extrabold text-lg leading-tight">
                        {HOSPITAL.name}
                      </p>
                      <p className="text-[11px] text-slate-500 leading-snug max-w-xs">
                        {HOSPITAL.address}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {HOSPITAL.phone} • {HOSPITAL.email}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-sm uppercase tracking-wide">
                      Salary Slip
                    </p>
                    <p className="text-[11px] text-slate-500">{slipNumber}</p>
                    <p className="text-[11px] text-slate-500">
                      {MONTH_NAMES[selected.month - 1]} {selected.year}
                    </p>
                    <span
                      className={`inline-block mt-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                        selected.status === "PAID"
                          ? "bg-[#0f4a29]/10 text-[#0f4a29] border-[#0f4a29]/20"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {SLIP_STATUS(selected.status)}
                    </span>
                  </div>
                </div>

                {/* Employee details */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 py-4 border-b border-slate-200 text-xs">
                  <SlipRow label="Employee Name" value={employee.fullName} />
                  <SlipRow label="Employee ID" value={employee.id} mono />
                  <SlipRow label="Designation" value={employee.designation} />
                  <SlipRow label="Department" value={employee.department} />
                  <SlipRow
                    label="Joining Date"
                    value={formatDate(employee.joiningDate)}
                  />
                  <SlipRow label="Phone" value={employee.phone} />
                  <SlipRow label="Bank Name" value={employee.bankName} />
                  <SlipRow
                    label="Account No."
                    value={employee.bankAccountNo}
                    mono
                  />
                  <SlipRow label="IFSC Code" value={employee.ifscCode} mono />
                  <SlipRow
                    label="Pay Period"
                    value={`${MONTH_NAMES[selected.month - 1]} ${selected.year}`}
                  />
                </div>

                {/* Attendance summary */}
                <div className="grid grid-cols-5 gap-2 py-4 border-b border-slate-200 text-center">
                  {[
                    ["Working Days", selected.totalDays],
                    ["Present", selected.presentDays],
                    ["On Leave", selected.leaveDays],
                    ["Absent", selected.absentDays],
                    ["Paid Leaves", selected.paidLeaves],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-sm font-extrabold">{val}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Earnings / Deductions breakdown */}
                <div className="grid grid-cols-2 gap-6 py-4 border-b border-slate-200">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
                      Earnings
                    </p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span>Base Salary</span>
                        <span className="font-bold">
                          {money(selected.baseSalary)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          Bonus
                          {selected.bonusReason
                            ? ` (${selected.bonusReason})`
                            : ""}
                        </span>
                        <span className="font-bold">
                          {money(selected.bonus)}
                        </span>
                      </div>
                      {selected.otherAdjustment > 0 && (
                        <div className="flex justify-between">
                          <span>
                            Other Adjustment
                            {selected.adjustmentNote
                              ? ` (${selected.adjustmentNote})`
                              : ""}
                          </span>
                          <span className="font-bold">
                            {money(selected.otherAdjustment)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1.5 border-t border-slate-200 font-extrabold">
                        <span>Gross Earnings</span>
                        <span>
                          {money(
                            (selected.baseSalary || 0) +
                              (selected.bonus || 0) +
                              Math.max(selected.otherAdjustment || 0, 0),
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
                      Deductions
                    </p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span>Per Day Salary</span>
                        <span className="font-bold">
                          {money(selected.perDaySalary)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>LOP Days</span>
                        <span className="font-bold">{selected.lopDays}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Leave Deduction</span>
                        <span className="font-bold text-rose-600">
                          -{money(selected.leaveDeduction)}
                        </span>
                      </div>
                      {selected.otherAdjustment < 0 && (
                        <div className="flex justify-between">
                          <span>
                            Other Adjustment
                            {selected.adjustmentNote
                              ? ` (${selected.adjustmentNote})`
                              : ""}
                          </span>
                          <span className="font-bold text-rose-600">
                            -{money(Math.abs(selected.otherAdjustment))}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1.5 border-t border-slate-200 font-extrabold">
                        <span>Total Deductions</span>
                        <span className="text-rose-600">
                          -
                          {money(
                            (selected.leaveDeduction || 0) +
                              Math.max(-(selected.otherAdjustment || 0), 0),
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Net Salary */}
                <div className="flex items-center justify-between py-4 border-b border-slate-200">
                  <span className="text-sm font-extrabold uppercase tracking-wide">
                    Net Salary
                  </span>
                  <span className="text-xl font-extrabold text-[#0f4a29]">
                    {money(selected.netSalary)}
                  </span>
                </div>

                {/* Payment info */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 py-4 text-xs">
                  <SlipRow
                    label="Payment Status"
                    value={SLIP_STATUS(selected.status)}
                  />
                  <SlipRow
                    label="Payment Method"
                    value={selected.paymentMethod || "—"}
                  />
                  <SlipRow
                    label="Paid Date"
                    value={
                      selected.paidDate ? formatDate(selected.paidDate) : "—"
                    }
                  />
                  {selected.notes && (
                    <SlipRow label="Notes" value={selected.notes} />
                  )}
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-6 pt-6 mt-2">
                  <div className="text-center">
                    <div className="h-12 border-b border-slate-300" />
                    <p className="text-[11px] font-bold text-slate-600 mt-1">
                      Employee Signature
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="h-12 border-b border-slate-300" />
                    <p className="text-[11px] font-bold text-slate-600 mt-1">
                      Authorized Signature
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {HOSPITAL.name}
                    </p>
                  </div>
                </div>

                <p className="text-center text-[10px] text-slate-400 pt-4 mt-2 border-t border-slate-200">
                  This is a computer-generated salary slip and is valid even
                  without a signature.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlipRow({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold text-right ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}
