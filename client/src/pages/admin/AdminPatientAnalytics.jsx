// client/src/pages/admin/AdminPatientAnalytics.jsx
import { useState, useEffect } from "react";
import { PageHeader, StatCard, TableCard, Th, Td } from "../../components/UI";
import { api } from "../../lib/api";
import {
  Users,
  UserCheck,
  CalendarClock,
  AlertTriangle,
  BedDouble,
  LogOut,
  TrendingUp,
  Loader2,
  Stethoscope,
  Wallet,
} from "lucide-react";

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "—";
  }
};

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString()}`;

function ConditionBadge({ condition }) {
  if (!condition)
    return (
      <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
    );
  const styles = {
    Critical:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",
    Chronic:
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
    Improving:
      "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
  };
  return (
    <span
      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
        styles[condition] ||
        "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
      }`}
    >
      {condition}
    </span>
  );
}

function SettlementBadge({ status }) {
  const styles = {
    "Fully Paid":
      "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
    "Partially Paid":
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
    Pending:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",
  };
  return (
    <span
      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
        styles[status] ||
        "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
      }`}
    >
      {status || "—"}
    </span>
  );
}

export default function AdminPatientAnalytics() {
  const [module, setModule] = useState("OPD");

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
        <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
          analytics...
        </div>
      </div>
    );
  }

  const settlementCounts = ipdSettlements.reduce((acc, p) => {
    acc[p.settlementStatus] = (acc[p.settlementStatus] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Patient Analytics"
        subtitle="Comprehensive OPD & IPD patient tracking and financial summaries"
        action={
          <div className="flex gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full shadow-2xs">
            {["OPD", "IPD"].map((m) => {
              const isActive = module === m;
              const Icon = m === "OPD" ? Stethoscope : BedDouble;
              return (
                <button
                  key={m}
                  onClick={() => setModule(m)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                    isActive
                      ? "bg-[#0f4a29] text-white shadow-xs"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {m} Analytics
                </button>
              );
            })}
          </div>
        }
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {module === "OPD" && opdStats && (
        <>
          {/* Top Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Patients"
              value={opdStats.totalPatients}
              icon={Users}
              color="green"
              sub="All-time registrations"
            />
            <StatCard
              label="Seen Today"
              value={opdStats.seenToday}
              icon={UserCheck}
              color="green"
              sub="Recorded today"
            />
            <StatCard
              label="Pending Follow-Ups"
              value={opdStats.pendingFollowUps}
              icon={CalendarClock}
              color="yellow"
              sub="Awaiting completion"
            />
            <StatCard
              label="Critical Patients"
              value={opdStats.criticalCount}
              icon={AlertTriangle}
              color="red"
              sub="Marked as Critical"
            />
          </div>

          {/* Revenue Summaries */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Revenue", val: fmtMoney(opdStats.totalRevenue) },
              {
                label: "Today's Revenue",
                val: fmtMoney(opdStats.todayRevenue),
              },
              {
                label: "Today Cash / UPI",
                val: `${fmtMoney(opdStats.todayCash)} / ${fmtMoney(opdStats.todayUpi)}`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs text-center"
              >
                <div className="font-extrabold text-2xl text-[#0f4a29] dark:text-[#52b788]">
                  {item.val}
                </div>
                <div className="text-slate-500 dark:text-slate-400 text-xs font-bold mt-1">
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          {/* Critical Patients + Recent OPD Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
              <h3 className="text-rose-600 dark:text-rose-400 font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4" /> Critical Patients (
                {opdStats.criticalCount})
              </h3>
              {opdStats.criticalPatients.length === 0 ? (
                <p className="text-slate-400 text-xs py-8 text-center font-medium">
                  No critical patients currently.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {opdStats.criticalPatients.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 text-xs py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                    >
                      <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {p.name[0]}
                      </div>
                      <span className="text-slate-800 dark:text-white font-bold truncate">
                        {p.name}
                      </span>
                      <span className="text-rose-500 font-extrabold text-[10px] ml-auto">
                        #{p.serialNumber}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <TableCard>
                <thead>
                  <tr>
                    <Th>Token</Th>
                    <Th>Name</Th>
                    <Th>Visit Date</Th>
                    <Th>Amount</Th>
                    <Th>Condition</Th>
                  </tr>
                </thead>
                <tbody>
                  {opdStats.recentPatients.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-slate-100 dark:border-slate-800/60"
                    >
                      <Td className="font-mono text-xs font-bold text-slate-500">
                        #{p.serialNumber}
                      </Td>
                      <Td className="font-extrabold text-slate-900 dark:text-white">
                        {p.name}
                      </Td>
                      <Td className="text-slate-500 font-medium">
                        {p.visitDate}
                      </Td>
                      <Td className="text-[#0f4a29] dark:text-[#52b788] font-extrabold">
                        {fmtMoney(p.total)}
                      </Td>
                      <Td>
                        <ConditionBadge condition={p.condition} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            </div>
          </div>
        </>
      )}

      {module === "IPD" && ipdStats && (
        <>
          {/* Top Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Admitted (Ever)"
              value={ipdStats.totalAdmittedEver}
              icon={Users}
              color="green"
              sub="All-time admissions"
            />
            <StatCard
              label="Currently Admitted"
              value={ipdStats.activeCount}
              icon={BedDouble}
              color="green"
              sub="Active beds"
            />
            <StatCard
              label="Discharged"
              value={ipdStats.dischargedCount}
              icon={LogOut}
              color="yellow"
              sub="Total discharged"
            />
            <StatCard
              label="Outstanding Balance"
              value={fmtMoney(ipdStats.totalBalance)}
              icon={AlertTriangle}
              color="red"
              sub="Across admitted"
            />
          </div>

          {/* Financial Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: "Total Deposits",
                val: fmtMoney(ipdStats.totalDeposits),
              },
              { label: "Total Cash", val: fmtMoney(ipdStats.totalCash) },
              { label: "Total UPI", val: fmtMoney(ipdStats.totalUpi) },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs text-center"
              >
                <div className="font-extrabold text-2xl text-[#0f4a29] dark:text-[#52b788]">
                  {item.val}
                </div>
                <div className="text-slate-500 dark:text-slate-400 text-xs font-bold mt-1">
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          {/* Settlement Status Count Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {["Pending", "Partially Paid", "Fully Paid"].map((status) => (
              <div
                key={status}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 flex items-center gap-4 shadow-xs"
              >
                <div className="w-10 h-10 rounded-2xl bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-2xl text-slate-900 dark:text-white">
                    {settlementCounts[status] || 0}
                  </div>
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                    {status}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Currently Admitted & Discharges */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TableCard>
              <thead>
                <tr>
                  <Th>Serial</Th>
                  <Th>Name</Th>
                  <Th>Admitted</Th>
                  <Th>Balance</Th>
                </tr>
              </thead>
              <tbody>
                {ipdStats.activePatients.slice(0, 6).map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100 dark:border-slate-800/60"
                  >
                    <Td className="font-mono text-xs font-bold text-slate-500">
                      #{p.serialNumber}
                    </Td>
                    <Td className="font-extrabold text-slate-900 dark:text-white">
                      {p.name}
                    </Td>
                    <Td className="text-slate-500 font-medium">
                      {fmtDate(p.admissionDate)}
                    </Td>
                    <Td className="font-extrabold text-rose-500">
                      {fmtMoney(p.balance)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>

            <TableCard>
              <thead>
                <tr>
                  <Th>Serial</Th>
                  <Th>Name</Th>
                  <Th>Discharged</Th>
                  <Th>Settlement</Th>
                </tr>
              </thead>
              <tbody>
                {ipdStats.recentDischarges.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100 dark:border-slate-800/60"
                  >
                    <Td className="font-mono text-xs font-bold text-slate-500">
                      #{p.serialNumber}
                    </Td>
                    <Td className="font-extrabold text-slate-900 dark:text-white">
                      {p.name}
                    </Td>
                    <Td className="text-slate-500 font-medium">
                      {fmtDate(p.dischargeDate)}
                    </Td>
                    <Td>
                      <SettlementBadge status={p.settlementStatus} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          </div>
        </>
      )}
    </div>
  );
}
