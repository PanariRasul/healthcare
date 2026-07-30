// client/src/pages/admin/biometric/BiometricManagement.jsx
import { useState, useEffect, useCallback, Fragment } from "react";
import { api } from "../../../lib/api";
import {
  PageHeader,
  SearchBar,
  TableCard,
  Th,
  Td,
  SectionCard,
} from "../../../components/UI";
import {
  Fingerprint,
  LayoutDashboard,
  MonitorSmartphone,
  Link2,
  Users2,
  FileBarChart,
  Plus,
  Loader2,
  Pencil,
  Power,
  X,
  Check,
  UserPlus,
  Clock,
  Eye,
  Trash2,
  Sun,
  Moon,
  CalendarClock,
  TrendingUp,
} from "lucide-react";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "devices", label: "Devices", icon: MonitorSmartphone },
  { key: "shifts", label: "Shifts", icon: Clock },
  { key: "userMapping", label: "User Mapping", icon: Link2 },
  { key: "employeeMapping", label: "Employee Mapping", icon: Users2 },
  { key: "report", label: "Attendance Report", icon: FileBarChart },
];

export default function BiometricManagement() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Biometric Attendance"
        subtitle="Manage hardware devices, shift schedules, mappings, and attendance reports"
        action={
          <div className="flex gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full shadow-2xs overflow-x-auto max-w-full">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all whitespace-nowrap ${
                    active
                      ? "bg-[#0f4a29] text-white shadow-xs"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        }
      />

      {tab === "dashboard" && <DashboardTab />}
      {tab === "devices" && <DevicesTab />}
      {tab === "shifts" && <ShiftsTab />}
      {tab === "userMapping" && <MappingTab kind="user" />}
      {tab === "employeeMapping" && <MappingTab kind="employee" />}
      {tab === "report" && <ReportTab />}
    </div>
  );
}

// ============================================================================
// Shared Subcomponents
// ============================================================================

function Banner({ error, info }) {
  return (
    <>
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
    </>
  );
}

function Loading({ label }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
        <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> {label}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}) {
  return (
    <div>
      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
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

function IconBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {children}
    </button>
  );
}

function Card({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
        {value}
      </p>
      {sub && (
        <p className="text-[11px] font-medium text-slate-400 mt-0.5">{sub}</p>
      )}
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
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 w-full shadow-2xl max-h-[90vh] overflow-y-auto ${wide ? "max-w-2xl" : "max-w-lg"}`}
      >
        {children}
      </div>
    </div>
  );
}

function minutesToHrs(mins) {
  if (!mins) return "0h 0m";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ============================================================================
// Dashboard tab
// ============================================================================

function DashboardTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { dashboard } = await api.get("/biometric/dashboard");
        setData(dashboard);
      } catch (err) {
        setError(err.message || "Could not load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loading label="Loading dashboard..." />;

  return (
    <div className="space-y-4">
      <Banner error={error} />
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card
            label="Devices"
            value={`${data.activeDevices}/${data.totalDevices}`}
            sub="active / total"
          />
          <Card label="Mapped Users" value={data.mappedUsers} />
          <Card label="Mapped Employees" value={data.mappedEmployees} />
          <Card label="Today's Punches" value={data.todaysPunches} />
          <Card label="Present Today" value={data.presentToday} />
          <Card label="Absent Today" value={data.absentToday} sub="estimated" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Devices tab
// ============================================================================

const emptyDeviceForm = {
  name: "",
  deviceCode: "",
  serialNumber: "",
  location: "",
};

function DevicesTab() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyDeviceForm);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { devices: data } = await api.get(
        `/biometric/devices${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      );
      setDevices(data);
    } catch (err) {
      setError(err.message || "Could not load devices.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (
      !createForm.name ||
      !createForm.deviceCode ||
      !createForm.serialNumber
    ) {
      return setError("Name, device code, and serial number are required.");
    }
    setSaving(true);
    try {
      await api.post("/biometric/devices", createForm);
      setInfo(`${createForm.name} added.`);
      setCreateForm(emptyDeviceForm);
      setShowCreate(false);
      fetchDevices();
    } catch (err) {
      setError(err.message || "Could not create device.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (d) => {
    setEditingId(d.id);
    setEditForm({
      name: d.name,
      deviceCode: d.deviceCode,
      serialNumber: d.serialNumber,
      location: d.location || "",
    });
  };

  const saveEdit = async (id) => {
    setError("");
    setInfo("");
    setSaving(true);
    try {
      await api.put(`/biometric/devices/${id}`, editForm);
      setInfo("Device updated.");
      setEditingId(null);
      fetchDevices();
    } catch (err) {
      setError(err.message || "Could not update device.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d) => {
    setError("");
    setInfo("");
    try {
      await api.patch(`/biometric/devices/${d.id}/toggle`);
      setInfo(`${d.name} ${d.isActive ? "disabled" : "enabled"}.`);
      fetchDevices();
    } catch (err) {
      setError(err.message || "Could not update device status.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search devices..."
        />
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full shadow-xs"
        >
          <Plus className="w-4 h-4" /> Add Device
        </button>
      </div>

      <Banner error={error} info={info} />

      {showCreate && (
        <SectionCard title="Add Biometric Device" icon={MonitorSmartphone}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Device Name"
                value={createForm.name}
                onChange={(v) => setCreateForm((f) => ({ ...f, name: v }))}
                placeholder="Main Gate ZKTeco"
                required
              />
              <Field
                label="Device Code"
                value={createForm.deviceCode}
                onChange={(v) =>
                  setCreateForm((f) => ({ ...f, deviceCode: v }))
                }
                placeholder="DEV-001"
                required
              />
              <Field
                label="Serial Number"
                value={createForm.serialNumber}
                onChange={(v) =>
                  setCreateForm((f) => ({ ...f, serialNumber: v }))
                }
                placeholder="ZK123456789"
                required
              />
              <Field
                label="Location"
                value={createForm.location}
                onChange={(v) => setCreateForm((f) => ({ ...f, location: v }))}
                placeholder="Main Entrance"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-xs font-bold text-slate-500 px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Device"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {loading ? (
        <Loading label="Loading devices..." />
      ) : (
        <TableCard>
          <thead>
            <tr>
              {[
                "Name",
                "Device Code",
                "Serial No.",
                "Location",
                "Status",
                "Actions",
              ].map((h) => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr
                key={d.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                {editingId === d.id ? (
                  <td
                    colSpan={6}
                    className="p-5 bg-slate-50/50 dark:bg-slate-950/40"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <Field
                        label="Name"
                        value={editForm.name}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, name: v }))
                        }
                      />
                      <Field
                        label="Device Code"
                        value={editForm.deviceCode}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, deviceCode: v }))
                        }
                      />
                      <Field
                        label="Serial Number"
                        value={editForm.serialNumber}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, serialNumber: v }))
                        }
                      />
                      <Field
                        label="Location"
                        value={editForm.location}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, location: v }))
                        }
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs font-bold text-slate-500 px-3 py-1.5"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(d.id)}
                        disabled={saving}
                        className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-4 py-1.5 rounded-full shadow-xs"
                      >
                        Save
                      </button>
                    </div>
                  </td>
                ) : (
                  <>
                    <Td className="font-extrabold text-slate-900 dark:text-white">
                      {d.name}
                    </Td>
                    <Td className="font-mono text-xs">{d.deviceCode}</Td>
                    <Td className="font-mono text-xs">{d.serialNumber}</Td>
                    <Td>{d.location || "—"}</Td>
                    <Td>
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                          d.isActive
                            ? "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {d.isActive ? "Active" : "Disabled"}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex gap-1 items-center">
                        <IconBtn title="Edit" onClick={() => startEdit(d)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn
                          title={d.isActive ? "Disable" : "Enable"}
                          onClick={() => toggleActive(d)}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </IconBtn>
                      </div>
                    </Td>
                  </>
                )}
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-8 text-center text-xs text-slate-400 font-medium"
                >
                  No devices registered.
                </td>
              </tr>
            )}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}

// ============================================================================
// Shifts tab
// ============================================================================

const SHIFT_TYPE_META = {
  DAY: {
    label: "Day Shift",
    icon: Sun,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  NIGHT: {
    label: "Night Shift",
    icon: Moon,
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  GENERAL: {
    label: "General Shift",
    icon: CalendarClock,
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

const emptyShiftForm = {
  name: "",
  code: "",
  type: "GENERAL",
  startTime: "09:00",
  endTime: "17:00",
  graceBeforeMinutes: 0,
  graceAfterMinutes: 0,
  breakMinutes: 0,
  overtimeAfterMinutes: 0,
  isActive: true,
  description: "",
};

function previewWorkingMinutes({ startTime, endTime, breakMinutes }) {
  const [sh, sm] = (startTime || "").split(":").map(Number);
  const [eh, em] = (endTime || "").split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return null;
  const span = end <= start ? 1440 - start + end : end - start;
  return Math.max(0, span - (Number(breakMinutes) || 0));
}

function formatMinutesHrs(mins) {
  if (mins === null || mins === undefined) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatTime12h(value) {
  if (typeof value !== "string") return "—";
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  let hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${period}`;
}

function ShiftTypeBadge({ type }) {
  const meta = SHIFT_TYPE_META[type] || SHIFT_TYPE_META.GENERAL;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${meta.className}`}
    >
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

function StatusBadge({
  active,
  activeLabel = "Active",
  inactiveLabel = "Inactive",
}) {
  return (
    <span
      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
        active
          ? "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20"
          : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
      }`}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function ShiftForm({ form, setForm }) {
  const preview = previewWorkingMinutes(form);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Shift Name"
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="Day Shift"
        />
        <Field
          label="Shift Code"
          value={form.code}
          onChange={(v) => setForm((f) => ({ ...f, code: v }))}
          placeholder="DAY-01"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Shift Start Time"
          type="time"
          value={form.startTime}
          onChange={(v) => setForm((f) => ({ ...f, startTime: v }))}
        />
        <Field
          label="Shift End Time"
          type="time"
          value={form.endTime}
          onChange={(v) => setForm((f) => ({ ...f, endTime: v }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Grace Time Before (mins)"
          type="number"
          value={form.graceBeforeMinutes}
          onChange={(v) => setForm((f) => ({ ...f, graceBeforeMinutes: v }))}
        />
        <Field
          label="Grace Time After (mins)"
          type="number"
          value={form.graceAfterMinutes}
          onChange={(v) => setForm((f) => ({ ...f, graceAfterMinutes: v }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Break Duration (mins)"
          type="number"
          value={form.breakMinutes}
          onChange={(v) => setForm((f) => ({ ...f, breakMinutes: v }))}
        />
        <Field
          label="Overtime After (mins)"
          type="number"
          value={form.overtimeAfterMinutes}
          onChange={(v) => setForm((f) => ({ ...f, overtimeAfterMinutes: v }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
            Shift Type
          </label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
          >
            <option value="DAY">Day Shift</option>
            <option value="NIGHT">Night Shift</option>
            <option value="GENERAL">General Shift</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
            Status
          </label>
          <select
            value={form.isActive ? "active" : "inactive"}
            onChange={(e) =>
              setForm((f) => ({ ...f, isActive: e.target.value === "active" }))
            }
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
          Total Working Hours
        </label>
        <div className="w-full bg-[#0f4a29]/10 border border-[#0f4a29]/20 rounded-xl px-3 py-2 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788]">
          {preview === null
            ? "Set valid start & end time"
            : formatMinutesHrs(preview)}
        </div>
      </div>
    </div>
  );
}

function ShiftsTab() {
  const [shifts, setShifts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyShiftForm);
  const [saving, setSaving] = useState(false);

  const [viewShift, setViewShift] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const data = await api.get(`/biometric/shifts?${params.toString()}`);
      setShifts(data.shifts);
      setTotal(data.total);
      setSummary(data.summary);
    } catch (err) {
      setError(err.message || "Could not load shifts.");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const totalPages = Math.max(1, Math.ceil(total / 10));

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyShiftForm);
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      code: s.code,
      type: s.type,
      startTime: s.startTime,
      endTime: s.endTime,
      graceBeforeMinutes: s.graceBeforeMinutes,
      graceAfterMinutes: s.graceAfterMinutes,
      breakMinutes: s.breakMinutes,
      overtimeAfterMinutes: s.overtimeAfterMinutes,
      isActive: s.isActive,
      description: s.description || "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (
      !form.name.trim() ||
      !form.code.trim() ||
      !form.startTime ||
      !form.endTime
    ) {
      return setError(
        "Shift name, code, start time, and end time are required.",
      );
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/biometric/shifts/${editingId}`, form);
        setInfo(`${form.name} updated.`);
      } else {
        await api.post("/biometric/shifts", form);
        setInfo(`${form.name} created.`);
      }
      closeForm();
      fetchShifts();
    } catch (err) {
      setError(err.message || "Could not save shift.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s) => {
    setError("");
    setInfo("");
    try {
      await api.patch(`/biometric/shifts/${s.id}/toggle`);
      setInfo(`${s.name} ${s.isActive ? "deactivated" : "activated"}.`);
      fetchShifts();
    } catch (err) {
      setError(err.message || "Could not update shift status.");
    }
  };

  return (
    <div className="space-y-4">
      <Banner error={error} info={info} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card label="Total Shifts" value={summary?.totalShifts ?? "—"} />
        <Card label="Active Shifts" value={summary?.activeShifts ?? "—"} />
        <Card
          label="Assigned Staff"
          value={summary?.employeesAssigned ?? "—"}
        />
        <Card
          label="Avg. Hours"
          value={summary ? `${summary.avgWorkingHours}h` : "—"}
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search shifts..."
        />
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full shadow-xs"
        >
          <Plus className="w-4 h-4" /> Add Shift
        </button>
      </div>

      {loading ? (
        <Loading label="Loading shifts..." />
      ) : (
        <TableCard>
          <thead>
            <tr>
              {[
                "Shift Name",
                "Code",
                "Start",
                "End",
                "Total Hours",
                "Status",
                "Actions",
              ].map((h) => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr
                key={s.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                <Td className="font-extrabold text-slate-900 dark:text-white">
                  <div>{s.name}</div>
                  <div className="mt-0.5">
                    <ShiftTypeBadge type={s.type} />
                  </div>
                </Td>
                <Td className="font-mono text-xs">{s.code}</Td>
                <Td>{formatTime12h(s.startTime)}</Td>
                <Td>{formatTime12h(s.endTime)}</Td>
                <Td className="font-bold">
                  {formatMinutesHrs(s.totalWorkingMinutes)}
                </Td>
                <Td>
                  <StatusBadge active={s.isActive} />
                </Td>
                <Td>
                  <div className="flex gap-1 items-center">
                    <IconBtn title="Edit" onClick={() => openEdit(s)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn
                      title={s.isActive ? "Deactivate" : "Activate"}
                      onClick={() => toggleActive(s)}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </IconBtn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      {showForm && (
        <Modal onClose={closeForm} wide>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
              {editingId ? "Edit Shift" : "Add Shift"}
            </h4>
            <button
              onClick={closeForm}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={submitForm}>
            <ShiftForm form={form} setForm={setForm} />
            <div className="flex gap-2 justify-end pt-4">
              <button
                type="button"
                onClick={closeForm}
                className="text-xs font-bold text-slate-500 px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full shadow-xs"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Create Shift"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// Mapping Tab (Users & Employees)
// ============================================================================

function MappingTab({ kind }) {
  const isUser = kind === "user";

  const [mappings, setMappings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [personSearch, setPersonSearch] = useState("");
  const [personResults, setPersonResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [showAssign, setShowAssign] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [assignForm, setAssignForm] = useState({
    biometricId: "",
    deviceId: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchMappings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { mappings: data } = await api.get("/biometric/mappings");
      setMappings(data.filter((m) => (isUser ? m.userId : m.employeeId)));
    } catch (err) {
      setError(err.message || "Could not load mappings.");
    } finally {
      setLoading(false);
    }
  }, [isUser]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  useEffect(() => {
    (async () => {
      try {
        const { devices: data } = await api.get("/biometric/devices");
        setDevices(data.filter((d) => d.isActive));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/biometric/shifts?status=active&limit=100");
        setShifts(data.shifts);
      } catch {}
    })();
  }, []);

  const runSearch = async () => {
    setSearching(true);
    setError("");
    try {
      const endpoint = isUser ? "/biometric/users" : "/biometric/employees";
      const { users, employees } = await api.get(
        `${endpoint}?search=${encodeURIComponent(personSearch)}`,
      );
      setPersonResults(isUser ? users : employees);
    } catch (err) {
      setError(err.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const openAssign = (person) => {
    setSelectedPerson(person);
    setAssignForm({ biometricId: "", deviceId: devices[0]?.id || "" });
    setShowAssign(true);
  };

  const submitAssign = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!assignForm.biometricId || !assignForm.deviceId) {
      return setError("Biometric ID and device are both required.");
    }
    setSaving(true);
    try {
      await api.post("/biometric/mappings", {
        biometricId: assignForm.biometricId,
        deviceId: assignForm.deviceId,
        ...(isUser
          ? { userId: selectedPerson.id }
          : { employeeId: selectedPerson.id }),
      });
      setInfo(`${selectedPerson.fullName} mapped successfully.`);
      setShowAssign(false);
      setSelectedPerson(null);
      fetchMappings();
    } catch (err) {
      setError(err.message || "Could not create mapping.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (m) => {
    setError("");
    setInfo("");
    try {
      await api.patch(`/biometric/mappings/${m.id}/deactivate`);
      setInfo("Mapping deactivated.");
      fetchMappings();
    } catch (err) {
      setError(err.message || "Could not deactivate mapping.");
    }
  };

  return (
    <div className="space-y-4">
      <Banner error={error} info={info} />

      <SectionCard
        title={`Search ${isUser ? "Staff" : "Employees"} to Map`}
        icon={UserPlus}
      >
        <div className="flex gap-2 flex-wrap mb-3">
          <SearchBar
            value={personSearch}
            onChange={setPersonSearch}
            placeholder={`Search ${isUser ? "staff" : "employee"}...`}
          />
          <button
            onClick={runSearch}
            disabled={searching}
            className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full shadow-xs"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {personResults.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            {personResults.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <div>
                  <p className="text-xs font-extrabold text-slate-800 dark:text-white">
                    {p.fullName}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {isUser ? `${p.role} · ${p.email}` : p.designation}
                  </p>
                </div>
                <button
                  onClick={() => openAssign(p)}
                  className="text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
                >
                  + Map Biometric ID
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {showAssign && selectedPerson && (
        <SectionCard
          title={`Assign Biometric ID for ${selectedPerson.fullName}`}
          icon={Link2}
        >
          <form onSubmit={submitAssign} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Biometric ID"
                value={assignForm.biometricId}
                onChange={(v) =>
                  setAssignForm((f) => ({ ...f, biometricId: v }))
                }
                placeholder="Enrollment / card number"
                required
              />
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  Device
                </label>
                <select
                  value={assignForm.deviceId}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, deviceId: e.target.value }))
                  }
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                >
                  <option value="">Select device</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.deviceCode})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowAssign(false);
                  setSelectedPerson(null);
                }}
                className="text-xs font-bold text-slate-500 px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full shadow-xs"
              >
                {saving ? "Assigning..." : "Assign ID"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {loading ? (
        <Loading label="Loading mappings..." />
      ) : (
        <TableCard>
          <thead>
            <tr>
              {["Name", "Biometric ID", "Device", "Status", "Actions"].map(
                (h) => (
                  <Th key={h}>{h}</Th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr
                key={m.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                <Td className="font-extrabold text-slate-900 dark:text-white">
                  {isUser ? m.user?.fullName : m.employee?.fullName}
                </Td>
                <Td className="font-mono text-xs">{m.biometricId}</Td>
                <Td>{m.device?.name || "—"}</Td>
                <Td>
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                      m.isActive
                        ? "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {m.isActive ? "Active" : "Deactivated"}
                  </span>
                </Td>
                <Td>
                  {m.isActive && (
                    <IconBtn title="Deactivate" onClick={() => deactivate(m)}>
                      <Power className="w-3.5 h-3.5 text-rose-500" />
                    </IconBtn>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}

// ============================================================================
// Attendance Report tab
// ============================================================================

function ReportTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: today, to: today });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      const result = await api.get(
        `/biometric/attendance/report?${params.toString()}`,
      );
      setData(result);
    } catch (err) {
      setError(err.message || "Could not load attendance report.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="space-y-4">
      <Banner error={error} />

      <div className="flex gap-3 flex-wrap items-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
        <div>
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
            From
          </label>
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
            To
          </label>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
          />
        </div>
      </div>

      {loading ? (
        <Loading label="Loading report..." />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card label="Present Days" value={data.summary.presentDays} />
            <Card label="Absent Days" value={data.summary.absentDays} />
            <Card label="Half Days" value={data.summary.halfDays} />
            <Card
              label="Total Overtime"
              value={minutesToHrs(data.summary.totalOvertimeMinutes)}
            />
          </div>

          <TableCard>
            <thead>
              <tr>
                {[
                  "Date",
                  "Person",
                  "First Punch",
                  "Last Punch",
                  "Working Hrs",
                  "Late",
                  "Overtime",
                  "Status",
                ].map((h) => (
                  <Th key={h}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.records.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 dark:border-slate-800/60"
                >
                  <Td className="font-bold">
                    {new Date(r.date).toLocaleDateString()}
                  </Td>
                  <Td className="font-extrabold text-slate-900 dark:text-white">
                    {r.person?.fullName || "—"}
                  </Td>
                  <Td>
                    {r.firstPunch
                      ? new Date(r.firstPunch).toLocaleTimeString()
                      : "—"}
                  </Td>
                  <Td>
                    {r.lastPunch
                      ? new Date(r.lastPunch).toLocaleTimeString()
                      : "—"}
                  </Td>
                  <Td>{minutesToHrs(r.workingMinutes)}</Td>
                  <Td>{r.lateMinutes} min</Td>
                  <Td>{minutesToHrs(r.overtimeMinutes)}</Td>
                  <Td>
                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                      {r.status}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </>
      ) : null}
    </div>
  );
}
