// client/src/pages/opd/OPDFollowUps.jsx
import { useState, useEffect } from "react";
import {
  PageHeader,
  SearchBar,
  StatusBadge,
  EmptyState,
  Pagination,
} from "../../components/UI";
import {
  CalendarClock,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  Bell,
  MessageCircle,
  Users,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { api } from "../../lib/api";

const followUpStatusColors = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-[#0f4a29]/10 text-[#0f4a29] border-[#0f4a29]/20",
  Missed: "bg-rose-50 text-rose-700 border-rose-200",
};

const reminderStatusColors = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Sent: "bg-[#0f4a29]/10 text-[#0f4a29] border-[#0f4a29]/20",
  Failed: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function OPDFollowUps() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("followups");
  const [followUpsPage, setFollowUpsPage] = useState(1);
  const FOLLOWUPS_PER_PAGE = 10;

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { patients: data } = await api.get("/opd/patients/followups");
        setPatients(data);
      } catch (err) {
        setError(err.message || "Could not load follow-ups.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const withFollowUp = patients
    .filter(
      (p) =>
        p.followUpDate && p.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));

  const pendingFollowUps = withFollowUp.filter(
    (p) => p.followUpStatus === "Pending",
  );
  const pendingTotalPages =
    Math.ceil(pendingFollowUps.length / FOLLOWUPS_PER_PAGE) || 1;
  const safeFollowUpsPage = Math.min(followUpsPage, pendingTotalPages);
  const pendingPaginated = pendingFollowUps.slice(
    (safeFollowUpsPage - 1) * FOLLOWUPS_PER_PAGE,
    safeFollowUpsPage * FOLLOWUPS_PER_PAGE,
  );

  const next7 = new Date();
  next7.setDate(next7.getDate() + 7);
  const incomingPatients = patients
    .filter(
      (p) =>
        p.followUpDate &&
        p.followUpDate >= today &&
        new Date(p.followUpDate) <= next7,
    )
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));

  const pendingReminders = patients.filter(
    (p) =>
      p.reminderEnabled &&
      p.reminderStatus === "Pending" &&
      p.followUpDate >= today,
  );

  const updateFollowUpStatus = async (patientId, status) => {
    setSavingId(patientId);
    setError("");
    try {
      const current = patients.find((p) => p.id === patientId);
      const { patient: updated } = await api.put(`/opd/patients/${patientId}`, {
        ...current,
        followUpStatus: status,
      });
      setPatients((ps) => ps.map((p) => (p.id === patientId ? updated : p)));
    } catch (err) {
      setError(err.message || "Could not update status.");
    } finally {
      setSavingId(null);
    }
  };

  const markReminderSent = async (patientId) => {
    setSavingId(patientId);
    setError("");
    try {
      const current = patients.find((p) => p.id === patientId);
      const { patient: updated } = await api.put(`/opd/patients/${patientId}`, {
        ...current,
        reminderStatus: "Sent",
        reminderSentDate: today,
      });
      setPatients((ps) => ps.map((p) => (p.id === patientId ? updated : p)));
    } catch (err) {
      setError(err.message || "Could not mark reminder as sent.");
    } finally {
      setSavingId(null);
    }
  };

  const tabs = [
    {
      key: "followups",
      label: "Follow-Ups",
      icon: CalendarClock,
      count: pendingFollowUps.length,
    },
    {
      key: "incoming",
      label: "Incoming",
      icon: Users,
      count: incomingPatients.length,
    },
    {
      key: "reminders",
      label: "Reminders",
      icon: Bell,
      count: pendingReminders.length,
    },
  ];

  const Card = ({ p }) => {
    const isToday = p.followUpDate === today;
    const isPast = p.followUpDate < today;
    const isSaving = savingId === p.id;
    return (
      <div
        className={`bg-white dark:bg-slate-900 border rounded-[24px] p-5 flex gap-4 transition-all shadow-xs ${
          isToday
            ? "border-amber-300 bg-amber-50/20"
            : "border-slate-200/80 dark:border-slate-800"
        }`}
      >
        <div className="shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-[#0f4a29]/10 text-[#0f4a29] flex items-center justify-center font-extrabold text-sm">
            {p.name[0]}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs text-[#0f4a29] dark:text-[#52b788] font-extrabold">
              #{p.serialNumber}
            </span>
            <span className="text-slate-900 dark:text-white font-extrabold text-sm">
              {p.name}
            </span>
            <StatusBadge status={p.condition} />
            {isToday && (
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Today
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium mb-2">
            <span className="flex items-center gap-1">
              <CalendarClock className="w-3.5 h-3.5" />
              {p.followUpDate}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" />
              {p.phone}
            </span>
            {p.place && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {p.place}
              </span>
            )}
          </div>
          {p.followUpDesc && (
            <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-100 dark:border-slate-800 mb-2">
              {p.followUpDesc}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Status:
            </span>
            {["Pending", "Completed", "Missed"].map((s) => (
              <button
                key={s}
                disabled={isSaving}
                onClick={() => updateFollowUpStatus(p.id, s)}
                className={`px-3 py-1 rounded-full text-xs font-extrabold border transition-all ${
                  p.followUpStatus === s
                    ? followUpStatusColors[s]
                    : "bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Follow-Up Management"
        subtitle="Scheduled patient follow-ups, incoming visits, and automated WhatsApp reminders"
        action={
          <div className="flex gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full shadow-2xs">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                    active
                      ? "bg-[#0f4a29] text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                  {t.count > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-extrabold">
                      {t.count}
                    </span>
                  )}
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

      <SearchBar
        value={search}
        onChange={(s) => {
          setSearch(s);
          setFollowUpsPage(1);
        }}
        placeholder="Search patient follow-ups..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            follow-ups...
          </div>
        </div>
      ) : (
        <>
          {activeTab === "followups" && (
            <>
              {pendingFollowUps.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  message="No pending follow-ups"
                />
              ) : (
                <div className="space-y-4">
                  {pendingPaginated.map((p) => (
                    <Card key={p.id} p={p} />
                  ))}
                  <Pagination
                    current={safeFollowUpsPage}
                    total={pendingTotalPages}
                    onPageChange={setFollowUpsPage}
                  />
                </div>
              )}
            </>
          )}

          {activeTab === "incoming" && (
            <div className="space-y-3">
              {incomingPatients.map((p) => (
                <div
                  key={p.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-4 flex items-center justify-between shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] flex items-center justify-center font-extrabold text-xs">
                      {p.name[0]}
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {p.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        #{p.serialNumber} • Scheduled: {p.followUpDate}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={p.condition} />
                </div>
              ))}
            </div>
          )}

          {activeTab === "reminders" && (
            <div className="space-y-3">
              {pendingReminders.map((p) => (
                <div
                  key={p.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-4 flex items-center justify-between shadow-xs"
                >
                  <div>
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {p.phone} • {p.followUpDate}
                    </p>
                  </div>
                  {p.phone && (
                    <a
                      href={`https://wa.me/91${p.phone}?text=Dear ${encodeURIComponent(p.name)}, your follow-up is scheduled on ${p.followUpDate}.`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-extrabold bg-[#0f4a29] text-white shadow-xs"
                    >
                      <MessageCircle className="w-3 h-3" /> WhatsApp
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
