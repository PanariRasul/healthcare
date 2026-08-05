// client/src/pages/opd/OPDDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { StatCard, PageHeader, StatusBadge } from "../../components/UI";
import {
  Users,
  IndianRupee,
  Banknote,
  Smartphone,
  UserPlus,
  TrendingUp,
  CalendarClock,
  Bell,
  Loader2,
  Info,
  Calendar,
  Clock,
} from "lucide-react";
import { api } from "../../lib/api";

export default function OPDDashboard() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { patients: data } = await api.get("/opd/patients");
        setPatients(data);
      } catch (err) {
        setError(err.message || "Could not load dashboard data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = new Date().toISOString().split("T")[0];
  const today = patients.filter((p) => p.visitDate === todayStr);

  const totalCash = today.reduce((s, p) => s + p.cash, 0);
  const totalUPI = today.reduce((s, p) => s + p.upi, 0);
  const totalCollected = totalCash + totalUPI;
  const recentPatients = [...patients].reverse().slice(0, 5);

  const todayFollowUps = patients.filter((p) => p.followUpDate === todayStr);

  const next7 = new Date();
  next7.setDate(next7.getDate() + 7);
  const incomingPatients = patients
    .filter(
      (p) =>
        p.followUpDate &&
        p.followUpDate >= todayStr &&
        new Date(p.followUpDate) <= next7,
    )
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
    .slice(0, 5);

  const pendingReminders = patients.filter(
    (p) =>
      p.reminderEnabled &&
      p.reminderStatus === "Pending" &&
      p.followUpDate >= todayStr,
  );

  const formattedDate = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const formattedTime = now.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
          dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="OPD Dashboard"
        subtitle="Outpatient Department registration metrics, follow-ups, and collections"
        action={
          <button
            onClick={() => navigate("/opd/register")}
            className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register Patient</span>
          </button>
        }
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Patients Today"
          value={today.length}
          icon={Users}
          color="green"
          sub={todayStr}
        />
        <StatCard
          label="Total Collection"
          value={`₹${totalCollected.toLocaleString()}`}
          icon={IndianRupee}
          color="green"
          sub="Cash + UPI today"
        />
        <StatCard
          label="Cash Collection"
          value={`₹${totalCash.toLocaleString()}`}
          icon={Banknote}
          color="yellow"
          sub="Cash payments"
        />
        <StatCard
          label="UPI Collection"
          value={`₹${totalUPI.toLocaleString()}`}
          icon={Smartphone}
          color="green"
          sub="UPI payments"
        />
      </div>

      {/* Follow-Ups & Reminders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Today's Follow-Ups */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <CalendarClock className="w-4 h-4" /> Today's Follow-Ups
              </h3>
              <button
                onClick={() => navigate("/opd/followups")}
                className="text-[10px] font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
              >
                View All →
              </button>
            </div>
            {todayFollowUps.length === 0 ? (
              <p className="text-slate-400 text-xs py-4 text-center font-medium">
                No follow-ups today
              </p>
            ) : (
              <div className="space-y-2">
                {todayFollowUps.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] flex items-center justify-center font-bold text-[10px] shrink-0">
                        {p.name[0]}
                      </div>
                      <span className="text-slate-800 dark:text-white font-extrabold truncate">
                        {p.name}
                      </span>
                    </div>
                    <StatusBadge status={p.condition} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {todayFollowUps.length}
          </div>
        </div>

        {/* Incoming Patients */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0f4a29] dark:text-[#52b788] flex items-center gap-2">
                <Users className="w-4 h-4" /> Incoming (7 Days)
              </h3>
              <button
                onClick={() => navigate("/opd/followups")}
                className="text-[10px] font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
              >
                View All →
              </button>
            </div>
            {incomingPatients.length === 0 ? (
              <p className="text-slate-400 text-xs py-4 text-center font-medium">
                No upcoming patients
              </p>
            ) : (
              <div className="space-y-2">
                {incomingPatients.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] flex items-center justify-center font-bold text-[10px] shrink-0">
                        {p.name[0]}
                      </div>
                      <span className="text-slate-800 dark:text-white font-extrabold truncate">
                        {p.name}
                      </span>
                    </div>
                    <span className="text-slate-400 text-[10px] font-bold">
                      {p.followUpDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-2xl font-extrabold text-[#0f4a29] dark:text-[#52b788]">
            {incomingPatients.length}
          </div>
        </div>

        {/* Pending Reminders */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                <Bell className="w-4 h-4" /> Pending Reminders
              </h3>
              <button
                onClick={() => navigate("/opd/followups")}
                className="text-[10px] font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
              >
                Send →
              </button>
            </div>
            {pendingReminders.length === 0 ? (
              <p className="text-slate-400 text-xs py-4 text-center font-medium">
                All reminders sent
              </p>
            ) : (
              <div className="space-y-2">
                {pendingReminders.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] flex items-center justify-center font-bold text-[10px] shrink-0">
                        {p.name[0]}
                      </div>
                      <span className="text-slate-800 dark:text-white font-extrabold truncate">
                        {p.name}
                      </span>
                    </div>
                    <span className="text-slate-400 text-[10px] font-medium">
                      {p.phone}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
            {pendingReminders.length}
          </div>
        </div>
      </div>

      {/* Analytics & Overview Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Payment Split */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
            Payment Split (Today)
          </h3>
          <div className="space-y-3">
            {[
              { label: "Cash", amount: totalCash, color: "bg-amber-500" },
              { label: "UPI", amount: totalUPI, color: "bg-[#0f4a29]" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="text-slate-900 dark:text-white">
                    ₹{item.amount.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-700`}
                    style={{
                      width: totalCollected
                        ? `${(item.amount / totalCollected) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* All Time Stats */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
            All-Time OPD Statistics
          </h3>
          <div className="space-y-2.5">
            {[
              { label: "Total Patients", val: patients.length },
              {
                label: "Total Revenue",
                val: `₹${patients.reduce((s, p) => s + p.total, 0).toLocaleString()}`,
              },
              {
                label: "Total Cash",
                val: `₹${patients.reduce((s, p) => s + p.cash, 0).toLocaleString()}`,
              },
              {
                label: "Total UPI",
                val: `₹${patients.reduce((s, p) => s + p.upi, 0).toLocaleString()}`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs"
              >
                <span className="text-slate-500 font-medium">{item.label}</span>
                <span className="font-extrabold text-slate-900 dark:text-white">
                  {item.val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Follow-Ups List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs md:col-span-2 lg:col-span-1">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
            Upcoming Schedule
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {patients
              .filter((p) => p.followUpDate)
              .slice(0, 5)
              .map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] flex items-center justify-center text-xs font-extrabold shrink-0">
                      {p.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-slate-900 dark:text-white font-extrabold truncate">
                        {p.name}
                      </div>
                      <div className="text-slate-400 text-[10px] font-medium">
                        {p.followUpDate}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={p.condition} />
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Footer Info Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full px-6 py-3 shadow-xs">
        <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
          <Info className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />
          VIRUPAKSHIPURAM Paralysis Centre OPD System
        </div>
        <div className="flex items-center gap-4 text-slate-500 text-xs font-bold shrink-0">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#0f4a29]" /> {formattedDate}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#0f4a29]" /> {formattedTime}
          </span>
        </div>
      </div>
    </div>
  );
}
