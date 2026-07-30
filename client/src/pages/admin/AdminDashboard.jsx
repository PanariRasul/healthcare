// client/src/pages/admin/AdminDashboard.jsx
import { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";
import { PageHeader } from "../../components/UI";
import {
  Users,
  Activity,
  CalendarClock,
  AlertTriangle,
  BedDouble,
  Pill,
  PackageX,
  Clock,
  Loader2,
  Stethoscope,
  UserCog,
  ArrowUpRight,
  ShieldAlert,
  ClipboardList,
  CalendarDays,
  UserPlus,
  PackageCheck,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const ENDPOINTS = {
  opdStats: "/opd/patients/stats",
  opdList: "/opd/patients",
  ipdStats: "/ipd/stats",
  ipdList: "/ipd/patients",
  pharmacyStats: "/pharmacy/medicines/stats",
  pharmacyList: "/pharmacy/medicines",
  employees: "/admin/employees",
};

const BRAND_COLORS = {
  primaryDark: "#0f4a29",
  primaryLight: "#52b788",
  slate: "#64748b",
  lightSlate: "#cbd5e1",
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function toDateOnly(d) {
  const date = new Date(d);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function sameDay(a, b) {
  const x = toDateOnly(a),
    y = toDateOnly(b);
  return x.getTime() === y.getTime();
}
function isToday(d) {
  if (!d) return false;
  return sameDay(d, new Date());
}
function lastNDays(n) {
  const days = [];
  const today = toDateOnly(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}
function lastNMonths(n) {
  const months = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    months.push(new Date(today.getFullYear(), today.getMonth() - i, 1));
  }
  return months;
}
const DAY_LABEL = (d) => d.toLocaleDateString("en-IN", { weekday: "short" });
const DAY_LABEL_NARROW = (d) =>
  d.toLocaleDateString("en-IN", { weekday: "narrow" });
const MONTH_LABEL = (d) => d.toLocaleDateString("en-IN", { month: "short" });

function groupByDay(list, dateField, n = 7) {
  const days = lastNDays(n);
  return days.map((d) => ({
    label: DAY_LABEL(d),
    count: list.filter(
      (item) => item?.[dateField] && sameDay(item[dateField], d),
    ).length,
  }));
}
function groupByMonth(list, dateField, n = 6) {
  const months = lastNMonths(n);
  return months.map((m) => ({
    label: MONTH_LABEL(m),
    count: list.filter((item) => {
      if (!item?.[dateField]) return false;
      const d = new Date(item[dateField]);
      return (
        d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()
      );
    }).length,
  }));
}
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminDashboard() {
  const [opd, setOpd] = useState(null);
  const [ipd, setIpd] = useState(null);
  const [pharmacy, setPharmacy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [opdPatients, setOpdPatients] = useState([]);
  const [ipdPatients, setIpdPatients] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [opdData, ipdData, pharmacyData] = await Promise.all([
          api.get(ENDPOINTS.opdStats),
          api.get(ENDPOINTS.ipdStats),
          api.get(ENDPOINTS.pharmacyStats),
        ]);
        if (cancelled) return;
        setOpd(opdData);
        setIpd(ipdData);
        setPharmacy(pharmacyData);
      } catch (err) {
        if (!cancelled)
          setError(err.message || "Could not load core dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }

      const [opdListRes, ipdListRes, medsRes, empRes] =
        await Promise.allSettled([
          api.get(ENDPOINTS.opdList),
          api.get(ENDPOINTS.ipdList),
          api.get(ENDPOINTS.pharmacyList),
          api.get(ENDPOINTS.employees),
        ]);
      if (cancelled) return;

      if (opdListRes.status === "fulfilled") {
        setOpdPatients(
          safeArray(
            opdListRes.value?.patients ||
              opdListRes.value?.opdPatients ||
              opdListRes.value,
          ),
        );
      }
      if (ipdListRes.status === "fulfilled") {
        setIpdPatients(
          safeArray(
            ipdListRes.value?.patients ||
              ipdListRes.value?.ipdPatients ||
              ipdListRes.value,
          ),
        );
      }
      if (medsRes.status === "fulfilled") {
        setMedicines(safeArray(medsRes.value?.medicines || medsRes.value));
      }
      if (empRes.status === "fulfilled") {
        setEmployees(safeArray(empRes.value?.employees || empRes.value));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Derived: Employees summary ----
  const employeeSummary = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.isActive).length;
    const departments = new Set(
      employees.map((e) => (e.designation || "").trim()).filter(Boolean),
    );
    return { total, active, departments: departments.size };
  }, [employees]);

  const employeesByDept = useMemo(() => {
    const counts = {};
    employees.forEach((e) => {
      const dept = (e.designation || "Unspecified").trim() || "Unspecified";
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [employees]);

  const employeeActiveInactive = useMemo(
    () => [
      {
        label: "Active",
        value: employees.filter((e) => e.isActive).length,
        color: BRAND_COLORS.primaryDark,
      },
      {
        label: "Inactive",
        value: employees.filter((e) => !e.isActive).length,
        color: BRAND_COLORS.lightSlate,
      },
    ],
    [employees],
  );

  // ---- Derived: OPD analytics ----
  const opdDaily = useMemo(
    () => groupByDay(opdPatients, "visitDate", 7),
    [opdPatients],
  );
  const opdMonthly = useMemo(
    () => groupByMonth(opdPatients, "visitDate", 6),
    [opdPatients],
  );
  const recentOpdRegistrations = useMemo(
    () =>
      [...opdPatients]
        .sort(
          (a, b) =>
            new Date(b.visitDate || b.createdAt) -
            new Date(a.visitDate || a.createdAt),
        )
        .slice(0, 5),
    [opdPatients],
  );
  const todaysAppointments = useMemo(
    () => opdPatients.filter((p) => isToday(p.visitDate)),
    [opdPatients],
  );
  const upcomingFollowUps = useMemo(() => {
    const today = toDateOnly(new Date());
    const fromOpd = opdPatients
      .filter(
        (p) =>
          p.followUpDate &&
          p.followUpStatus === "PENDING" &&
          toDateOnly(p.followUpDate) >= today,
      )
      .map((p) => ({ name: p.name, date: p.followUpDate, source: "OPD" }));
    const fromIpd = ipdPatients
      .filter(
        (p) =>
          p.followUpDate &&
          p.followUpStatus === "PENDING" &&
          toDateOnly(p.followUpDate) >= today,
      )
      .map((p) => ({ name: p.name, date: p.followUpDate, source: "IPD" }));
    return [...fromOpd, ...fromIpd]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5);
  }, [opdPatients, ipdPatients]);

  // ---- Derived: IPD analytics ----
  const ipdAdmissionsDischarges = useMemo(() => {
    const months = lastNMonths(6);
    return months.map((m) => ({
      label: MONTH_LABEL(m),
      admissions: ipdPatients.filter((p) => {
        if (!p.admissionDate) return false;
        const d = new Date(p.admissionDate);
        return (
          d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()
        );
      }).length,
      discharges: ipdPatients.filter((p) => {
        if (!p.dischargeDate) return false;
        const d = new Date(p.dischargeDate);
        return (
          d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()
        );
      }).length,
    }));
  }, [ipdPatients]);

  const ipdOccupancy = useMemo(
    () => [
      {
        label: "Currently Admitted",
        value: ipd?.activeCount || 0,
        color: BRAND_COLORS.primaryDark,
      },
      {
        label: "Discharged",
        value: ipd?.dischargedCount || 0,
        color: BRAND_COLORS.lightSlate,
      },
    ],
    [ipd],
  );

  const recentAdmissions = useMemo(
    () =>
      [...ipdPatients]
        .filter((p) => p.admissionDate)
        .sort((a, b) => new Date(b.admissionDate) - new Date(a.admissionDate))
        .slice(0, 5),
    [ipdPatients],
  );
  const recentDischarges = useMemo(
    () =>
      [...ipdPatients]
        .filter((p) => p.dischargeDate)
        .sort((a, b) => new Date(b.dischargeDate) - new Date(a.dischargeDate))
        .slice(0, 5),
    [ipdPatients],
  );

  // ---- Derived: Pharmacy analytics ----
  const stockStatus = useMemo(() => {
    let available = 0,
      low = 0,
      out = 0;
    medicines.forEach((m) => {
      const qty = Number(m.quantity) || 0;
      const reorder = Number(m.reorderLevel) || 0;
      if (qty <= 0) out += 1;
      else if (qty <= reorder) low += 1;
      else available += 1;
    });
    return [
      { label: "Available", value: available, color: BRAND_COLORS.primaryDark },
      { label: "Low Stock", value: low, color: BRAND_COLORS.primaryLight },
      { label: "Out of Stock", value: out, color: BRAND_COLORS.lightSlate },
    ];
  }, [medicines]);

  const topConsumedMedicines = useMemo(() => {
    return [...medicines]
      .map((m) => ({
        label: m.drugName || m.name || "Unknown",
        consumed: Math.max(
          0,
          (Number(m.initialQuantity) || 0) - (Number(m.quantity) || 0),
        ),
      }))
      .filter((m) => m.consumed > 0)
      .sort((a, b) => b.consumed - a.consumed)
      .slice(0, 6);
  }, [medicines]);

  const lowStockList = useMemo(() => {
    return medicines
      .filter((m) => (Number(m.quantity) || 0) <= (Number(m.reorderLevel) || 0))
      .sort((a, b) => (Number(a.quantity) || 0) - (Number(b.quantity) || 0))
      .slice(0, 6);
  }, [medicines]);

  // Original Hatch Pillars Calculation with Date Labels for Tooltip
  const opdDailyPillars = useMemo(() => {
    const days = lastNDays(7);
    const counts = days.map((d) => ({
      fullDate: d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      }),
      label: DAY_LABEL_NARROW(d),
      count: opdPatients.filter(
        (item) => item?.visitDate && sameDay(item.visitDate, d),
      ).length,
    }));
    const max = Math.max(...counts.map((c) => c.count), 1);
    return counts.map((c) => ({
      ...c,
      heightPercent: Math.min(
        100,
        Math.max(15, Math.round((c.count / max) * 100)),
      ),
    }));
  }, [opdPatients]);

  const occupancyPercent = useMemo(() => {
    const active = ipd?.activeCount || 0;
    const total = ipd?.totalAdmittedEver || 1;
    return Math.min(100, Math.round((active / (total || 1)) * 100));
  }, [ipd]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#0f4a29]" />
        <p className="text-slate-500 text-xs font-bold">
          Synchronizing Dashboard Metrics...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-red-700 text-xs font-bold">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      {/* Shared Page Header Component */}
      <PageHeader
        title="Admin Dashboard"
        subtitle="Plan, prioritize, and accomplish your tasks with ease."
        action={
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-full text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#0f4a29] dark:bg-[#52b788] animate-pulse" />
            Live Metrics
          </div>
        }
      />

      {/* Top 4 Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Primary Dark Green Hero */}
        <div className="bg-gradient-to-br from-[#0f4a29] to-[#175c35] text-white p-6 rounded-[28px] flex flex-col justify-between h-[160px] shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">
              OPD Patients
            </span>
            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-white" />
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight">
              {opd?.totalPatients ?? 0}
            </h2>
            <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-md bg-white/10 backdrop-blur-xs text-[10px] font-bold text-emerald-200">
              <span className="w-3 h-3 rounded-full bg-emerald-400 text-[#0f4a29] flex items-center justify-center font-bold text-[8px]">
                +
              </span>
              {opd?.seenToday ?? 0} Seen Today
            </div>
          </div>
        </div>

        {/* Card 2: IPD Admissions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-[28px] flex flex-col justify-between h-[160px] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
              IPD Admissions
            </span>
            <div className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {ipd?.totalAdmittedEver ?? 0}
            </h2>
            <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500">
              {ipd?.activeCount ?? 0} Currently Admitted
            </div>
          </div>
        </div>

        {/* Card 3: Pharmacy Stock */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-[28px] flex flex-col justify-between h-[160px] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
              Pharmacy Medicines
            </span>
            <div className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {pharmacy?.totalMedicines ?? 0}
            </h2>
            <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500">
              {pharmacy?.lowStockCount ?? stockStatus[1].value} Low Stock Items
            </div>
          </div>
        </div>

        {/* Card 4: Workforce */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-[28px] flex flex-col justify-between h-[160px] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
              Workforce Staff
            </span>
            <div className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {employeeSummary.total}
            </h2>
            <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500">
              {employeeSummary.active} Active Employees
            </div>
          </div>
        </div>
      </section>

      {/* Feature Spotlight Row */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ORIGINAL Donezo Striped Pillars Bar Design with Interactive Tooltip */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-[28px] shadow-xs flex flex-col justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-2">
            OPD Daily Volume
          </h3>

          <div className="flex items-end justify-between h-44 pt-4 px-2">
            {opdDailyPillars.map((item, idx) => {
              const isFilled = idx === 1 || idx === 3;
              return (
                <div
                  key={idx}
                  className="flex flex-col items-center gap-3 flex-1 group relative cursor-pointer"
                >
                  {/* Hover Tooltip Popup Instruction */}
                  <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none absolute -top-12 bg-[#0f4a29] text-white text-[10px] font-bold px-2.5 py-1 rounded-xl shadow-lg whitespace-nowrap z-30">
                    <p className="opacity-80 text-[9px] uppercase">
                      {item.fullDate}
                    </p>
                    <p className="text-xs">{item.count} Patients</p>
                    <div className="w-2 h-2 bg-[#0f4a29] rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
                  </div>

                  <div className="w-full flex justify-center h-32 items-end">
                    <div
                      style={{ height: `${item.heightPercent}%` }}
                      className={`w-7 rounded-full transition-all duration-300 group-hover:scale-105 ${
                        isFilled
                          ? "bg-[#0f4a29]"
                          : "bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:6px_6px]"
                      }`}
                    />
                  </div>
                  <span className="text-xs font-extrabold text-slate-400 group-hover:text-slate-800 dark:group-hover:text-white">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reminders Card */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-[28px] shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-extrabold text-slate-400">
              Reminders
            </span>
            <h4 className="text-base font-extrabold text-slate-900 dark:text-white mt-3 leading-snug">
              {upcomingFollowUps[0]
                ? `Follow-up: ${upcomingFollowUps[0].name}`
                : "No Scheduled Follow-ups"}
            </h4>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {upcomingFollowUps[0]
                ? `Date: ${fmtDate(upcomingFollowUps[0].date)}`
                : "All follow-up tasks completed."}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold text-[#0f4a29] dark:text-[#52b788] flex items-center justify-between">
            <span>Next Action Required</span>
            <CalendarClock className="w-4 h-4" />
          </div>
        </div>

        {/* Quick Recent Patient List */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-[28px] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Recent OPD Patients
            </h3>
          </div>

          <div className="space-y-3">
            {recentOpdRegistrations.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center font-medium">
                No recent registrations
              </p>
            ) : (
              recentOpdRegistrations.slice(0, 4).map((p) => (
                <div
                  key={p._id || p.id}
                  className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-[#0f4a29]" />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {p.name || "Patient"}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        OPD • {fmtDate(p.visitDate || p.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* All Section Analytics Charts */}
      <section className="space-y-8 pt-4">
        <div className="flex items-center gap-2">
          <TrendingUp
            className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]"
            strokeWidth={2.5}
          />
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-[#9ca3af]">
            Department Analytics
          </h2>
        </div>

        {/* OPD Analytics Section */}
        <SubSection icon={Stethoscope} title="OPD Analytics">
          <ChartCard title="Daily OPD Patients (Last 7 Days)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={opdDaily}>
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
                  allowDecimals={false}
                  tick={{ fontSize: 11, fontWeight: 700 }}
                  stroke="currentColor"
                  className="text-slate-400"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Patients"
                  stroke={BRAND_COLORS.primaryDark}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: BRAND_COLORS.primaryDark }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Monthly OPD Patients">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={opdMonthly}>
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
                  allowDecimals={false}
                  tick={{ fontSize: 11, fontWeight: 700 }}
                  stroke="currentColor"
                  className="text-slate-400"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="count"
                  name="Patients"
                  fill={BRAND_COLORS.primaryDark}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </SubSection>

        {/* IPD Analytics Section */}
        <SubSection icon={BedDouble} title="IPD Analytics">
          <ChartCard title="Admissions vs Discharges (Last 6 Months)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ipdAdmissionsDischarges}>
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
                  allowDecimals={false}
                  tick={{ fontSize: 11, fontWeight: 700 }}
                  stroke="currentColor"
                  className="text-slate-400"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  iconType="circle"
                  wrapperStyle={{
                    fontSize: 11,
                    fontWeight: 700,
                    paddingTop: 10,
                  }}
                />
                <Bar
                  dataKey="admissions"
                  name="Admissions"
                  fill={BRAND_COLORS.primaryDark}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="discharges"
                  name="Discharges"
                  fill={BRAND_COLORS.primaryLight}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Semi-Circle Bed Occupancy Gauge Chart */}
          <ChartCard title="Current Bed Occupancy Gauge">
            <SemiCircleGauge
              activeCount={ipd?.activeCount || 0}
              totalCount={ipd?.totalAdmittedEver || 0}
              percentage={occupancyPercent}
            />
          </ChartCard>
        </SubSection>

        {/* Pharmacy Analytics Section */}
        <SubSection icon={Pill} title="Pharmacy Analytics">
          <ChartCard title="Medicine Stock Status">
            <DonutChart data={stockStatus} />
          </ChartCard>
          <ChartCard title="Top Consumed Medicines">
            {topConsumedMedicines.length === 0 ? (
              <EmptyChartState message="No inventory consumption recorded yet." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={topConsumedMedicines}
                  layout="vertical"
                  margin={{ left: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="currentColor"
                    className="text-slate-200/60 dark:text-slate-800"
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fontWeight: 700 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={100}
                    tick={{ fontSize: 11, fontWeight: 700 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="consumed"
                    name="Units Consumed"
                    fill={BRAND_COLORS.primaryDark}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </SubSection>

        {/* Staff Analytics Section */}
        <SubSection icon={UserCog} title="Employee Analytics">
          <ChartCard title="Employees by Department">
            {employeesByDept.length === 0 ? (
              <EmptyChartState message="No employee records available." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={employeesByDept}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    className="text-slate-200/60 dark:text-slate-800"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fontWeight: 700 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={40}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fontWeight: 700 }}
                    stroke="currentColor"
                    className="text-slate-400"
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="count"
                    name="Employees"
                    fill={BRAND_COLORS.primaryDark}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard title="Active vs Inactive Staff">
            <DonutChart data={employeeActiveInactive} />
          </ChartCard>
        </SubSection>
      </section>

      {/* Detailed Activity Monitoring Section */}
      <section className="space-y-4 pt-4 border-t border-slate-200/60 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ClipboardList
            className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]"
            strokeWidth={2.5}
          />
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-[#9ca3af]">
            Activity Monitoring
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <WidgetCard title="Recent OPD Registrations" icon={UserPlus}>
            <ListWidget
              items={recentOpdRegistrations}
              emptyMessage="No recent OPD registrations."
              renderItem={(p) => (
                <div
                  key={p._id || p.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs"
                >
                  <div>
                    <p className="font-extrabold text-slate-800 dark:text-white">
                      {p.name || "Unnamed Patient"}
                    </p>
                    <p className="text-slate-400 text-[11px] font-medium">
                      {p.gender ? `${p.gender}, ` : ""}
                      {p.age ? `${p.age} yrs` : ""}
                    </p>
                  </div>
                  <span className="text-slate-400 font-bold text-[11px]">
                    {fmtDate(p.visitDate || p.createdAt)}
                  </span>
                </div>
              )}
            />
          </WidgetCard>

          <WidgetCard title="Today's OPD Appointments" icon={CalendarDays}>
            <ListWidget
              items={todaysAppointments}
              emptyMessage="No appointments scheduled today."
              renderItem={(p) => (
                <div
                  key={p._id || p.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs"
                >
                  <div>
                    <p className="font-extrabold text-slate-800 dark:text-white">
                      {p.name}
                    </p>
                    <p className="text-slate-400 text-[11px] font-medium">
                      Doctor: {p.doctorName || "Assigned Doctor"}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] text-[10px] font-extrabold">
                    Today
                  </span>
                </div>
              )}
            />
          </WidgetCard>

          <WidgetCard title="Upcoming Follow-Ups" icon={CalendarClock}>
            <ListWidget
              items={upcomingFollowUps}
              emptyMessage="No pending follow-ups."
              renderItem={(item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs"
                >
                  <div>
                    <p className="font-extrabold text-slate-800 dark:text-white">
                      {item.name}
                    </p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {item.source}
                    </span>
                  </div>
                  <span className="text-slate-500 font-bold text-[11px]">
                    {fmtDate(item.date)}
                  </span>
                </div>
              )}
            />
          </WidgetCard>

          <WidgetCard title="Recent IPD Admissions" icon={BedDouble}>
            <ListWidget
              items={recentAdmissions}
              emptyMessage="No recent IPD admissions."
              renderItem={(p) => (
                <div
                  key={p._id || p.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs"
                >
                  <div>
                    <p className="font-extrabold text-slate-800 dark:text-white">
                      {p.name}
                    </p>
                    <p className="text-slate-400 text-[11px] font-medium">
                      Bed/Room: {p.bedNumber || p.roomNumber || "Unassigned"}
                    </p>
                  </div>
                  <span className="text-slate-400 font-bold text-[11px]">
                    {fmtDate(p.admissionDate)}
                  </span>
                </div>
              )}
            />
          </WidgetCard>

          <WidgetCard title="Recent Discharges" icon={PackageCheck}>
            <ListWidget
              items={recentDischarges}
              emptyMessage="No recent discharges."
              renderItem={(p) => (
                <div
                  key={p._id || p.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs"
                >
                  <div>
                    <p className="font-extrabold text-slate-800 dark:text-white">
                      {p.name}
                    </p>
                    <p className="text-slate-400 text-[11px] font-medium">
                      Discharged
                    </p>
                  </div>
                  <span className="text-slate-400 font-bold text-[11px]">
                    {fmtDate(p.dischargeDate)}
                  </span>
                </div>
              )}
            />
          </WidgetCard>

          <WidgetCard title="Low Stock Alerts" icon={PackageX}>
            <ListWidget
              items={lowStockList}
              emptyMessage="All inventory stock levels optimal."
              renderItem={(m) => (
                <div
                  key={m._id || m.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs"
                >
                  <div>
                    <p className="font-extrabold text-slate-800 dark:text-white">
                      {m.drugName || m.name}
                    </p>
                    <p className="text-slate-400 text-[11px] font-medium">
                      Reorder Threshold: {m.reorderLevel || 0}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[10px] font-extrabold">
                    {m.quantity ?? 0} Left
                  </span>
                </div>
              )}
            />
          </WidgetCard>
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-4 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed">
        Pharmacy inventory values use per-unit price (`unitsPerPack`). "Top
        Consumed Medicines" is estimated through initial vs. current stock
        metrics.
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable Subcomponents
// ---------------------------------------------------------------------------

function SubSection({ icon: Icon, title, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon
          className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]"
          strokeWidth={2.5}
        />
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
          {title}
        </h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
      <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-4">
        {title}
      </h4>
      {children}
    </div>
  );
}

function WidgetCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-4 flex flex-col h-full shadow-xs">
      <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
        <div className="w-7 h-7 rounded-lg bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
        </div>
        <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
          {title}
        </h4>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function SemiCircleGauge({ activeCount, totalCount, percentage }) {
  const gaugeData = [
    { name: "Admitted", value: activeCount, color: BRAND_COLORS.primaryDark },
    {
      name: "Discharged",
      value: Math.max(0, totalCount - activeCount),
      color: BRAND_COLORS.lightSlate,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-[220px]">
      <div className="w-full h-[180px] flex items-center justify-center relative">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={gaugeData}
              cx="50%"
              cy="70%"
              startAngle={180}
              endAngle={0}
              innerRadius={60}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {gaugeData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute top-[52%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {percentage}%
          </span>
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">
            Occupied
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 text-[10px] font-bold text-slate-500 -mt-2">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0f4a29]" /> Admitted (
          {activeCount})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Discharged
          ({Math.max(0, totalCount - activeCount)})
        </span>
      </div>
    </div>
  );
}

function ListWidget({ items, emptyMessage, renderItem }) {
  if (!items || items.length === 0) {
    return (
      <div className="h-28 flex items-center justify-center text-xs text-slate-400 font-medium text-center">
        {emptyMessage}
      </div>
    );
  }
  return <div className="space-y-0.5">{items.map(renderItem)}</div>;
}

function EmptyChartState({ message }) {
  return (
    <div className="h-[220px] flex items-center justify-center text-xs text-slate-400 font-medium text-center px-6">
      {message}
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#0f4a29",
  borderRadius: 12,
  border: "none",
  color: "#ffffff",
  fontSize: 11,
  fontWeight: 700,
  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
};

function DonutChart({ data }) {
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
  if (total === 0) {
    return <EmptyChartState message="No data records available." />;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={4}
          stroke="none"
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color || BRAND_COLORS.primaryDark} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 10 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
