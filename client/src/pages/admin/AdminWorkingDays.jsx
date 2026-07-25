// client/src/pages/admin/AdminWorkingDays.jsx
// Working Days calendar for salary calculations. Shows one month at a time;
// every Sunday is a fixed weekly off, and admins mark any other date (or
// override a Sunday) as a public/company holiday by clicking it. The four
// header stats and the per-day coloring are both derived from the same
// /admin/holidays response, so they can never disagree with each other.
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  Loader2,
  Landmark,
  Building2,
} from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_META = {
  PUBLIC: { label: "Public Holiday", icon: Landmark },
  COMPANY: { label: "Company Holiday", icon: Building2 },
};

function ymd(year, month, day) {
  // Local calendar date as YYYY-MM-DD, independent of the browser's timezone.
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function AdminWorkingDays() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [holidays, setHolidays] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dialogDate, setDialogDate] = useState(null); // "YYYY-MM-DD" | null
  const [form, setForm] = useState({ name: "", type: "COMPANY" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchHolidays = async () => {
    setLoading(true);
    setError("");
    try {
      const { holidays: data, summary: sum } = await api.get(`/admin/holidays?year=${year}&month=${month}`);
      setHolidays(data);
      setSummary(sum);
    } catch (err) {
      setError(err.message || "Could not load the working days calendar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHolidays(); }, [year, month]);

  const shiftMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m);
    setYear(y);
  };

  const holidayByDate = holidays.reduce((acc, h) => {
    acc[h.date.split("T")[0]] = h;
    return acc;
  }, {});

  const totalDays = summary?.totalDays ?? new Date(year, month, 0).getDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

  const openDialog = (dateStr) => {
    const existing = holidayByDate[dateStr];
    setDialogDate(dateStr);
    setForm(existing ? { name: existing.name, type: existing.type } : { name: "", type: "COMPANY" });
  };

  const closeDialog = () => setDialogDate(null);

  const saveHoliday = async () => {
    if (!form.name.trim()) {
      setError("Give the holiday a name before saving.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.post("/admin/holidays", { date: dialogDate, name: form.name.trim(), type: form.type });
      closeDialog();
      fetchHolidays();
    } catch (err) {
      setError(err.message || "Could not save holiday.");
    } finally {
      setSaving(false);
    }
  };

  const removeHoliday = async () => {
    const existing = holidayByDate[dialogDate];
    if (!existing) return;
    setDeleting(true);
    setError("");
    try {
      await api.del(`/admin/holidays/${existing.id}`);
      closeDialog();
      fetchHolidays();
    } catch (err) {
      setError(err.message || "Could not remove holiday.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-teal-500" />
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white">Working Days Configuration</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Mark public and company holidays used in salary calculations — Sundays are regular working days unless marked as a holiday</p>
          </div>
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Days" value={summary?.totalDays ?? "—"} valueClass="text-slate-800 dark:text-white" />
        <StatCard label="Sundays" value={summary?.sundays ?? "—"} valueClass="text-slate-500 dark:text-slate-400" />
        <StatCard label="Holidays" value={summary?.holidays ?? "—"} valueClass="text-amber-500" />
        <StatCard label="Working Days" value={summary?.workingDays ?? "—"} valueClass="text-emerald-500" />
      </div>

      {/* Calendar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="text-sm font-semibold text-slate-800 dark:text-white">
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <LegendDot className="bg-amber-100 border-amber-300 dark:bg-amber-500/15 dark:border-amber-500/30" label="Holiday" />
            <LegendDot className="bg-emerald-50 border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30" label="Working Day" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm font-medium">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading calendar...
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAY_LABELS.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: totalDays }).map((_, i) => {
                const day = i + 1;
                const dateStr = ymd(year, month, day);
                const holiday = holidayByDate[dateStr];

                return (
                  <button
                    key={dateStr}
                    onClick={() => openDialog(dateStr)}
                    className={`relative text-left rounded-xl border p-3 min-h-[64px] transition-colors ${
                      holiday
                        ? "bg-amber-50 border-amber-300 hover:bg-amber-100 dark:bg-amber-500/10 dark:border-amber-500/30 dark:hover:bg-amber-500/20"
                        : "bg-emerald-50/60 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/5 dark:border-emerald-500/20 dark:hover:bg-emerald-500/15"
                    }`}
                  >
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{day}</span>
                    {holiday && (
                      <div className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 leading-tight line-clamp-2">
                        {holiday.name}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add/edit holiday dialog */}
      {dialogDate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeDialog}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-800 dark:text-white">
                {holidayByDate[dialogDate] ? "Edit Holiday" : "Mark Holiday"} — {dialogDate}
              </h4>
              <button onClick={closeDialog} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Holiday Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Independence Day"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(TYPE_META).map(([value, meta]) => {
                    const Icon = meta.icon;
                    const active = form.type === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setForm((f) => ({ ...f, type: value }))}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                          active
                            ? "bg-teal-500 border-teal-500 text-white"
                            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" /> {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              {holidayByDate[dialogDate] ? (
                <button
                  onClick={removeHoliday}
                  disabled={deleting}
                  className="flex items-center gap-1.5 text-rose-500 text-sm font-semibold px-3 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={closeDialog} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2">Cancel</button>
                <button
                  onClick={saveHoliday}
                  disabled={saving}
                  className="bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, valueClass }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function LegendDot({ className, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded border ${className}`} />
      {label}
    </div>
  );
}