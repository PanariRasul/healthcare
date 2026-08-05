// client/src/pages/pharmacy/PharmacyExpiryAlerts.jsx
import { useState, useEffect } from "react";
import { PageHeader, SearchBar } from "../../components/UI";
import { PharmacyStatusBadge } from "./PharmacyDashboard";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { api } from "../../lib/api";

function getExpiryInfo(med) {
  const today = new Date();
  const expiry = new Date(med.expiryDate);
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { label: "Expired", diffDays, urgency: 4 };
  if (diffDays <= 30)
    return { label: "Expiring Within 30 Days", diffDays, urgency: 3 };
  if (diffDays <= 60)
    return { label: "Expiring Within 60 Days", diffDays, urgency: 2 };
  return { label: "Safe", diffDays, urgency: 1 };
}

export default function PharmacyExpiryAlerts() {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { medicines: data } = await api.get("/pharmacy/medicines");
        setMedicines(data);
      } catch (err) {
        setError(err.message || "Could not load expiry data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const alertMeds = medicines
    .map((m) => ({ ...m, ...getExpiryInfo(m) }))
    .filter((m) => m.urgency >= 2)
    .sort((a, b) => a.diffDays - b.diffDays);

  const filtered = alertMeds.filter(
    (m) =>
      m.drugName.toLowerCase().includes(search.toLowerCase()) ||
      m.batchNumber?.toLowerCase().includes(search.toLowerCase()),
  );

  const expired = filtered.filter((m) => m.diffDays <= 0);
  const within30 = filtered.filter((m) => m.diffDays > 0 && m.diffDays <= 30);
  const within60 = filtered.filter((m) => m.diffDays > 30 && m.diffDays <= 60);

  const Card = ({ med }) => {
    const isExpired = med.diffDays <= 0;
    const isUrgent = med.diffDays > 0 && med.diffDays <= 30;
    return (
      <div
        className={`bg-white dark:bg-slate-900 border rounded-[24px] p-4 flex flex-col sm:flex-row gap-4 shadow-xs transition-all ${
          isExpired
            ? "border-rose-200"
            : isUrgent
              ? "border-amber-200"
              : "border-slate-200/80 dark:border-slate-800"
        }`}
      >
        <div className="w-10 h-10 rounded-2xl bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] flex items-center justify-center font-extrabold text-sm shrink-0">
          {med.drugName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-slate-900 dark:text-white font-extrabold text-sm">
              {med.drugName}
            </span>
            <PharmacyStatusBadge
              status={isExpired ? "Expired" : "Expiring Soon"}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
            <span>
              Batch:{" "}
              <span className="font-mono font-bold text-slate-800 dark:text-white">
                {med.batchNumber}
              </span>
            </span>
            <span>Category: {med.category}</span>
            <span>
              Stock:{" "}
              <span className="font-bold text-slate-800 dark:text-white">
                {med.availableBoxes} Box, {med.availableSheets} Sheet,{" "}
                {med.availableTablets} Tablet
              </span>
            </span>
          </div>
        </div>
        <div className="text-left sm:text-right shrink-0">
          <div
            className={`text-xs font-extrabold ${isExpired ? "text-rose-500" : isUrgent ? "text-amber-600" : "text-[#0f4a29] dark:text-[#52b788]"}`}
          >
            {isExpired ? "Expired" : `${med.diffDays} days left`}
          </div>
          <div className="text-slate-400 text-[10px] font-medium mt-0.5">
            {med.expiryDate}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Expiry Alerts"
        subtitle="Medicines requiring urgent inventory clearance or re-ordering"
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs flex items-center gap-3">
          <XCircle className="w-6 h-6 text-rose-500 shrink-0" />
          <div>
            <div className="font-extrabold text-2xl text-rose-500">
              {expired.length}
            </div>
            <div className="text-slate-400 text-xs font-bold">Expired</div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
          <div>
            <div className="font-extrabold text-2xl text-amber-600">
              {within30.length}
            </div>
            <div className="text-slate-400 text-xs font-bold">
              Within 30 Days
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs flex items-center gap-3">
          <Clock className="w-6 h-6 text-[#0f4a29] dark:text-[#52b788] shrink-0" />
          <div>
            <div className="font-extrabold text-2xl text-[#0f4a29] dark:text-[#52b788]">
              {within60.length}
            </div>
            <div className="text-slate-400 text-xs font-bold">
              Within 60 Days
            </div>
          </div>
        </div>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search medicine or batch number..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            expiry alerts...
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <CheckCircle2
                className="w-10 h-10 text-[#0f4a29] dark:text-[#52b788]"
                strokeWidth={1.5}
              />
              <p className="text-slate-500 text-xs font-bold">
                All medicines are within safe expiry window
              </p>
            </div>
          )}

          {expired.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-rose-500 flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Expired Items ({expired.length})
              </h3>
              <div className="space-y-2">
                {expired.map((m) => (
                  <Card key={m.id} med={m} />
                ))}
              </div>
            </div>
          )}

          {within30.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Expiring Within 30 Days (
                {within30.length})
              </h3>
              <div className="space-y-2">
                {within30.map((m) => (
                  <Card key={m.id} med={m} />
                ))}
              </div>
            </div>
          )}

          {within60.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0f4a29] dark:text-[#52b788] flex items-center gap-2">
                <Clock className="w-4 h-4" /> Expiring Within 60 Days (
                {within60.length})
              </h3>
              <div className="space-y-2">
                {within60.map((m) => (
                  <Card key={m.id} med={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}