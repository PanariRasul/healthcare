// client/src/pages/admin/AdminEmployeeShiftAssignment.jsx
import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api";
import {
  PageHeader,
  SearchBar,
  TableCard,
  Th,
  Td,
  SectionCard,
} from "../../components/UI";
import {
  Users,
  Sun,
  Moon,
  CalendarClock,
  UserX,
  Loader2,
  X,
  Check,
  Repeat,
  History,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Building2,
} from "lucide-react";

const SHIFT_TYPE_META = {
  DAY: {
    label: "Day Shift",
    icon: Sun,
    className:
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  },
  NIGHT: {
    label: "Night Shift",
    icon: Moon,
    className:
      "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20",
  },
  GENERAL: {
    label: "General Shift",
    icon: CalendarClock,
    className:
      "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  },
};

function ShiftBadge({ shift }) {
  if (!shift) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20">
        <UserX className="w-3 h-3" /> Unassigned
      </span>
    );
  }
  const meta = SHIFT_TYPE_META[shift.type] || SHIFT_TYPE_META.GENERAL;
  const Icon = meta.icon;
  return (
    <div>
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${meta.className}`}
      >
        <Icon className="w-3 h-3" /> {meta.label}
      </span>
      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
        {shift.name}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, valueClass }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p
        className={`text-3xl font-extrabold mt-1 tracking-tight ${valueClass || "text-slate-900 dark:text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 w-full shadow-2xl max-h-[90vh] overflow-y-auto ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        {children}
      </div>
    </div>
  );
}

function ShiftSelect({
  shifts,
  value,
  onChange,
  placeholder = "Choose a shift",
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
    >
      <option value="">{placeholder}</option>
      {shifts.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({SHIFT_TYPE_META[s.type]?.label || s.type})
        </option>
      ))}
    </select>
  );
}

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function ShiftPeriod({ from, to }) {
  if (!from)
    return (
      <span className="text-slate-400 dark:text-slate-500 font-medium">—</span>
    );
  return (
    <span className="whitespace-nowrap font-medium text-xs">
      {fmtDate(from)}{" "}
      <span className="text-slate-300 dark:text-slate-600">→</span>{" "}
      {to ? (
        fmtDate(to)
      ) : (
        <span className="text-slate-400 dark:text-slate-500 italic">
          Ongoing
        </span>
      )}
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

  const [singleTarget, setSingleTarget] = useState(null);
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

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/biometric/shifts?status=active&limit=100");
        setShifts(data.shifts);
      } catch {
        // shift list is a convenience
      }
    })();
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / 10));

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected =
    employees.length > 0 && employees.every((e) => selectedIds.has(e.id));
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
    setSingleFrom(
      toDateInput(emp.shiftEffectiveFrom) || toDateInput(new Date()),
    );
    setSingleTo(toDateInput(emp.shiftEffectiveTo));
  };

  const confirmSingle = async () => {
    if (!singleTarget) return;
    if (singleTo && singleFrom && singleTo < singleFrom) {
      setError('"To" date can\'t be before the "From" date.');
      return;
    }
    setError("");
    setInfo("");
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
      setError('"To" date can\'t be before the "From" date.');
      return;
    }
    setError("");
    setInfo("");
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
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      {/* Page Header */}
      <PageHeader
        title="Shift Assignment"
        subtitle="Assign workforce employees to active working shifts individually or in bulk"
        action={
          <button
            onClick={() => setShowBulk(true)}
            disabled={selectedIds.size === 0}
            title={
              selectedIds.size === 0
                ? "Select employees below first"
                : undefined
            }
            className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs disabled:opacity-40"
          >
            <Repeat className="w-4 h-4" /> Bulk Shift Assignment
            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Staff"
          value={summary?.totalEmployees ?? "—"}
        />
        <SummaryCard
          label="Day Shift"
          value={summary?.dayShiftEmployees ?? "—"}
          valueClass="text-amber-600 dark:text-amber-400"
        />
        <SummaryCard
          label="Night Shift"
          value={summary?.nightShiftEmployees ?? "—"}
          valueClass="text-indigo-600 dark:text-indigo-400"
        />
        <SummaryCard
          label="Unassigned"
          value={summary?.unassignedEmployees ?? "—"}
          valueClass="text-rose-500"
        />
      </div>

      {/* Filters Toolbar */}
      <div className="flex gap-3 flex-wrap items-center justify-between">
        <SearchBar
          value={search}
          onChange={(v) => {
            setPage(1);
            setSearch(v);
          }}
          placeholder="Search employee..."
        />

        <select
          value={shiftFilter}
          onChange={(e) => {
            setPage(1);
            setShiftFilter(e.target.value);
          }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-4 py-2 text-xs font-extrabold text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
        >
          <option value="">All Shifts</option>
          <option value="DAY">Day Shift</option>
          <option value="NIGHT">Night Shift</option>
          <option value="GENERAL">General Shift</option>
          <option value="UNASSIGNED">Unassigned</option>
        </select>
      </div>

      {/* Table Card */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            staff...
          </div>
        </div>
      ) : (
        <TableCard>
          <thead>
            <tr>
              <th className="px-5 py-4 w-10 bg-slate-50/50 dark:bg-slate-900/50">
                <button
                  onClick={toggleAllOnPage}
                  className="text-slate-400 hover:text-[#0f4a29] dark:hover:text-[#52b788]"
                >
                  {allOnPageSelected ? (
                    <CheckSquare className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              {[
                "Employee Name",
                "Designation",
                "Current Shift",
                "Effective Period",
                "Status",
                "Actions",
              ].map((h) => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr
                key={emp.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                <Td>
                  <button
                    onClick={() => toggleOne(emp.id)}
                    className="text-slate-400 hover:text-[#0f4a29]"
                  >
                    {selectedIds.has(emp.id) ? (
                      <CheckSquare className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </Td>
                <Td className="font-extrabold text-slate-900 dark:text-white">
                  {emp.fullName}
                </Td>
                <Td>{emp.designation || "—"}</Td>
                <Td>
                  <ShiftBadge shift={emp.shift} />
                </Td>
                <Td>
                  <ShiftPeriod
                    from={emp.shiftEffectiveFrom}
                    to={emp.shiftEffectiveTo}
                  />
                </Td>
                <Td>
                  <span
                    className={`text-[10px] font-extrabold px-3 py-0.5 rounded-full border ${
                      emp.isActive
                        ? "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {emp.isActive ? "Active" : "Inactive"}
                  </span>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openSingle(emp)}
                      className="flex items-center gap-1 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
                    >
                      <Repeat className="w-3.5 h-3.5" /> Change
                    </button>
                    <button
                      onClick={() => openHistory(emp)}
                      title="Shift history"
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-8 text-center text-xs text-slate-400 font-medium"
                >
                  No employees match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </TableCard>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Single Shift Change Modal */}
      {singleTarget && (
        <Modal onClose={() => setSingleTarget(null)}>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
              Change Shift — {singleTarget.fullName}
            </h4>
            <button
              onClick={() => setSingleTarget(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mb-4">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
              Current Shift
            </p>
            <ShiftBadge shift={singleTarget.shift} />
          </div>
          <div className="mb-4">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
              New Shift
            </label>
            <ShiftSelect
              shifts={shifts}
              value={singleShiftId}
              onChange={setSingleShiftId}
              placeholder="Unassign (No Shift)"
            />
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Effective From
              </label>
              <input
                type="date"
                value={singleFrom}
                onChange={(e) => setSingleFrom(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Effective To
              </label>
              <input
                type="date"
                value={singleTo}
                min={singleFrom || undefined}
                onChange={(e) => setSingleTo(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setSingleTarget(null)}
              className="text-xs font-bold text-slate-500 px-4 py-2"
            >
              Cancel
            </button>
            <button
              onClick={confirmSingle}
              disabled={singleSaving}
              className="flex items-center gap-1.5 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full disabled:opacity-50"
            >
              {singleSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {singleSaving ? "Saving..." : "Confirm Change"}
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk Shift Modal */}
      {showBulk && (
        <Modal onClose={() => setShowBulk(false)}>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
              Bulk Shift Assignment
            </h4>
            <button
              onClick={() => setShowBulk(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-4">
            Assigning shift to{" "}
            <span className="text-[#0f4a29] dark:text-[#52b788]">
              {selectedIds.size}
            </span>{" "}
            selected employees.
          </p>
          <div className="mb-4">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
              Assign to Shift
            </label>
            <ShiftSelect
              shifts={shifts}
              value={bulkShiftId}
              onChange={setBulkShiftId}
            />
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Effective From
              </label>
              <input
                type="date"
                value={bulkFrom}
                onChange={(e) => setBulkFrom(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Effective To
              </label>
              <input
                type="date"
                value={bulkTo}
                min={bulkFrom || undefined}
                onChange={(e) => setBulkTo(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowBulk(false)}
              className="text-xs font-bold text-slate-500 px-4 py-2"
            >
              Cancel
            </button>
            <button
              onClick={confirmBulk}
              disabled={bulkSaving || !bulkShiftId}
              className="flex items-center gap-1.5 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full disabled:opacity-50"
            >
              {bulkSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {bulkSaving ? "Assigning..." : "Assign Shift"}
            </button>
          </div>
        </Modal>
      )}

      {/* History Modal */}
      {historyEmp && (
        <Modal
          onClose={() => {
            setHistoryEmp(null);
            setHistoryRows(null);
          }}
          wide
        >
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
              {historyEmp.fullName} — Shift History
            </h4>
            <button
              onClick={() => {
                setHistoryEmp(null);
                setHistoryRows(null);
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {historyLoading || !historyRows ? (
            <div className="flex items-center gap-2 text-slate-400 text-xs py-8 justify-center font-bold">
              <Loader2 className="w-4 h-4 animate-spin text-[#0f4a29]" />{" "}
              Loading history...
            </div>
          ) : historyRows.length === 0 ? (
            <div className="text-xs text-slate-400 py-8 text-center font-medium">
              No shift changes recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                    {[
                      "Previous Shift",
                      "New Shift",
                      "Effective Period",
                      "Changed By",
                      "Date & Time",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((h) => (
                    <tr
                      key={h.id}
                      className="border-t border-slate-100 dark:border-slate-800/60"
                    >
                      <td className="px-3 py-2.5 text-slate-500 font-medium">
                        {h.previousShift?.name || "Unassigned"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-900 dark:text-white font-extrabold">
                        {h.newShift?.name || "Unassigned"}
                      </td>
                      <td className="px-3 py-2.5">
                        <ShiftPeriod
                          from={h.effectiveFrom}
                          to={h.effectiveTo}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 font-medium">
                        {h.changedBy?.fullName || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                        {new Date(h.changedAt).toLocaleString()}
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
