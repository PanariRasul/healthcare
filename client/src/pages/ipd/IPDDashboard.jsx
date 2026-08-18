// client/src/pages/ipd/IPDDashboard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchIpdStats } from "./api/ipd.api";
import { StatCard, PageHeader, StatusBadge } from "../../components/UI";
import {
  BedDouble,
  Pill,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  TrendingUp,
  Users,
  Loader2,
} from "lucide-react";

export default function IPDDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchIpdStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
          IPD dashboard...
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl p-4 text-rose-600 dark:text-rose-400 text-xs font-bold">
        Failed to load dashboard: {error}
      </div>
    );
  }

  const {
    totalAdmittedEver,
    activeCount,
    dischargedCount,
    totalBalance,
    totalDeposits,
    totalCash,
    totalUpi,
    activePatients,
    recentDischarges,
  } = stats;

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="IPD Dashboard"
        subtitle="Inpatient Department admissions, active bed occupancy, and revenue"
        action={
          <button
            onClick={() => navigate("/ipd/admit")}
            className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Admit Patient</span>
          </button>
        }
      />

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Admitted"
          value={totalAdmittedEver}
          icon={BedDouble}
          color="green"
        />
        <StatCard
          label="Active Patients"
          value={activeCount}
          icon={Pill}
          color="green"
          sub="Currently admitted"
        />
        <StatCard
          label="Discharged"
          value={dischargedCount}
          icon={CheckCircle2}
          color="green"
          sub="Successfully treated"
        />
        <StatCard
          label="Pending Balance"
          value={`₹${totalBalance.toLocaleString()}`}
          icon={AlertTriangle}
          color="red"
          sub="From active patients"
        />
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Active Patients Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
              Active Inpatients
            </h3>
            <button
              onClick={() => navigate("/ipd/patients")}
              className="text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
            >
              View All →
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 flex-1">
            {activePatients.length === 0 ? (
              <p className="p-8 text-xs text-slate-400 font-medium text-center">
                No active inpatients currently admitted.
              </p>
            ) : (
              activePatients.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-3 px-1">
                  <div className="w-8 h-8 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] flex items-center justify-center font-extrabold text-xs shrink-0">
                    {p.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-900 dark:text-white text-xs font-extrabold truncate">
                      {p.name}
                    </div>
                    <div className="text-slate-400 text-[10px] font-medium">
                      Admitted: {new Date(p.admissionDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-rose-500 font-extrabold text-xs">
                      ₹{p.balance?.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      Pending
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Revenue & Discharges */}
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white mb-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
              Revenue Overview
            </h3>
            <div className="space-y-2">
              {[
                {
                  label: "Total Deposits",
                  val: `₹${totalDeposits.toLocaleString()}`,
                  color: "text-[#0f4a29] dark:text-[#52b788]",
                },
                {
                  label: "Total Cash",
                  val: `₹${totalCash.toLocaleString()}`,
                  color: "text-amber-600 dark:text-amber-400",
                },
                {
                  label: "Total UPI",
                  val: `₹${totalUpi.toLocaleString()}`,
                  color: "text-[#0f4a29] dark:text-[#52b788]",
                },
                {
                  label: "Total Pending",
                  val: `₹${totalBalance.toLocaleString()}`,
                  color: "text-rose-500",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-xs"
                >
                  <span className="text-slate-500 font-medium">
                    {item.label}
                  </span>
                  <span className={`font-extrabold ${item.color}`}>
                    {item.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white mb-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
              Recent Discharges
            </h3>
            <div className="space-y-2">
              {recentDischarges.length === 0 ? (
                <p className="py-4 text-xs text-slate-400 font-medium text-center">
                  No recent discharges found.
                </p>
              ) : (
                recentDischarges.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] flex items-center justify-center font-extrabold text-xs shrink-0">
                        {p.name[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="text-slate-900 dark:text-white font-extrabold truncate">
                          {p.name}
                        </div>
                        <div className="text-[#9ca3af] text-[10px]">
                          Discharged:{" "}
                          {p.dischargeDate
                            ? new Date(p.dischargeDate).toLocaleDateString()
                            : "—"}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status="Discharged" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
