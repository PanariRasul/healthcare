// client/src/pages/doctor/DoctorOPDDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { PageHeader } from "../../components/UI";
import {
  Users,
  CalendarClock,
  AlertTriangle,
  Activity,
  Loader2,
  ArrowRight,
  IndianRupee,
  ShieldAlert,
} from "lucide-react";

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 flex items-center gap-4 shadow-xs">
      <div className="w-10 h-10 rounded-2xl bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none">
          {value}
        </p>
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1.5">
          {label}
        </p>
      </div>
    </div>
  );
}

const conditionColors = {
  Critical:
    "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200",
  Chronic:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200",
  Mild: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200",
  Improving:
    "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20",
  Stable:
    "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20",
  Good: "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20",
};

export function DoctorOPDDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api.get("/opd/patients/stats");
        if (cancelled) return;
        setStats(data);
      } catch (err) {
        if (!cancelled)
          setError(err.message || "Could not load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
          dashboard...
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
    totalPatients,
    seenToday,
    pendingFollowUps,
    criticalCount,
    recentPatients,
    criticalPatients,
  } = stats;

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Doctor OPD Dashboard"
        subtitle="Outpatient consultations, recent activity, and critical alerts"
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Patients Today" value={seenToday} />
        <StatCard
          icon={Activity}
          label="Total OPD Patients"
          value={totalPatients}
        />
        <StatCard
          icon={CalendarClock}
          label="Pending Follow-Ups"
          value={pendingFollowUps}
        />
        <StatCard
          icon={AlertTriangle}
          label="Critical Patients"
          value={criticalCount}
        />
      </div>

      {/* Critical Patients Callout */}
      {criticalPatients.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/40 rounded-[28px] p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
              Needs Immediate Attention
            </h3>
          </div>
          <div className="space-y-2">
            {criticalPatients.slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-xs text-[#0f4a29] dark:text-[#52b788] font-extrabold shrink-0">
                    #{p.serialNumber}
                  </span>
                  <span className="text-xs text-slate-900 dark:text-white font-extrabold truncate">
                    {p.name}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border shrink-0 ${conditionColors.Critical}`}
                >
                  Critical
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Patients + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
              Recent OPD Consultations
            </h3>
            <button
              onClick={() => navigate("/doctor/opd/patients")}
              className="flex items-center gap-1 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {recentPatients.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center font-medium">
              No recent consultations.
            </p>
          ) : (
            <div className="space-y-2">
              {recentPatients.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] flex items-center justify-center text-xs font-extrabold shrink-0">
                      {p.name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {p.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        #{p.serialNumber} • {p.visitDate}
                      </p>
                    </div>
                  </div>
                  {p.condition && (
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border shrink-0 ${
                        conditionColors[p.condition] || conditionColors.Stable
                      }`}
                    >
                      {p.condition}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
          <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            Quick Actions
          </h3>
          <div className="space-y-2.5">
            <button
              onClick={() => navigate("/doctor/opd/followups")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold hover:border-[#0f4a29] transition-all"
            >
              <span className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
                Review Follow-Ups
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={() => navigate("/doctor/opd/patients")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold hover:border-[#0f4a29] transition-all"
            >
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
                View All Patients
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={() => navigate("/doctor/opd/revenue")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold hover:border-[#0f4a29] transition-all"
            >
              <span className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
                View Revenue
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
