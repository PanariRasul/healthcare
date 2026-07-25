// client/src/pages/admin/AdminPatientAnalytics.jsx
// Read-only OPD + IPD analytics for Admin. Toggle between modules instead of
// stacking both dashboards — keeps it usable on mobile and avoids duplicating
// every card from OPDDashboard/IPDDashboard onto one long page.
import { useState, useEffect } from "react";
import { PageHeader, StatCard, TableCard, Th, Td, EmptyState } from "../../components/UI";
import { api } from "../../lib/api";
import {
  Users, UserCheck, CalendarClock, AlertTriangle, DollarSign, Wallet,
  BedDouble, LogOut, TrendingUp, Loader2, Stethoscope, Search,
} from "lucide-react";

const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d).toISOString().split("T")[0]; } catch { return "—"; }
};

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString()}`;

function ConditionBadge({ condition }) {
  if (!condition) return <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>;
  const styles = {
    Critical:  "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",
    Chronic:   "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
    Improving: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
      styles[condition] || "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
    }`}>
      {condition}
    </span>
  );
}

function SettlementBadge({ status }) {
  const styles = {
    "Fully Paid":      "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
    "Partially Paid":  "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
    "Pending":         "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
      styles[status] || "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
    }`}>
      {status || "—"}
    </span>
  );
}

export default function AdminPatientAnalytics() {
  const [module, setModule] = useState("OPD"); // "OPD" | "IPD"

  const [opdStats, setOpdStats] = useState(null);
  const [ipdStats, setIpdStats] = useState(null);
  const [ipdSettlements, setIpdSettlements] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [opd, ipd, settlements] = await Promise.all([
          api.get("/opd/patients/stats"),
          api.get("/ipd/stats"),
          api.get("/ipd-payments/summary"),
        ]);
        setOpdStats(opd);
        setIpdStats(ipd);
        setIpdSettlements(settlements);
      } catch (err) {
        setError(err.message || "Could not load patient analytics.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading patient analytics...
        </div>
      </div>
    );
  }

  // Settlement breakdown counts — /ipd/stats doesn't aggregate this, so it's
  // computed client-side from the flat payments-summary list.
  const settlementCounts = ipdSettlements.reduce((acc, p) => {
    acc[p.settlementStatus] = (acc[p.settlementStatus] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="w-full px-2 sm:px-4 max-w-7xl mx-auto">
      <PageHeader title="Patient Analytics" subtitle="OPD & IPD overview across the hospital" />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-400 text-sm font-medium mb-4">
          {error}
        </div>
      )}

      {/* Module toggle */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {["OPD", "IPD"].map(m => (
          <button
            key={m}
            onClick={() => setModule(m)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border whitespace-nowrap flex-shrink-0 ${
              module === m
                ? "bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-500/30"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {m === "OPD" ? <Stethoscope className="w-4 h-4" /> : <BedDouble className="w-4 h-4" />}
            {m} Analytics
          </button>
        ))}
      </div>

      {module === "OPD" && opdStats && (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatCard label="Total Patients"    value={opdStats.totalPatients}    icon={Users}         color="teal"  sub="All-time OPD registrations" />
            <StatCard label="Seen Today"        value={opdStats.seenToday}        icon={UserCheck}     color="green" sub="Visits recorded today" />
            <StatCard label="Pending Follow-Ups" value={opdStats.pendingFollowUps} icon={CalendarClock} color="yellow" sub="Awaiting completion" />
            <StatCard label="Critical Patients" value={opdStats.criticalCount}    icon={AlertTriangle} color="red"   sub="Marked as Critical" />
          </div>

          {/* Revenue */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {[
              { label: "Total Revenue",  val: fmtMoney(opdStats.totalRevenue), color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20" },
              { label: "Today's Revenue", val: fmtMoney(opdStats.todayRevenue), color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" },
              { label: "Today Cash / UPI", val: `${fmtMoney(opdStats.todayCash)} / ${fmtMoney(opdStats.todayUpi)}`, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20" },
            ].map(item => (
              <div key={item.label} className={`${item.bg} border rounded-2xl p-4 text-center shadow-sm dark:shadow-none`}>
                <div className={`font-bold text-xl ${item.color}`}>{item.val}</div>
                <div className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Critical patients + Recent patients */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-red-50/50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl p-4 sm:p-5">
              <h3 className="text-red-800 dark:text-red-400 font-semibold text-sm flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4" /> Critical Patients
                <span className="text-slate-400 dark:text-slate-500 font-normal">({opdStats.criticalCount})</span>
              </h3>
              {opdStats.criticalPatients.length === 0 ? (
                <p className="text-red-600/70 dark:text-red-400/50 text-xs">No critical patients right now</p>
              ) : (
                <div className="space-y-2">
                  {opdStats.criticalPatients.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                        {p.name[0]}
                      </div>
                      <span className="text-slate-700 dark:text-slate-300 font-medium truncate">{p.name}</span>
                      <span className="text-red-500 dark:text-red-400 ml-auto flex-shrink-0">{p.serialNumber}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none lg:col-span-2">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-slate-800 dark:text-white font-semibold text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Recent OPD Patients
                </h3>
              </div>
              {opdStats.recentPatients.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-400 dark:text-slate-500 text-sm">No patients yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50">
                        {["Token", "Name", "Visit Date", "Amount", "Condition"].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {opdStats.recentPatients.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-t border-slate-100 dark:border-slate-800/50">
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{p.serialNumber}</td>
                          <td className="px-5 py-3 text-slate-800 dark:text-white font-medium truncate">{p.name}</td>
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{p.visitDate}</td>
                          <td className="px-5 py-3 text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">{fmtMoney(p.total)}</td>
                          <td className="px-5 py-3"><ConditionBadge condition={p.condition} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {module === "IPD" && ipdStats && (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatCard label="Total Admitted (Ever)" value={ipdStats.totalAdmittedEver} icon={Users}     color="teal"  sub="All-time IPD admissions" />
            <StatCard label="Currently Admitted"    value={ipdStats.activeCount}       icon={BedDouble} color="green" sub="Active beds in use" />
            <StatCard label="Discharged"            value={ipdStats.dischargedCount}   icon={LogOut}    color="yellow" sub="Total discharged" />
            <StatCard label="Outstanding Balance"   value={fmtMoney(ipdStats.totalBalance)} icon={AlertTriangle} color="red" sub="Across admitted patients" />
          </div>

          {/* Financials */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {[
              { label: "Total Deposits", val: fmtMoney(ipdStats.totalDeposits), color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20" },
              { label: "Total Cash",     val: fmtMoney(ipdStats.totalCash),     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" },
              { label: "Total UPI",      val: fmtMoney(ipdStats.totalUpi),      color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20" },
            ].map(item => (
              <div key={item.label} className={`${item.bg} border rounded-2xl p-4 text-center shadow-sm dark:shadow-none`}>
                <div className={`font-bold text-xl ${item.color}`}>{item.val}</div>
                <div className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Settlement breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {["Pending", "Partially Paid", "Fully Paid"].map(status => (
              <div key={status} className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-3">
                <Wallet className="w-6 h-6 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                <div>
                  <div className="font-bold text-2xl text-slate-800 dark:text-white">{settlementCounts[status] || 0}</div>
                  <div className="text-slate-500 dark:text-slate-400 text-xs">{status}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Active patients + Recent discharges */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-slate-800 dark:text-white font-semibold text-sm flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Currently Admitted
                  <span className="text-slate-400 dark:text-slate-500 font-normal">({ipdStats.activeCount})</span>
                </h3>
              </div>
              {ipdStats.activePatients.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">No patients currently admitted</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[360px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50">
                        {["Serial", "Name", "Admitted", "Balance"].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ipdStats.activePatients.slice(0, 6).map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-t border-slate-100 dark:border-slate-800/50">
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{p.serialNumber}</td>
                          <td className="px-5 py-3 text-slate-800 dark:text-white font-medium truncate">{p.name}</td>
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(p.admissionDate)}</td>
                          <td className="px-5 py-3 font-bold whitespace-nowrap text-red-500 dark:text-red-400">{fmtMoney(p.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ipdStats.activePatients.length > 6 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">+{ipdStats.activePatients.length - 6} more admitted</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-slate-800 dark:text-white font-semibold text-sm flex items-center gap-2">
                  <LogOut className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Recent Discharges
                </h3>
              </div>
              {ipdStats.recentDischarges.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">No discharges yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[360px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50">
                        {["Serial", "Name", "Discharged", "Settlement"].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ipdStats.recentDischarges.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-t border-slate-100 dark:border-slate-800/50">
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">{p.serialNumber}</td>
                          <td className="px-5 py-3 text-slate-800 dark:text-white font-medium truncate">{p.name}</td>
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(p.dischargeDate)}</td>
                          <td className="px-5 py-3"><SettlementBadge status={p.settlementStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}