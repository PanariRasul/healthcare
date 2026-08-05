// client/src/pages/admin/AdminWorkingDays.jsx
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { PageHeader } from "../../components/UI";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  Loader2,
  Landmark,
  Building2,
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
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_META = {
  PUBLIC: { label: "Public Holiday", icon: Landmark },
  COMPANY: { label: "Company Holiday", icon: Building2 },
};

function ymd(year, month, day) {
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

  const [dialogDate, setDialogDate] = useState(null);
  const [form, setForm] = useState({ name: "", type: "COMPANY" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchHolidays = async () => {
    setLoading(true);
    setError("");
    try {
      const { holidays: data, summary: sum } = await api.get(
        `/admin/holidays?year=${year}&month=${month}`,
      );
      setHolidays(data);
      setSummary(sum);
    } catch (err) {
      setError(err.message || "Could not load working days calendar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
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

  const holidayByDate = holidays.reduce((acc, h) => {
    acc[h.date.split("T")[0]] = h;
    return acc;
  }, {});

  const totalDays = summary?.totalDays ?? new Date(year, month, 0).getDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

  const openDialog = (dateStr) => {
    const existing = holidayByDate[dateStr];
    setDialogDate(dateStr);
    setForm(
      existing
        ? { name: existing.name, type: existing.type }
        : { name: "", type: "COMPANY" },
    );
  };

  const closeDialog = () => setDialogDate(null);

  const saveHoliday = async () => {
    if (!form.name.trim()) {
      setError("Please give the holiday a name.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.post("/admin/holidays", {
        date: dialogDate,
        name: form.name.trim(),
        type: form.type,
      });
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
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Working Days"
        subtitle="Configure public and company holidays for monthly attendance calculations"
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total Days" value={summary?.totalDays ?? "—"} />
        <SummaryCard label="Sundays" value={summary?.sundays ?? "—"} />
        <SummaryCard
          label="Holidays"
          value={summary?.holidays ?? "—"}
          valueClass="text-amber-600 dark:text-amber-400"
        />
        <SummaryCard
          label="Working Days"
          value={summary?.workingDays ?? "—"}
          valueClass="text-[#0f4a29] dark:text-[#52b788]"
        />
      </div>

      {/* Main Calendar Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
            {MONTH_NAMES[month - 1]} {year} Calendar
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
            <LegendDot
              className="bg-amber-100 border-amber-300"
              label="Holiday"
            />
            <LegendDot
              className="bg-[#0f4a29]/10 border-[#0f4a29]/30"
              label="Working Day"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
              <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" />{" "}
              Loading calendar...
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="text-center text-[11px] font-extrabold text-slate-400 uppercase tracking-wider py-1"
                >
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
                    className={`relative text-left rounded-2xl border p-3 min-h-[68px] transition-all ${
                      holiday
                        ? "bg-amber-50/80 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40"
                        : "bg-slate-50/60 border-slate-100 dark:bg-slate-800/40 dark:border-slate-800 hover:border-[#0f4a29]/40"
                    }`}
                  >
                    <span className="text-xs font-extrabold text-slate-800 dark:text-white">
                      {day}
                    </span>
                    {holiday && (
                      <div className="mt-1 text-[10px] font-extrabold text-amber-700 dark:text-amber-400 leading-tight line-clamp-2">
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

      {/* Edit Holiday Modal */}
      {dialogDate && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={closeDialog}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 w-full max-w-sm shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-extrabold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                {holidayByDate[dialogDate] ? "Edit Holiday" : "Mark Holiday"} —{" "}
                {dialogDate}
              </h4>
              <button
                onClick={closeDialog}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  Holiday Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. Independence Day"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(TYPE_META).map(([value, meta]) => {
                    const Icon = meta.icon;
                    const active = form.type === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setForm((f) => ({ ...f, type: value }))}
                        className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-extrabold transition-all ${
                          active
                            ? "bg-[#0f4a29] text-white border-[#0f4a29]"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
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
                  className="flex items-center gap-1.5 text-rose-500 text-xs font-extrabold px-3 py-2 rounded-full hover:bg-rose-50 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Remove
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  onClick={closeDialog}
                  className="text-xs font-bold text-slate-500 px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={saveHoliday}
                  disabled={saving}
                  className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2 rounded-full shadow-xs disabled:opacity-50"
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

function SummaryCard({ label, value, valueClass }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-4 shadow-xs">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
        {label}
      </div>
      <div
        className={`text-2xl font-extrabold ${valueClass || "text-slate-900 dark:text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}

function LegendDot({ className, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-md border ${className}`} />
      {label}
    </div>
  );
}
