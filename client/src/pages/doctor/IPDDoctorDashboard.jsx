// client/src/pages/doctor/IPDDoctorDashboard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, EmptyState } from "../../components/UI";
import {
  Users,
  BedDouble,
  CheckCircle2,
  CalendarClock,
  Bell,
  Phone,
  MessageCircle,
  Loader2,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { fetchPatients, fetchFollowUps } from "../ipd/api/ipd.api";

const toDateStr = (d) => (d ? new Date(d).toISOString().split("T")[0] : "");
const ALL_PATIENTS_LIMIT = 1000;

export function IPDDoctorDashboard() {
  const [patients, setPatients] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [patientsRes, followUpsRes] = await Promise.all([
          fetchPatients({ limit: ALL_PATIENTS_LIMIT }),
          fetchFollowUps(),
        ]);
        setPatients(patientsRes.data || []);
        setFollowUps(
          (followUpsRes.patients || []).map((p) => ({
            ...p,
            followUpDate: toDateStr(p.followUpDate),
          })),
        );
      } catch (err) {
        setError(err.message || "Could not load dashboard data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const next7 = new Date();
  next7.setDate(next7.getDate() + 7);

  const totalPatients = patients.length;
  const admittedCount = patients.filter(
    (p) => (p.dischargeStatus || "Admitted") === "Admitted",
  ).length;
  const dischargedCount = patients.filter(
    (p) => p.dischargeStatus === "Discharged",
  ).length;
  const duesCount = patients.filter((p) => (p.balance || 0) > 0).length;

  const recentPatients = patients
    .filter((p) => toDateStr(p.admissionDate) === today)
    .sort((a, b) => new Date(b.admissionDate) - new Date(a.admissionDate));

  const pendingFollowUps = followUps
    .filter((p) => p.followUpStatus === "Pending" && p.followUpDate)
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));

  const upcomingFollowUps = pendingFollowUps
    .filter((p) => p.followUpDate >= today && new Date(p.followUpDate) <= next7)
    .slice(0, 5);

  const pendingReminders = followUps
    .filter(
      (p) =>
        p.reminderEnabled &&
        p.reminderStatus === "Pending" &&
        p.followUpDate >= today,
    )
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
    .slice(0, 5);

  const cards = [
    { label: "Total Patients", value: totalPatients, icon: Users },
    { label: "Admitted", value: admittedCount, icon: BedDouble },
    {
      label: "Pending Follow-Ups",
      value: pendingFollowUps.length,
      icon: CalendarClock,
    },
    { label: "Discharged", value: dischargedCount, icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Doctor Dashboard"
        subtitle="IPD ward overview at a glance"
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            dashboard...
          </div>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.label}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col justify-between"
                >
                  <div className="w-9 h-9 rounded-2xl bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] flex items-center justify-center shrink-0 mb-3">
                    <Icon className="w-4 h-4" strokeWidth={2.5} />
                  </div>
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white leading-none">
                    {c.value}
                  </p>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-2">
                    {c.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Row: Recent Admissions + Upcoming Follow-Ups */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Admissions */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
                  Recent Admissions Today
                </h3>
                <button
                  onClick={() => navigate("/doctor/ipd")}
                  className="flex items-center gap-1 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
                >
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {recentPatients.length === 0 ? (
                <EmptyState
                  icon={BedDouble}
                  message="No patients admitted today"
                />
              ) : (
                <div className="space-y-2.5">
                  {recentPatients.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800/60 pb-2.5 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] flex items-center justify-center font-extrabold text-xs shrink-0">
                        {p.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {p.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          #{p.serialNumber || "—"} •{" "}
                          {new Date(p.admissionDate).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] font-extrabold shrink-0">
                        {p.dischargeStatus || "Admitted"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Followups */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
                  Upcoming Follow-Ups
                </h3>
                <button
                  onClick={() => navigate("/doctor/ipd/followups")}
                  className="flex items-center gap-1 text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
                >
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {upcomingFollowUps.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  message="No follow-ups scheduled in next 7 days"
                />
              ) : (
                <div className="space-y-2.5">
                  {upcomingFollowUps.map((p) => {
                    const isToday = p.followUpDate === today;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800/60 pb-2.5 last:border-0"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] flex items-center justify-center font-extrabold text-xs shrink-0">
                          {p.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {p.followUpDate}
                          </p>
                        </div>
                        {isToday && (
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-extrabold shrink-0 border border-amber-200">
                            Today
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Pending Reminders */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
                Pending WhatsApp Reminders
              </h3>
            </div>

            {pendingReminders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">
                No pending WhatsApp reminders.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingReminders.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] flex items-center justify-center font-extrabold text-xs shrink-0">
                        {p.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {p.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {p.followUpDate}
                        </p>
                      </div>
                    </div>
                    {p.phone && (
                      <a
                        href={`https://wa.me/91${p.phone}?text=Dear ${encodeURIComponent(p.name)}, your follow-up is scheduled on ${p.followUpDate}.`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-extrabold bg-[#0f4a29] text-white shrink-0 shadow-2xs"
                      >
                        <MessageCircle className="w-3 h-3" /> WhatsApp
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {duesCount > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mt-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              {duesCount} patient{duesCount > 1 ? "s" : ""} still have pending
              balances.
            </p>
          )}
        </>
      )}
    </div>
  );
}
