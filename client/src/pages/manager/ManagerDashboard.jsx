// client/src/pages/manager/ManagerDashboard.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/UI";
import { UserPlus, Users, Sun, Moon, UserX, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
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

const BRAND_COLORS = {
  primaryDark: "#0f4a29",
  primaryLight: "#52b788",
  slate: "#64748b",
  lightSlate: "#cbd5e1",
};

const tooltipStyle = {
  backgroundColor: "#0f4a29",
  borderRadius: 12,
  border: "none",
  color: "#ffffff",
  fontSize: 11,
  fontWeight: 700,
  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
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
    return () => {
      cancelled = true;
    };
  }, []);

  const totalEmployees = summary?.totalEmployees ?? 0;
  const dayShiftEmployees = summary?.dayShiftEmployees ?? 0;
  const nightShiftEmployees = summary?.nightShiftEmployees ?? 0;
  const unassignedEmployees = summary?.unassignedEmployees ?? 0;
  const generalShiftEmployees = Math.max(
    0,
    totalEmployees -
      dayShiftEmployees -
      nightShiftEmployees -
      unassignedEmployees,
  );

  // Single cohesive color palette matching the brand theme
  const shiftDistribution = useMemo(
    () => [
      {
        label: "Day Shift",
        value: dayShiftEmployees,
        color: BRAND_COLORS.primaryDark,
      },
      {
        label: "Night Shift",
        value: nightShiftEmployees,
        color: BRAND_COLORS.primaryLight,
      },
      {
        label: "General Shift",
        value: generalShiftEmployees,
        color: BRAND_COLORS.slate,
      },
      {
        label: "Unassigned",
        value: unassignedEmployees,
        color: BRAND_COLORS.lightSlate,
      },
    ],
    [
      dayShiftEmployees,
      nightShiftEmployees,
      generalShiftEmployees,
      unassignedEmployees,
    ],
  );

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      {/* Header */}
      <PageHeader
        title={`Welcome${user?.username ? `, ${user.username}` : ""}`}
        subtitle="Manager overview — monitor workforce schedules and shift allocations"
        action={
          <button
            onClick={() => navigate("/manager/shift-assign")}
            className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Shift Assignment</span>
          </button>
        }
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Shift Overview Section */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            shift data...
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stat Cards - Consistent Brand Green Palette */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label="Total Employees"
              value={totalEmployees}
              color="green"
            />
            <StatCard
              icon={Sun}
              label="Day Shift"
              value={dayShiftEmployees}
              color="green"
            />
            <StatCard
              icon={Moon}
              label="Night Shift"
              value={nightShiftEmployees}
              color="green"
            />
            <StatCard
              icon={UserX}
              label="Unassigned"
              value={unassignedEmployees}
              color="green"
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                Shift Allocation Ratio
              </h3>
              {totalEmployees === 0 ? (
                <EmptyChartState message="No employee shift data available." />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={shiftDistribution}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      stroke="none"
                    >
                      {shiftDistribution.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{
                        fontSize: 11,
                        fontWeight: 700,
                        paddingTop: 10,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                Shift Distribution
              </h3>
              {totalEmployees === 0 ? (
                <EmptyChartState message="No employee shift data available." />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={shiftDistribution}>
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
                      dataKey="value"
                      name="Employees"
                      fill={BRAND_COLORS.primaryDark}
                      radius={[6, 6, 0, 0]}
                    >
                      {shiftDistribution.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyChartState({ message }) {
  return (
    <div className="h-[220px] flex items-center justify-center text-xs text-slate-400 font-medium text-center px-6">
      {message}
    </div>
  );
}
