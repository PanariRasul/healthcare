// client/src/pages/admin/biometric/BiometricManagement.jsx
// Single page, internally tabbed — Dashboard / Devices / User Mapping /
// Employee Mapping / Attendance Logs / Attendance Report. Mirrors the visual
// language of AdminStaffAccounts.jsx and AdminEmployeeDirectory.jsx (same
// api lib, same Tailwind palette/rounded-2xl cards/table patterns), no new
// design system introduced.
//
// NOTE: this assumes `api` exposes a `.patch()` method (used for the
// device-toggle and mapping-deactivate endpoints), the same way it exposes
// .get/.post/.put elsewhere in this codebase. If your lib/api.js doesn't
// have one yet, it's a small addition mirroring the existing put/post
// implementations.
import { useState, useEffect, useCallback, Fragment } from "react";
import { api } from "../../../lib/api";
import {
  Fingerprint, LayoutDashboard, MonitorSmartphone, Link2, Users2, ScrollText,
  FileBarChart, Plus, Loader2, Pencil, Power, X, Check, Search, UserPlus,
  Clock, Eye, Trash2, Sun, Moon, CalendarClock,
} from "lucide-react";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "devices", label: "Devices", icon: MonitorSmartphone },
  { key: "shifts", label: "Shifts", icon: Clock },
  { key: "userMapping", label: "User Mapping", icon: Link2 },
  { key: "employeeMapping", label: "Employee Mapping", icon: Users2 },
  // { key: "logs", label: "Attendance Logs", icon: ScrollText },
  { key: "report", label: "Attendance Report", icon: FileBarChart },
];

export default function BiometricManagement() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="w-5 h-5 text-teal-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Biometric Attendance</h2>
      </div>

      <div className="flex gap-1.5 flex-wrap border-b border-slate-200 dark:border-slate-800 pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                active
                  ? "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200/80 dark:border-teal-500/20"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent"
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "devices" && <DevicesTab />}
      {tab === "shifts" && <ShiftsTab />}
      {tab === "userMapping" && <MappingTab kind="user" />}
      {tab === "employeeMapping" && <MappingTab kind="employee" />}
      {tab === "logs" && <LogsTab />}
      {tab === "report" && <ReportTab />}
    </div>
  );
}

// ============================================================================
// Shared bits
// ============================================================================

function Banner({ error, info }) {
  return (
    <>
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
    </>
  );
}

function Loading({ label }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm font-medium">
        <Loader2 className="w-5 h-5 animate-spin" /> {label}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
      />
    </div>
  );
}

function IconBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {children}
    </button>
  );
}

function Card({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card label="Devices" value={`${data.activeDevices}/${data.totalDevices}`} sub="active / total" />
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

const emptyDeviceForm = { name: "", deviceCode: "", serialNumber: "", location: "" };

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
      const { devices: data } = await api.get(`/biometric/devices${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setDevices(data);
    } catch (err) {
      setError(err.message || "Could not load devices.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");
    if (!createForm.name || !createForm.deviceCode || !createForm.serialNumber) {
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
    setEditForm({ name: d.name, deviceCode: d.deviceCode, serialNumber: d.serialNumber, location: d.location || "" });
  };

  const saveEdit = async (id) => {
    setError(""); setInfo("");
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
    setError(""); setInfo("");
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
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search devices..."
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
          />
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:scale-[1.02] transition-transform shadow-lg shadow-teal-500/20"
        >
          <Plus className="w-4 h-4" /> Add Device
        </button>
      </div>

      <Banner error={error} info={info} />

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Device Name" value={createForm.name} onChange={(v) => setCreateForm(f => ({ ...f, name: v }))} placeholder="Main Gate ZKTeco" />
            <Field label="Device Code" value={createForm.deviceCode} onChange={(v) => setCreateForm(f => ({ ...f, deviceCode: v }))} placeholder="DEV-001" />
            <Field label="Serial Number" value={createForm.serialNumber} onChange={(v) => setCreateForm(f => ({ ...f, serialNumber: v }))} placeholder="ZK123456789" />
            <Field label="Location" value={createForm.location} onChange={(v) => setCreateForm(f => ({ ...f, location: v }))} placeholder="Main Entrance" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
              {saving ? "Creating..." : "Create Device"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2.5">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <Loading label="Loading devices..." />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  {["Name", "Device Code", "Serial No.", "Location", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100 dark:border-slate-800/50">
                    {editingId === d.id ? (
                      <td colSpan={6} className="px-5 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          <Field label="Name" value={editForm.name} onChange={(v) => setEditForm(f => ({ ...f, name: v }))} />
                          <Field label="Device Code" value={editForm.deviceCode} onChange={(v) => setEditForm(f => ({ ...f, deviceCode: v }))} />
                          <Field label="Serial Number" value={editForm.serialNumber} onChange={(v) => setEditForm(f => ({ ...f, serialNumber: v }))} />
                          <Field label="Location" value={editForm.location} onChange={(v) => setEditForm(f => ({ ...f, location: v }))} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(d.id)} disabled={saving} className="flex items-center gap-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50">
                            <Check className="w-3.5 h-3.5" /> Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 px-3 py-2">
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-white">{d.name}</td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{d.deviceCode}</td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{d.serialNumber}</td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{d.location || "—"}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                            d.isActive
                              ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                          }`}>
                            {d.isActive ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-1">
                            <IconBtn title="Edit" onClick={() => startEdit(d)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                            <IconBtn title={d.isActive ? "Disable" : "Enable"} onClick={() => toggleActive(d)}><Power className="w-3.5 h-3.5" /></IconBtn>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No devices yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Shared Modal
// ============================================================================

function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-slate-900 rounded-2xl p-6 w-full shadow-2xl max-h-[90vh] overflow-y-auto ${wide ? "max-w-2xl" : "max-w-lg"}`}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Working Timings & Shift Management tab
// ============================================================================

const SHIFT_TYPE_META = {
  DAY: { label: "Day Shift", icon: Sun, className: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" },
  NIGHT: { label: "Night Shift", icon: Moon, className: "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20" },
  GENERAL: { label: "General Shift", icon: CalendarClock, className: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700" },
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

// Mirrors the backend's shift-span math (biometric.helper.js) just for live
// preview in the form — the API's stored totalWorkingMinutes is still the
// source of truth once saved.
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

// "HH:mm" (24-hour, as stored) -> "h:mm AM/PM" for display. Native <input
// type="time"> fields already render in the browser's own locale format, so
// this is only needed for the read-only table/view text.
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
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.className}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

function StatusBadge({ active, activeLabel = "Active", inactiveLabel = "Inactive" }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
      active
        ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
    }`}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function ShiftForm({ form, setForm }) {
  const preview = previewWorkingMinutes(form);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Shift Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Day Shift" />
        <Field label="Shift Code" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} placeholder="DAY-01" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Shift Start Time" type="time" value={form.startTime} onChange={(v) => setForm((f) => ({ ...f, startTime: v }))} />
        <Field label="Shift End Time" type="time" value={form.endTime} onChange={(v) => setForm((f) => ({ ...f, endTime: v }))} />
      </div>
      {form.startTime && form.endTime && form.endTime <= form.startTime && (
        <p className="text-xs text-indigo-500 dark:text-indigo-400 -mt-2">Crosses midnight — end time is treated as the next day.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Grace Time Before Shift Start (mins)" type="number" value={form.graceBeforeMinutes} onChange={(v) => setForm((f) => ({ ...f, graceBeforeMinutes: v }))} placeholder="e.g. 60 for 1 hour" />
        <Field label="Grace Time After Shift Start (mins)" type="number" value={form.graceAfterMinutes} onChange={(v) => setForm((f) => ({ ...f, graceAfterMinutes: v }))} placeholder="e.g. 60 for 1 hour" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Break Duration (mins, optional)" type="number" value={form.breakMinutes} onChange={(v) => setForm((f) => ({ ...f, breakMinutes: v }))} placeholder="e.g. 60" />
        <Field label="Overtime Starts After (mins past shift end)" type="number" value={form.overtimeAfterMinutes} onChange={(v) => setForm((f) => ({ ...f, overtimeAfterMinutes: v }))} placeholder="e.g. 30" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Shift Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
          >
            <option value="DAY">Day Shift</option>
            <option value="NIGHT">Night Shift</option>
            <option value="GENERAL">General Shift</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Status</label>
          <select
            value={form.isActive ? "active" : "inactive"}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === "active" }))}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
          Total Working Hours (Auto Calculate)
        </label>
        <div className="w-full bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 rounded-xl px-3 py-2.5 text-sm font-semibold text-teal-700 dark:text-teal-400">
          {preview === null ? "Set a valid start and end time" : formatMinutesHrs(preview)}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Description (optional)</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
        />
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
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

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
    setError(""); setInfo("");
    if (!form.name.trim() || !form.code.trim() || !form.startTime || !form.endTime) {
      return setError("Shift name, code, start time, and end time are all required.");
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
    setError(""); setInfo("");
    try {
      await api.patch(`/biometric/shifts/${s.id}/toggle`);
      setInfo(`${s.name} ${s.isActive ? "deactivated" : "activated"}.`);
      fetchShifts();
    } catch (err) {
      setError(err.message || "Could not update shift status.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await api.del(`/biometric/shifts/${deleteTarget.id}`);
      setInfo(`${deleteTarget.name} removed.`);
      setDeleteTarget(null);
      fetchShifts();
    } catch (err) {
      setError(err.message || "Could not remove shift.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Banner error={error} info={info} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Total Shifts" value={summary?.totalShifts ?? "—"} />
        <Card label="Active Shifts" value={summary?.activeShifts ?? "—"} />
        <Card label="Employees Assigned" value={summary?.employeesAssigned ?? "—"} />
        <Card label="Avg. Working Hours" value={summary ? `${summary.avgWorkingHours}h` : "—"} />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder="Search shifts..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:scale-[1.02] transition-transform shadow-lg shadow-teal-500/20"
        >
          <Plus className="w-4 h-4" /> Add Shift
        </button>
      </div>

      {loading ? (
        <Loading label="Loading shifts..." />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  {["Shift Name", "Code", "Start", "End", "Grace Before", "Grace After", "Total Hours", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800/50">
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-800 dark:text-white">{s.name}</div>
                      <div className="mt-1"><ShiftTypeBadge type={s.type} /></div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{s.code}</td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatTime12h(s.startTime)}</td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatTime12h(s.endTime)}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatMinutesHrs(s.graceBeforeMinutes)}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatMinutesHrs(s.graceAfterMinutes)}</td>
                    <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-white whitespace-nowrap">{formatMinutesHrs(s.totalWorkingMinutes)}</td>
                    <td className="px-4 py-3.5"><StatusBadge active={s.isActive} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-1">
                        <IconBtn title="View" onClick={() => setViewShift(s)}><Eye className="w-3.5 h-3.5" /></IconBtn>
                        <IconBtn title="Edit" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                        <IconBtn title={s.isActive ? "Deactivate" : "Activate"} onClick={() => toggleActive(s)}><Power className="w-3.5 h-3.5" /></IconBtn>
                        <IconBtn title="Delete" onClick={() => setDeleteTarget(s)}><Trash2 className="w-3.5 h-3.5 text-rose-500" /></IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
                {shifts.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No shifts yet. Click "Add Shift" to create one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <Modal onClose={closeForm} wide>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-slate-800 dark:text-white">{editingId ? "Edit Shift" : "Add Shift"}</h4>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
          </div>
          <form onSubmit={submitForm}>
            <ShiftForm form={form} setForm={setForm} />
            <div className="flex gap-2 mt-5">
              <button type="submit" disabled={saving} className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Create Shift"}
              </button>
              <button type="button" onClick={closeForm} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2.5">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* View */}
      {viewShift && (
        <Modal onClose={() => setViewShift(null)}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-semibold text-slate-800 dark:text-white">{viewShift.name}</h4>
              <p className="text-xs text-slate-400 dark:text-slate-500">{viewShift.code}</p>
            </div>
            <button onClick={() => setViewShift(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2 mb-4">
            <ShiftTypeBadge type={viewShift.type} />
            <StatusBadge active={viewShift.isActive} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <ViewRow label="Start Time" value={formatTime12h(viewShift.startTime)} />
            <ViewRow label="End Time" value={formatTime12h(viewShift.endTime)} />
            <ViewRow label="Grace Before" value={formatMinutesHrs(viewShift.graceBeforeMinutes)} />
            <ViewRow label="Grace After" value={formatMinutesHrs(viewShift.graceAfterMinutes)} />
            <ViewRow label="Break Duration" value={formatMinutesHrs(viewShift.breakMinutes)} />
            <ViewRow label="Overtime After" value={formatMinutesHrs(viewShift.overtimeAfterMinutes)} />
            <ViewRow label="Total Working Hours" value={formatMinutesHrs(viewShift.totalWorkingMinutes)} />
            <ViewRow label="Employees Assigned" value={viewShift._count?.mappings ?? 0} />
          </div>
          {viewShift.description && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Description</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{viewShift.description}</p>
            </div>
          )}
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <h4 className="font-semibold text-slate-800 dark:text-white mb-2">Remove {deleteTarget.name}?</h4>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            This cannot be undone. If employees are assigned or attendance history exists for this shift, removal will be blocked — deactivate it instead.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2">Cancel</button>
            <button onClick={confirmDelete} disabled={deleting} className="bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50">
              {deleting ? "Removing..." : "Remove"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ViewRow({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      <p className="text-slate-700 dark:text-slate-200 font-medium">{value}</p>
    </div>
  );
}

// ============================================================================
// User Mapping / Employee Mapping tab (shared component, kind="user"|"employee")
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
  const [assignForm, setAssignForm] = useState({ biometricId: "", deviceId: "" });
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

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  useEffect(() => {
    (async () => {
      try {
        const { devices: data } = await api.get("/biometric/devices");
        setDevices(data.filter((d) => d.isActive));
      } catch {
        // devices list is a convenience for the assign form only; a failure
        // here shouldn't block viewing existing mappings.
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/biometric/shifts?status=active&limit=100");
        setShifts(data.shifts);
      } catch {
        // shift list is a convenience for the assign dropdown only.
      }
    })();
  }, []);

  const runSearch = async () => {
    setSearching(true);
    setError("");
    try {
      const endpoint = isUser ? "/biometric/users" : "/biometric/employees";
      const { users, employees } = await api.get(`${endpoint}?search=${encodeURIComponent(personSearch)}`);
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
    setError(""); setInfo("");
    if (!assignForm.biometricId || !assignForm.deviceId) {
      return setError("Biometric ID and device are both required.");
    }
    setSaving(true);
    try {
      await api.post("/biometric/mappings", {
        biometricId: assignForm.biometricId,
        deviceId: assignForm.deviceId,
        ...(isUser ? { userId: selectedPerson.id } : { employeeId: selectedPerson.id }),
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
    setError(""); setInfo("");
    try {
      await api.patch(`/biometric/mappings/${m.id}/deactivate`);
      setInfo("Mapping deactivated.");
      fetchMappings();
    } catch (err) {
      setError(err.message || "Could not deactivate mapping.");
    }
  };

  const assignShift = async (m, shiftId) => {
    setError(""); setInfo("");
    try {
      await api.patch(`/biometric/mappings/${m.id}/shift`, { shiftId: shiftId || null });
      setInfo(shiftId ? "Shift assigned." : "Shift unassigned — back to the default schedule.");
      fetchMappings();
    } catch (err) {
      setError(err.message || "Could not assign shift.");
    }
  };

  return (
    <div className="space-y-4">
      <Banner error={error} info={info} />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Search {isUser ? "Users" : "Employees"} to Map
        </p>
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={personSearch}
              onChange={(e) => setPersonSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder={`Search by name, ${isUser ? "email/phone" : "designation/phone"}...`}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
            />
          </div>
          <button onClick={runSearch} disabled={searching} className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50">
            {searching ? "Searching..." : "Add"}
          </button>
        </div>

        {personResults.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
            {personResults.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-white">{p.fullName}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{isUser ? `${p.role} · ${p.email}` : p.designation}</p>
                </div>
                <button onClick={() => openAssign(p)} className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline">
                  <UserPlus className="w-3.5 h-3.5" /> Assign biometric ID
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAssign && selectedPerson && (
        <form onSubmit={submitAssign} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-800 dark:text-white">
            Assigning biometric ID for <span className="text-teal-600 dark:text-teal-400">{selectedPerson.fullName}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Biometric ID" value={assignForm.biometricId} onChange={(v) => setAssignForm(f => ({ ...f, biometricId: v }))} placeholder="Enrollment / card number" />
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Device</label>
              <select
                value={assignForm.deviceId}
                onChange={(e) => setAssignForm(f => ({ ...f, deviceId: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
              >
                <option value="">Select device</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.deviceCode})</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
              {saving ? "Assigning..." : "Assign"}
            </button>
            <button type="button" onClick={() => { setShowAssign(false); setSelectedPerson(null); }} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2.5">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <Loading label="Loading mappings..." />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  {["Name", "Biometric ID", "Device", "Shift", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800/50">
                    <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-white">
                      {isUser ? m.user?.fullName : m.employee?.fullName}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{m.biometricId}</td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{m.device?.name || "—"}</td>
                    <td className="px-5 py-3.5">
                      <select
                        value={m.shiftId || ""}
                        onChange={(e) => assignShift(m, e.target.value)}
                        disabled={!m.isActive}
                        className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                      >
                        <option value="">Unassigned (default)</option>
                        {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        m.isActive
                          ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                      }`}>
                        {m.isActive ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {m.isActive && (
                        <IconBtn title="Deactivate" onClick={() => deactivate(m)}><Power className="w-3.5 h-3.5" /></IconBtn>
                      )}
                    </td>
                  </tr>
                ))}
                {mappings.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No mappings yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Attendance Logs tab
// ============================================================================

function LogsTab() {
  const [logs, setLogs] = useState([]);
  const [devices, setDevices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [filters, setFilters] = useState({ date: "", deviceId: "", mapped: "" });

  useEffect(() => {
    (async () => {
      try {
        const { devices: data } = await api.get("/biometric/devices");
        setDevices(data);
      } catch {
        // non-critical for viewing logs
      }
    })();
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (filters.date) params.set("date", filters.date);
      if (filters.deviceId) params.set("deviceId", filters.deviceId);
      if (filters.mapped) params.set("mapped", filters.mapped);
      const data = await api.get(`/biometric/logs?${params.toString()}`);
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      setError(err.message || "Could not load punch logs.");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-4">
      <Banner error={error} />

      <div className="flex gap-2 flex-wrap bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <input
          type="date"
          value={filters.date}
          onChange={(e) => { setPage(1); setFilters(f => ({ ...f, date: e.target.value })); }}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
        />
        <select
          value={filters.deviceId}
          onChange={(e) => { setPage(1); setFilters(f => ({ ...f, deviceId: e.target.value })); }}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
        >
          <option value="">All devices</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          value={filters.mapped}
          onChange={(e) => { setPage(1); setFilters(f => ({ ...f, mapped: e.target.value })); }}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
        >
          <option value="">Mapped + Unmapped</option>
          <option value="true">Mapped only</option>
          <option value="false">Unmapped only</option>
        </select>
      </div>

      {loading ? (
        <Loading label="Loading punch logs..." />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  {["Time", "Enrollment ID", "Device", "Mode", "Mapped", ""].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <Fragment key={l.id}>
                    <tr className="border-t border-slate-100 dark:border-slate-800/50">
                      <td className="px-5 py-3.5 text-slate-800 dark:text-white">{new Date(l.punchTime).toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{l.enrollmentId}</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{l.device?.name || l.deviceSerial}</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{l.punchMode}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          l.isProcessed
                            ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                            : "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                        }`}>
                          {l.isProcessed ? "Mapped" : "Unmapped"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                          className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                        >
                          {expandedId === l.id ? "Hide raw" : "View raw"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === l.id && (
                      <tr className="border-t border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50">
                        <td colSpan={6} className="px-5 py-3">
                          <pre className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-all">
                            {JSON.stringify(l.rawData, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No punch logs for these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
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
      const result = await api.get(`/biometric/attendance/report?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err.message || "Could not load attendance report.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  return (
    <div className="space-y-4">
      <Banner error={error} />

      <div className="flex gap-2 flex-wrap items-end bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">From</label>
          <input type="date" value={range.from} onChange={(e) => setRange(r => ({ ...r, from: e.target.value }))}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">To</label>
          <input type="date" value={range.to} onChange={(e) => setRange(r => ({ ...r, to: e.target.value }))}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500" />
        </div>
      </div>

      {loading ? (
        <Loading label="Loading report..." />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card label="Present Days" value={data.summary.presentDays} />
            <Card label="Absent Days" value={data.summary.absentDays} />
            <Card label="Half Days" value={data.summary.halfDays} />
            <Card label="Total Overtime" value={minutesToHrs(data.summary.totalOvertimeMinutes)} />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50">
                    {["Date", "Person", "First Punch", "Last Punch", "Working Hrs", "Late", "Overtime", "Status"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800/50">
                      <td className="px-5 py-3.5 text-slate-800 dark:text-white">{new Date(r.date).toLocaleDateString()}</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{r.person?.fullName || "—"}</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{r.firstPunch ? new Date(r.firstPunch).toLocaleTimeString() : "—"}</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{r.lastPunch ? new Date(r.lastPunch).toLocaleTimeString() : "—"}</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{minutesToHrs(r.workingMinutes)}</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{r.lateMinutes} min</td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{minutesToHrs(r.overtimeMinutes)}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.records.length === 0 && (
                    <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No attendance records in this range.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}