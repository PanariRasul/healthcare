// client/src/pages/doctor/DoctorOPDRevenue.jsx
import { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/UI";
import {
  IndianRupee,
  Wallet,
  Loader2,
  TrendingUp,
  Calendar,
  BarChart3,
  ChevronDown,
  Check,
  Users2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = {
  revenue: "#0f4a29",
  cash: "#0f4a29",
  upi: "#52b788",
};

function toDateStr(d) {
  return d.toISOString().split("T")[0];
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function firstOfMonth(monthsBack = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  d.setDate(1);
  return d;
}
function lastOfMonth(monthsBack = 1) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack + 1);
  d.setDate(0);
  return d;
}
function firstOfYear() {
  const d = new Date();
  d.setMonth(0, 1);
  return d;
}
function fmtLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
function fmtRangeDisplay(fromStr, toStr) {
  const opts = { day: "numeric", month: "short", year: "numeric" };
  const from = new Date(fromStr).toLocaleDateString("en-IN", opts);
  const to = new Date(toStr).toLocaleDateString("en-IN", opts);
  return fromStr === toStr ? from : `${from} – ${to}`;
}

const PRESETS = [
  {
    key: "today",
    label: "Today",
    from: () => new Date(),
    to: () => new Date(),
  },
  {
    key: "yesterday",
    label: "Yesterday",
    from: () => daysAgo(1),
    to: () => daysAgo(1),
  },
  {
    key: "7d",
    label: "Last 7 Days",
    from: () => daysAgo(6),
    to: () => new Date(),
  },
  {
    key: "30d",
    label: "Last 30 Days",
    from: () => daysAgo(29),
    to: () => new Date(),
  },
  {
    key: "month",
    label: "This Month",
    from: () => firstOfMonth(0),
    to: () => new Date(),
  },
  {
    key: "lastmonth",
    label: "Last Month",
    from: () => firstOfMonth(1),
    to: () => lastOfMonth(1),
  },
  {
    key: "year",
    label: "This Year",
    from: () => firstOfYear(),
    to: () => new Date(),
  },
];

function dateRangeArray(fromStr, toStr) {
  const out = [];
  let cur = new Date(fromStr);
  const end = new Date(toStr);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || cur > end)
    return out;
  while (cur <= end) {
    out.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function DateRangePicker({
  preset,
  rangeFrom,
  rangeTo,
  onPreset,
  onCustomApply,
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(rangeFrom);
  const [draftTo, setDraftTo] = useState(rangeTo);

  useEffect(() => {
    setDraftFrom(rangeFrom);
    setDraftTo(rangeTo);
  }, [rangeFrom, rangeTo, open]);

  const activePresetLabel = PRESETS.find((p) => p.key === preset)?.label;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-xs font-extrabold text-slate-800 dark:text-white transition-colors shadow-2xs"
      >
        <Calendar className="w-3.5 h-3.5 text-[#0f4a29] dark:text-[#52b788]" />
        <span>{activePresetLabel || fmtRangeDisplay(rangeFrom, rangeTo)}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-xs"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-[min(92vw,420px)] max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] shadow-2xl z-40 overflow-hidden flex flex-col sm:flex-row p-2">
            <div className="sm:w-40 border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-slate-800 p-2 space-y-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => {
                    onPreset(p);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-bold text-left transition-all ${
                    preset === p.key
                      ? "bg-[#0f4a29] text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {p.label}
                  {preset === p.key && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>

            <div className="flex-1 p-4 space-y-3">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Custom Range
              </p>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={draftFrom}
                  max={draftTo}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom}
                  max={toDateStr(new Date())}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
                />
              </div>
              <button
                onClick={() => {
                  onCustomApply(draftFrom, draftTo);
                  setOpen(false);
                }}
                className="w-full py-2.5 bg-[#0f4a29] text-white text-xs font-extrabold rounded-full shadow-xs"
              >
                Apply Range
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function DoctorOPDRevenue() {
  const [stats, setStats] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [preset, setPreset] = useState("7d");
  const [rangeFrom, setRangeFrom] = useState(toDateStr(daysAgo(6)));
  const [rangeTo, setRangeTo] = useState(toDateStr(new Date()));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [statsData, patientsData] = await Promise.all([
          api.get("/opd/patients/stats"),
          api.get("/opd/patients"),
        ]);
        if (cancelled) return;
        setStats(statsData);
        setPatients(patientsData.patients || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load revenue data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePreset = (p) => {
    setPreset(p.key);
    setRangeFrom(toDateStr(p.from()));
    setRangeTo(toDateStr(p.to()));
  };

  const handleCustomApply = (from, to) => {
    setPreset("custom");
    setRangeFrom(from);
    setRangeTo(to);
  };

  const { chartData, rangeTotals } = useMemo(() => {
    const days = dateRangeArray(rangeFrom, rangeTo);
    const byDate = new Map(
      days.map((d) => [
        d,
        {
          date: d,
          label: fmtLabel(d),
          revenue: 0,
          cash: 0,
          upi: 0,
          patients: 0,
        },
      ]),
    );

    for (const p of patients) {
      const bucket = byDate.get(p.visitDate);
      if (!bucket) continue;
      bucket.revenue += p.total || 0;
      bucket.cash += p.cash || 0;
      bucket.upi += p.upi || 0;
      bucket.patients += 1;
    }

    const data = Array.from(byDate.values());
    const totals = data.reduce(
      (acc, d) => ({
        revenue: acc.revenue + d.revenue,
        cash: acc.cash + d.cash,
        upi: acc.upi + d.upi,
        patients: acc.patients + d.patients,
      }),
      { revenue: 0, cash: 0, upi: 0, patients: 0 },
    );

    return { chartData: data, rangeTotals: totals };
  }, [patients, rangeFrom, rangeTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
          revenue metrics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
        {error}
      </div>
    );
  }

  const {
    todayRevenue,
    todayCash,
    todayUpi,
    totalRevenue,
    totalPatients,
    seenToday,
  } = stats;
  const avgPerPatientToday = seenToday > 0 ? todayRevenue / seenToday : 0;
  const avgPerPatientOverall =
    totalPatients > 0 ? totalRevenue / totalPatients : 0;

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="OPD Revenue Analytics"
        subtitle="Read-only revenue statistics and payment method collections"
        action={
          <DateRangePicker
            preset={preset}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            onPreset={handlePreset}
            onCustomApply={handleCustomApply}
          />
        }
      />

      {/* Today Revenue */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
          Today's Performance
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Today's Revenue"
            value={`₹${todayRevenue.toLocaleString()}`}
            icon={IndianRupee}
            color="green"
          />
          <StatCard
            label="Cash Collected"
            value={`₹${todayCash.toLocaleString()}`}
            icon={Wallet}
            color="yellow"
          />
          <StatCard
            label="UPI Collected"
            value={`₹${todayUpi.toLocaleString()}`}
            icon={Wallet}
            color="green"
          />
        </div>
      </div>

      {/* All Time */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
          All-Time Metrics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total OPD Revenue"
            value={`₹${totalRevenue.toLocaleString()}`}
            icon={IndianRupee}
            color="green"
          />
          <StatCard
            label="Avg / Patient Today"
            value={`₹${avgPerPatientToday.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={TrendingUp}
            color="green"
          />
          <StatCard
            label="Avg / Patient (All Time)"
            value={`₹${avgPerPatientOverall.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={TrendingUp}
            color="green"
          />
        </div>
      </div>

      {/* Range Chart Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-6 shadow-xs space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
              Range Revenue
            </span>
            <span className="text-xl font-extrabold text-[#0f4a29] dark:text-[#52b788]">
              ₹{rangeTotals.revenue.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
              Range Cash
            </span>
            <span className="text-xl font-extrabold text-slate-800 dark:text-white">
              ₹{rangeTotals.cash.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
              Range UPI
            </span>
            <span className="text-xl font-extrabold text-slate-800 dark:text-white">
              ₹{rangeTotals.upi.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
              Patients
            </span>
            <span className="text-xl font-extrabold text-slate-800 dark:text-white">
              {rangeTotals.patients}
            </span>
          </div>
        </div>

        {chartData.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center font-medium">
            Select a valid date range to render charts.
          </p>
        ) : (
          <div className="space-y-8">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                Revenue Trend
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="revenueFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={COLORS.revenue}
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor={COLORS.revenue}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    className="text-slate-200/60 dark:text-slate-800"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fontWeight: 700 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontWeight: 700 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `₹${value.toLocaleString()}`,
                      "Revenue",
                    ]}
                    contentStyle={{
                      backgroundColor: "#0f4a29",
                      border: "none",
                      borderRadius: 12,
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={COLORS.revenue}
                    strokeWidth={2.5}
                    fill="url(#revenueFill)"
                    dot={{ r: 3, strokeWidth: 0, fill: COLORS.revenue }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                Cash vs UPI Collections
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    className="text-slate-200/60 dark:text-slate-800"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fontWeight: 700 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontWeight: 700 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      `₹${value.toLocaleString()}`,
                      name === "cash" ? "Cash" : "UPI",
                    ]}
                    contentStyle={{
                      backgroundColor: "#0f4a29",
                      border: "none",
                      borderRadius: 12,
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 11,
                      fontWeight: 700,
                      paddingTop: 10,
                    }}
                    iconType="circle"
                  />
                  <Bar
                    dataKey="cash"
                    stackId="a"
                    fill={COLORS.cash}
                    radius={[0, 0, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="upi"
                    stackId="a"
                    fill={COLORS.upi}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 font-medium">
        Figures reflect Cash + UPI collected at reception — read-only view.
      </p>
    </div>
  );
}
