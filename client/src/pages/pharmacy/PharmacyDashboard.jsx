// client/src/pages/pharmacy/PharmacyDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { StatCard, PageHeader } from "../../components/UI";
import { api } from "../../lib/api";
import {
  Pill,
  Package,
  AlertTriangle,
  XCircle,
  Plus,
  TrendingUp,
  Clock,
  DollarSign,
  Boxes,
  Loader2,
} from "lucide-react";

const STATUS_STYLES = {
  "In Stock":
    "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20",
  "Low Stock":
    "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  "Out of Stock":
    "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20",
  "Expiring Soon":
    "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20",
  Expired:
    "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20",
};

export function PharmacyStatusBadge({ status }) {
  return (
    <span
      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLES[status] || STATUS_STYLES["In Stock"]}`}
    >
      {status}
    </span>
  );
}

export function getMedicineStatus(med) {
  const today = new Date();
  const expiry = new Date(med.expiryDate);
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (med.quantity === 0) return "Out of Stock";
  if (diffDays <= 0) return "Expired";
  if (diffDays <= 30) return "Expiring Soon";
  if (med.quantity <= med.reorderLevel) return "Low Stock";
  return "In Stock";
}

export default function PharmacyDashboard() {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { medicines: data } = await api.get("/pharmacy/medicines");
        setMedicines(data);
      } catch (err) {
        setError(err.message || "Could not load dashboard data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const withStatus = medicines.map((m) => ({
    ...m,
    status: getMedicineStatus(m),
  }));

  const totalMedicines = medicines.length;
  const inventoryValue = medicines.reduce(
    (s, m) => s + m.purchasePrice * m.quantity,
    0,
  );
  const lowStock = withStatus.filter((m) => m.status === "Low Stock");
  const outOfStock = withStatus.filter((m) => m.status === "Out of Stock");
  const expiringSoon = withStatus.filter((m) => m.status === "Expiring Soon");
  const expired = withStatus.filter((m) => m.status === "Expired");

  const recentMedicines = [...medicines].reverse().slice(0, 5);

  const categoryCounts = medicines.reduce((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {});
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCategoryCount = topCategories[0]?.[1] || 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
          pharmacy dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Pharmacy Dashboard"
        subtitle="Medicine inventory overview, stock alerts, and valuation summaries"
        action={
          <button
            onClick={() => navigate("/pharmacy/add")}
            className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Medicine</span>
          </button>
        }
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Medicines"
          value={totalMedicines}
          icon={Pill}
          color="green"
          sub={`${Object.keys(categoryCounts).length} categories`}
        />
        <StatCard
          label="Inventory Value"
          value={`₹${inventoryValue.toLocaleString()}`}
          icon={DollarSign}
          color="green"
          sub="At purchase price"
        />
        <StatCard
          label="Low / Out of Stock"
          value={lowStock.length + outOfStock.length}
          icon={Package}
          color="yellow"
          sub={`${outOfStock.length} out of stock`}
        />
        <StatCard
          label="Expiring / Expired"
          value={expiringSoon.length + expired.length}
          icon={AlertTriangle}
          color="red"
          sub={`${expired.length} already expired`}
        />
      </div>

      {/* Alert Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Low Stock */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <Package className="w-4 h-4" /> Low Stock
              </h3>
              <button
                onClick={() => navigate("/pharmacy/medicines")}
                className="text-[10px] font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
              >
                View All →
              </button>
            </div>
            {lowStock.length === 0 ? (
              <p className="text-slate-400 text-xs py-4 text-center font-medium">
                Nothing running low
              </p>
            ) : (
              <div className="space-y-2">
                {lowStock.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                  >
                    <span className="text-slate-800 dark:text-white font-extrabold truncate">
                      {m.drugName}
                    </span>
                    <span className="text-amber-600 font-extrabold text-[10px]">
                      {m.quantity} left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-2xl font-extrabold text-amber-600">
            {lowStock.length}
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Expiring Soon
              </h3>
              <button
                onClick={() => navigate("/pharmacy/expiry")}
                className="text-[10px] font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
              >
                View All →
              </button>
            </div>
            {expiringSoon.length === 0 ? (
              <p className="text-slate-400 text-xs py-4 text-center font-medium">
                Nothing expiring in 30 days
              </p>
            ) : (
              <div className="space-y-2">
                {expiringSoon.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                  >
                    <span className="text-slate-800 dark:text-white font-extrabold truncate">
                      {m.drugName}
                    </span>
                    <span className="text-indigo-600 font-extrabold text-[10px]">
                      {m.expiryDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-2xl font-extrabold text-indigo-600">
            {expiringSoon.length}
          </div>
        </div>

        {/* Expired */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Expired
              </h3>
              <button
                onClick={() => navigate("/pharmacy/expiry")}
                className="text-[10px] font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
              >
                View All →
              </button>
            </div>
            {expired.length === 0 ? (
              <p className="text-slate-400 text-xs py-4 text-center font-medium">
                No expired medicines
              </p>
            ) : (
              <div className="space-y-2">
                {expired.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                  >
                    <span className="text-slate-800 dark:text-white font-extrabold truncate">
                      {m.drugName}
                    </span>
                    <span className="text-rose-500 font-extrabold text-[10px]">
                      {m.expiryDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-2xl font-extrabold text-rose-600">
            {expired.length}
          </div>
        </div>
      </div>

      {/* Top Categories & Recently Added Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Boxes className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" /> Top
            Categories
          </h3>
          {topCategories.length === 0 ? (
            <p className="text-slate-400 text-xs py-8 text-center font-medium">
              No medicines yet
            </p>
          ) : (
            <div className="space-y-3">
              {topCategories.map(([name, count]) => (
                <div key={name}>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-slate-600 dark:text-slate-400 truncate">
                      {name}
                    </span>
                    <span className="text-slate-900 dark:text-white shrink-0 ml-2">
                      {count}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0f4a29] dark:bg-[#52b788] rounded-full transition-all duration-700"
                      style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
              Recently Added
            </h3>
            <button
              onClick={() => navigate("/pharmacy/medicines")}
              className="text-[10px] font-extrabold text-[#0f4a29] dark:text-[#52b788] hover:underline"
            >
              View All →
            </button>
          </div>
          {recentMedicines.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs font-medium">
              No medicines added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {recentMedicines.map((m) => {
                const status = getMedicineStatus(m);
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[#0f4a29]/10 text-[#0f4a29] flex items-center justify-center text-xs font-extrabold shrink-0">
                        {m.drugName[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-900 dark:text-white truncate">
                          {m.drugName}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {m.category} • Batch: {m.batchNumber}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        {m.quantity} units
                      </span>
                      <PharmacyStatusBadge status={status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
