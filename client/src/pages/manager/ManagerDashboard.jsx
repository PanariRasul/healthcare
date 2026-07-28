// client/src/pages/manager/ManagerDashboard.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import {
  Building2, UserPlus, ArrowRight, Briefcase, Users, Sun, Moon,
  CalendarClock, UserX, Loader2, TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

// The Manager role currently has two working areas — the Employee Directory
// and Shift Assignment — both of which are the same pages Admin uses, just
// reached from /manager/* routes. This dashboard is the landing screen and
// quick-access hub into those two; add more cards here as Manager gets more
// pages of its own.
//
// Shift summary/analytics on this page come from GET /admin/employee-shifts
// (employee-shift.controller.js listEmployeeShifts) — same endpoint and
// same `summary` shape the Admin Employee Shift Assignment page uses:
// { totalEmployees, dayShiftEmployees, nightShiftEmployees, unassignedEmployees }.
// `limit=1` is passed since only the summary block is needed here, not the
// paginated employee rows.
const QUICK_LINKS = [
  {
    to: "/manager/shift-assign",
    label: "Shift Assignment",
    description: "Assign and review upcoming shifts for staff and employees.",
    icon: UserPlus,
    accent: {
      wrap: "bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/20",
      iconWrap: "bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400",
      hover: "hover:border-teal-300 dark:hover:border-teal-500/40",
    },
  },
];

const COLORS = {
  amber: "#f59e0b",
  indigo: "#6366f1",
  slate: "#94a3b8",
  rose: "#f43f5e",
  teal: "#14b8a6",
};

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.3)",
  fontSize: 12,
};

export default function ManagerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api.get("/admin/employee-shifts?limit=1");
        if (cancelled) return;
        setSummary(data?.summary || null);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load shift data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const totalEmployees = summary?.totalEmployees ?? 0;
  const dayShiftEmployees = summary?.dayShiftEmployees ?? 0;
  const nightShiftEmployees = summary?.nightShiftEmployees ?? 0;
  const unassignedEmployees = summary?.unassignedEmployees ?? 0;
  // General/other shift employees aren't broken out in the summary block,
  // so it's derived as whatever's left once Day, Night, and Unassigned are
  // accounted for.
  const generalShiftEmployees = Math.max(
    0,
    totalEmployees - dayShiftEmployees - nightShiftEmployees - unassignedEmployees
  );

  const shiftDistribution = useMemo(() => ([
    { label: "Day Shift", value: dayShiftEmployees, color: COLORS.amber },
    { label: "Night Shift", value: nightShiftEmployees, color: COLORS.indigo },
    { label: "General Shift", value: generalShiftEmployees, color: COLORS.slate },
    { label: "Unassigned", value: unassignedEmployees, color: COLORS.rose },
  ]), [dayShiftEmployees, nightShiftEmployees, generalShiftEmployees, unassignedEmployees]);

  return (
    // Outer wrapper carries the watermark background so it sits behind every
    // card, same convention as the Admin dashboard — content sits in a
    // relatively-positioned layer above it (z-10).
    <div className="relative">
      {/* Background watermark image */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-0 bg-no-repeat opacity-[0.6] dark:opacity-[0.4]"
        style={{
          backgroundImage: "url('/healthcare-icon.png')",
          backgroundSize: "800px 800px",
          backgroundPosition: "center -110px",
        }}
      />

      <div className="relative z-10 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Briefcase className="w-5 h-5" strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight capitalize">
              Welcome{user?.username ? `, ${user.username}` : ""}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Manager overview &mdash; jump into your working areas below.
            </p>
          </div>
        </div>

        

        {/* ================= Shift status ================= */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h2 className="text-base font-bold text-slate-800 dark:text-white">Shift Overview</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm font-medium">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading shift data...
              </div>
            </div>
          ) : error ? (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-400 text-sm font-medium">
              {error}
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={Users}
                  label="Total Employees"
                  value={totalEmployees}
                  accent="teal"
                />
                <StatCard
                  icon={Sun}
                  label="Day Shift"
                  value={dayShiftEmployees}
                  accent="amber"
                />
                <StatCard
                  icon={Moon}
                  label="Night Shift"
                  value={nightShiftEmployees}
                  accent="indigo"
                />
                <StatCard
                  icon={UserX}
                  label="Unassigned"
                  value={unassignedEmployees}
                  accent="rose"
                />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-20">
                <ChartCard title="Employees by Shift Type">
                  {totalEmployees === 0 ? (
                    <EmptyChartState message="No employee shift data yet." />
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={shiftDistribution}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {shiftDistribution.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <ChartCard title="Shift Distribution">
                  {totalEmployees === 0 ? (
                    <EmptyChartState message="No employee shift data yet." />
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={shiftDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-slate-400" interval={0} angle={-20} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-400" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="value" name="Employees" radius={[6, 6, 0, 0]}>
                          {shiftDistribution.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational subcomponents
// ---------------------------------------------------------------------------

const STAT_ACCENTS = {
  teal: "text-teal-500 bg-teal-50 dark:bg-teal-500/10",
  amber: "text-amber-500 bg-amber-50 dark:bg-amber-500/10",
  indigo: "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10",
  rose: "text-rose-500 bg-rose-50 dark:bg-rose-500/10",
};

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${STAT_ACCENTS[accent] || STAT_ACCENTS.teal}`}>
          <Icon className="w-4 h-4" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-white">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">{title}</h4>
      {children}
    </div>
  );
}

function EmptyChartState({ message }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 text-center px-6">
      {message}
    </div>
  );
}