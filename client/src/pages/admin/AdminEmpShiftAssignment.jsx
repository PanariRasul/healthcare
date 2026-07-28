// client/src/pages/admin/AdminEmployeeShiftAssignment.jsx
// Assigns employees to shifts (Day/Night/General — see Working Timings &
// Shift Management under Biometric Attendance for defining the shifts
// themselves). Every change, single or bulk, is confirmed before it's
// applied and recorded in ShiftAssignmentHistory (previous shift, new
// shift, who changed it, when) via /admin/employee-shifts.
import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api";
import {
  Users, Sun, Moon, CalendarClock, UserX, Search, Loader2, X, Check,
  Repeat, History, ChevronLeft, ChevronRight, CheckSquare, Square,
} from "lucide-react";

const SHIFT_TYPE_META = {
  DAY: { label: "Day Shift", icon: Sun, className: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" },
  NIGHT: { label: "Night Shift", icon: Moon, className: "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20" },
  GENERAL: { label: "General Shift", icon: CalendarClock, className: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700" },
};

function ShiftBadge({ shift }) {
  if (!shift) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20">
        <UserX className="w-3 h-3" /> Unassigned
      </span>
    );
  }
  const meta = SHIFT_TYPE_META[shift.type] || SHIFT_TYPE_META.GENERAL;
  const Icon = meta.icon;
  return (
    <div>
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.className}`}>
        <Icon className="w-3 h-3" /> {meta.label}
      </span>
      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{shift.name}</div>
    </div>
  );
}

function Card({ label, value, valueClass }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClass || "text-slate-800 dark:text-white"}`}>{value}</p>
    </div>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-slate-900 rounded-2xl p-6 w-full shadow-2xl max-h-[90vh] overflow-y-auto ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        {children}
      </div>
    </div>
  );
}

function ShiftSelect({ shifts, value, onChange, placeholder = "Choose a shift" }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
    >
      <option value="">{placeholder}</option>
      {shifts.map((s) => (
        <option key={s.id} value={s.id}>{s.name} ({SHIFT_TYPE_META[s.type]?.label || s.type})</option>
      ))}
    </select>
  );
}

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// yyyy-mm-dd for <input type="date">
function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function ShiftPeriod({ from, to }) {
  if (!from) return <span className="text-slate-400 dark:text-slate-500">—</span>;
  return (
    <span className="whitespace-nowrap">
      {fmtDate(from)} <span className="text-slate-300 dark:text-slate-600">→</span>{" "}
      {to ? fmtDate(to) : <span className="text-slate-400 dark:text-slate-500 italic">Ongoing</span>}
    </span>
  );
}

export default function AdminEmployeeShiftAssignment() {
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [search, setSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [singleTarget, setSingleTarget] = useState(null); // employee being changed
  const [singleShiftId, setSingleShiftId] = useState("");
  const [singleFrom, setSingleFrom] = useState("");
  const [singleTo, setSingleTo] = useState("");
  const [singleSaving, setSingleSaving] = useState(false);

  const [showBulk, setShowBulk] = useState(false);
  const [bulkShiftId, setBulkShiftId] = useState("");
  const [bulkFrom, setBulkFrom] = useState(toDateInput(new Date()));
  const [bulkTo, setBulkTo] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const [historyEmp, setHistoryEmp] = useState(null);
  const [historyRows, setHistoryRows] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      if (search) params.set("search", search);
      if (shiftFilter) params.set("shiftType", shiftFilter);
      const data = await api.get(`/admin/employee-shifts?${params.toString()}`);
      setEmployees(data.employees);
      setTotal(data.total);
      setSummary(data.summary);
    } catch (err) {
      setError(err.message || "Could not load employees.");
    } finally {
      setLoading(false);
    }
  }, [page, search, shiftFilter]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/biometric/shifts?status=active&limit=100");
        setShifts(data.shifts);
      } catch {
        // shift list is a convenience for the dropdowns only.
      }
    })();
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / 10));

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = employees.length > 0 && employees.every((e) => selectedIds.has(e.id));
  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        employees.forEach((e) => next.delete(e.id));
      } else {
        employees.forEach((e) => next.add(e.id));
      }
      return next;
    });
  };

  const openSingle = (emp) => {
    setSingleTarget(emp);
    setSingleShiftId(emp.shiftId || "");
    setSingleFrom(toDateInput(emp.shiftEffectiveFrom) || toDateInput(new Date()));
    setSingleTo(toDateInput(emp.shiftEffectiveTo));
  };

  const confirmSingle = async () => {
    if (!singleTarget) return;
    if (singleTo && singleFrom && singleTo < singleFrom) {
      setError("\"To\" date can't be before the \"From\" date.");
      return;
    }
    setError(""); setInfo("");
    setSingleSaving(true);
    try {
      await api.put(`/admin/employee-shifts/${singleTarget.id}`, {
        shiftId: singleShiftId || null,
        effectiveFrom: singleFrom || null,
        effectiveTo: singleTo || null,
      });
      setInfo(`${singleTarget.fullName}'s shift updated.`);
      setSingleTarget(null);
      fetchEmployees();
    } catch (err) {
      setError(err.message || "Could not update shift.");
    } finally {
      setSingleSaving(false);
    }
  };

  const confirmBulk = async () => {
    if (!bulkShiftId || selectedIds.size === 0) return;
    if (bulkTo && bulkFrom && bulkTo < bulkFrom) {
      setError("\"To\" date can't be before the \"From\" date.");
      return;
    }
    setError(""); setInfo("");
    setBulkSaving(true);
    try {
      const res = await api.post("/admin/employee-shifts/bulk-assign", {
        employeeIds: Array.from(selectedIds),
        shiftId: bulkShiftId,
        effectiveFrom: bulkFrom || null,
        effectiveTo: bulkTo || null,
      });
      setInfo(res.message);
      setShowBulk(false);
      setBulkShiftId("");
      setBulkFrom(toDateInput(new Date()));
      setBulkTo("");
      setSelectedIds(new Set());
      fetchEmployees();
    } catch (err) {
      setError(err.message || "Could not bulk-assign shift.");
    } finally {
      setBulkSaving(false);
    }
  };

  const openHistory = async (emp) => {
    setHistoryEmp(emp);
    setHistoryLoading(true);
    try {
      const data = await api.get(`/admin/employee-shifts/${emp.id}/history`);
      setHistoryRows(data.history);
    } catch (err) {
      setError(err.message || "Could not load shift history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-teal-500" />
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white">Employee Shift Assignment</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Assign employees to shifts, one at a time or in bulk</p>
          </div>
        </div>
        <button
          onClick={() => setShowBulk(true)}
          disabled={selectedIds.size === 0}
          title={selectedIds.size === 0 ? "Select employees below first" : undefined}
          className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:scale-[1.02] transition-transform shadow-lg shadow-teal-500/20 disabled:opacity-40 disabled:hover:scale-100"
        >
          <Repeat className="w-4 h-4" /> Bulk Shift Assignment{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-400 text-sm font-medium">{error}</div>
      )}
      {info && !error && (
        <div className="bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/30 rounded-xl px-4 py-3 text-teal-700 dark:text-teal-400 text-sm font-medium">{info}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Total Employees" value={summary?.totalEmployees ?? "—"} />
        <Card label="Day Shift Employees" value={summary?.dayShiftEmployees ?? "—"} valueClass="text-amber-500" />
        <Card label="Night Shift Employees" value={summary?.nightShiftEmployees ?? "—"} valueClass="text-indigo-500" />
        <Card label="Unassigned Employees" value={summary?.unassignedEmployees ?? "—"} valueClass="text-rose-500" />
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search by employee name..."
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <select
          value={shiftFilter}
          onChange={(e) => { setPage(1); setShiftFilter(e.target.value); }}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
        >
          <option value="">All shifts</option>
          <option value="DAY">Day Shift</option>
          <option value="NIGHT">Night Shift</option>
          <option value="GENERAL">General Shift</option>
          <option value="UNASSIGNED">Unassigned</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm font-medium">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading employees...
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleAllOnPage} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                      {allOnPageSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  {["Employee Name", "Designation", "Current Shift", "Effective Period (From → To)", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-t border-slate-100 dark:border-slate-800/50">
                    <td className="px-4 py-3.5">
                      <button onClick={() => toggleOne(emp.id)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                        {selectedIds.has(emp.id) ? <CheckSquare className="w-4 h-4 text-teal-500" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-white whitespace-nowrap">{emp.fullName}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{emp.designation || "—"}</td>
                    <td className="px-4 py-3.5"><ShiftBadge shift={emp.shift} /></td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                      <ShiftPeriod from={emp.shiftEffectiveFrom} to={emp.shiftEffectiveTo} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                        emp.isActive
                          ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                      }`}>
                        {emp.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openSingle(emp)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap"
                        >
                          <Repeat className="w-3.5 h-3.5" /> Change Shift
                        </button>
                        <button
                          onClick={() => openHistory(emp)}
                          title="Shift history"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No employees match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Single change confirmation */}
      {singleTarget && (
        <Modal onClose={() => setSingleTarget(null)}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-slate-800 dark:text-white">Change Shift — {singleTarget.fullName}</h4>
            <button onClick={() => setSingleTarget(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
          </div>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Current Shift</p>
            <ShiftBadge shift={singleTarget.shift} />
          </div>
          <div className="mb-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">New Shift</label>
            <ShiftSelect shifts={shifts} value={singleShiftId} onChange={setSingleShiftId} placeholder="Unassign (no shift)" />
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Effective From</label>
              <input
                type="date"
                value={singleFrom}
                onChange={(e) => setSingleFrom(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Effective To <span className="normal-case font-normal text-slate-400">(optional)</span></label>
              <input
                type="date"
                value={singleTo}
                min={singleFrom || undefined}
                onChange={(e) => setSingleTo(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            This will change {singleTarget.fullName}'s shift{singleTo ? " for the selected period" : " starting the selected date"} and record it in their shift history. Continue?
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setSingleTarget(null)} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2">Cancel</button>
            <button
              onClick={confirmSingle}
              disabled={singleSaving}
              className="flex items-center gap-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
            >
              {singleSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {singleSaving ? "Saving..." : "Confirm Change"}
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk assignment */}
      {showBulk && (
        <Modal onClose={() => setShowBulk(false)}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-slate-800 dark:text-white">Bulk Shift Assignment</h4>
            <button onClick={() => setShowBulk(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            <span className="font-semibold">{selectedIds.size}</span> employee{selectedIds.size === 1 ? "" : "s"} selected.
          </p>
          <div className="mb-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Assign to Shift</label>
            <ShiftSelect shifts={shifts} value={bulkShiftId} onChange={setBulkShiftId} />
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Effective From</label>
              <input
                type="date"
                value={bulkFrom}
                onChange={(e) => setBulkFrom(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Effective To <span className="normal-case font-normal text-slate-400">(optional)</span></label>
              <input
                type="date"
                value={bulkTo}
                min={bulkFrom || undefined}
                onChange={(e) => setBulkTo(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            This will move all {selectedIds.size} selected employee{selectedIds.size === 1 ? "" : "s"} onto the chosen shift{bulkTo ? " for the selected period" : " starting the selected date"} and record the change in each of their shift histories. Continue?
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowBulk(false)} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2">Cancel</button>
            <button
              onClick={confirmBulk}
              disabled={bulkSaving || !bulkShiftId}
              className="flex items-center gap-1.5 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
            >
              {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {bulkSaving ? "Assigning..." : "Assign Shift"}
            </button>
          </div>
        </Modal>
      )}

      {/* History */}
      {historyEmp && (
        <Modal onClose={() => { setHistoryEmp(null); setHistoryRows(null); }} wide>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-slate-800 dark:text-white">{historyEmp.fullName} — Shift History</h4>
            <button onClick={() => { setHistoryEmp(null); setHistoryRows(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
          </div>
          {historyLoading || !historyRows ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : historyRows.length === 0 ? (
            <div className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">No shift changes recorded yet for this employee.</div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50">
                    {["Previous Shift", "New Shift", "Effective Period", "Changed By", "Date & Time"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((h) => (
                    <tr key={h.id} className="border-t border-slate-100 dark:border-slate-800/50">
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{h.previousShift?.name || "Unassigned"}</td>
                      <td className="px-3 py-2.5 text-slate-800 dark:text-white font-medium">{h.newShift?.name || "Unassigned"}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400"><ShiftPeriod from={h.effectiveFrom} to={h.effectiveTo} /></td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{h.changedBy?.fullName || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{new Date(h.changedAt).toLocaleString()}</td>
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