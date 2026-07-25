// client/src/pages/admin/AdminPharmacyAnalytics.jsx
// Read-only pharmacy analytics for Admin. Deliberately does NOT reuse
// PharmacyMedicineList/Form — those routes are gated to role="pharmacy" and
// admin has no reason to edit stock directly; this page is overview-only.
import { useState, useEffect } from "react";
import { PageHeader, StatCard } from "../../components/UI";
import { PharmacyStatusBadge, getMedicineStatus } from "../pharmacy/PharmacyDashboard";
import { api } from "../../lib/api";
import {
  Pill, Package, AlertTriangle, XCircle, TrendingUp, TrendingDown,
  Clock, DollarSign, Boxes, RefreshCw, Loader2,
} from "lucide-react";

export default function AdminPharmacyAnalytics() {
  const [stats, setStats] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [statsRes, medsRes] = await Promise.all([
          api.get("/pharmacy/medicines/stats"),
          api.get("/pharmacy/medicines"),
        ]);
        setStats(statsRes);
        setMedicines(medsRes.medicines);
      } catch (err) {
        setError(err.message || "Could not load pharmacy analytics.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading pharmacy analytics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-2 sm:px-4 max-w-7xl mx-auto">
        <PageHeader title="Pharmacy Analytics" subtitle="Inventory overview across the pharmacy module" />
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-400 text-sm font-medium">
          {error}
        </div>
      </div>
    );
  }

  // Category breakdown (top 6 by medicine count) — computed client-side from
  // the full medicine list since /stats doesn't return a per-category split.
  const categoryCounts = medicines.reduce((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {});
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCategoryCount = topCategories[0]?.[1] || 1;

  // Recent stock transactions across ALL medicines, most-recent-first —
  // same flatten pattern as PharmacyStockHistory.jsx, just capped to 8 rows.
  const recentHistory = medicines
    .flatMap(m => (m.stockHistory || []).map(h => ({ ...h, drugName: m.drugName, batchNumber: m.batchNumber, medicineId: m.id })))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);

  const totalStockUnits = medicines.reduce((s, m) => s + m.quantity, 0);

  return (
    <div className="w-full px-2 sm:px-4 max-w-7xl mx-auto">
      <PageHeader title="Pharmacy Analytics" subtitle="Inventory overview across the pharmacy module" />

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard
          label="Total Medicines"
          value={stats.totalMedicines}
          icon={Pill}
          color="teal"
          sub={`${stats.totalCategories} categories`}
        />
        <StatCard
          label="Units In Stock"
          value={totalStockUnits.toLocaleString()}
          icon={Boxes}
          color="green"
          sub="Across all batches"
        />
        <StatCard
          label="Low / Out of Stock"
          value={stats.lowStockCount + stats.outOfStockCount}
          icon={Package}
          color="yellow"
          sub={`${stats.outOfStockCount} out of stock`}
        />
        <StatCard
          label="Expiring / Expired"
          value={stats.expiringSoonCount + stats.expiredCount}
          icon={AlertTriangle}
          color="red"
          sub={`${stats.expiredCount} already expired`}
        />
      </div>

      {/* Financials */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: "Purchase Value (Stock on Hand)", val: `₹${stats.totalPurchaseValue.toLocaleString()}`, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20" },
          { label: "Selling Value (Stock on Hand)",  val: `₹${stats.totalSellingValue.toLocaleString()}`,  color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" },
          { label: "Potential Profit",               val: `₹${stats.potentialProfit.toLocaleString()}`,   color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20" },
        ].map(item => (
          <div key={item.label} className={`${item.bg} border rounded-2xl p-4 text-center shadow-sm dark:shadow-none`}>
            <div className={`font-bold text-xl ${item.color}`}>{item.val}</div>
            <div className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Alerts row: Low Stock + Expiring Soon (top 5 each, from /stats) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-amber-50/50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4 sm:p-5">
          <h3 className="text-amber-800 dark:text-amber-400 font-semibold text-sm flex items-center gap-2 mb-3">
            <Package className="w-4 h-4" /> Low Stock <span className="text-slate-400 dark:text-slate-500 font-normal">({stats.lowStockCount})</span>
          </h3>
          {stats.lowStockItems.length === 0 ? (
            <p className="text-amber-600/70 dark:text-amber-400/50 text-xs">Nothing running low</p>
          ) : (
            <div className="space-y-2">
              {stats.lowStockItems.map(m => (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                    {m.drugName[0]}
                  </div>
                  <span className="text-slate-700 dark:text-slate-300 font-medium truncate">{m.drugName}</span>
                  <span className="text-amber-600 dark:text-amber-400 ml-auto flex-shrink-0">
                    {m.quantity} left (reorder at {m.reorderLevel})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-violet-50/50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-2xl p-4 sm:p-5">
          <h3 className="text-violet-800 dark:text-violet-400 font-semibold text-sm flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" /> Expiring Soon <span className="text-slate-400 dark:text-slate-500 font-normal">({stats.expiringSoonCount})</span>
          </h3>
          {stats.expiringSoonItems.length === 0 ? (
            <p className="text-violet-600/70 dark:text-violet-400/50 text-xs">Nothing expiring within 30 days</p>
          ) : (
            <div className="space-y-2">
              {stats.expiringSoonItems.map(m => (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                    {m.drugName[0]}
                  </div>
                  <span className="text-slate-700 dark:text-slate-300 font-medium truncate">{m.drugName}</span>
                  <span className="text-violet-500 dark:text-violet-400 ml-auto flex-shrink-0">{m.expiryDate}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category breakdown + Recent stock activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none">
          <h3 className="text-slate-800 dark:text-white font-semibold text-sm mb-4 flex items-center gap-2">
            <Boxes className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Top Categories
          </h3>
          {topCategories.length === 0 ? (
            <p className="text-slate-400 dark:text-slate-500 text-xs">No medicines yet</p>
          ) : (
            <div className="space-y-3">
              {topCategories.map(([name, count]) => (
                <div key={name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500 dark:text-slate-400 truncate">{name}</span>
                    <span className="text-slate-800 dark:text-white font-medium flex-shrink-0 ml-2">{count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-400 rounded-full transition-all duration-700"
                      style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-slate-800 dark:text-white font-semibold text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400 dark:text-slate-500" /> Recent Stock Activity
            </h3>
          </div>
          {recentHistory.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400 dark:text-slate-500 text-sm">No stock transactions yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50">
                    {["Date", "Medicine", "Action", "Qty", "Reason"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.map((h, idx) => (
                    <tr key={`${h.medicineId}-${h.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-t border-slate-100 dark:border-slate-800/50">
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{h.date}</td>
                      <td className="px-5 py-3 text-slate-800 dark:text-white font-medium truncate">{h.drugName}</td>
                      <td className="px-5 py-3">
                        <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border w-fit whitespace-nowrap ${
                          h.action === "Add Stock"
                            ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                            : h.action === "Reduce Stock"
                            ? "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
                            : "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20"
                        }`}>
                          {h.action === "Add Stock" ? <TrendingUp className="w-3 h-3" /> : h.action === "Reduce Stock" ? <TrendingDown className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                          {h.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className={`font-bold ${h.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                          {h.quantity > 0 ? `+${h.quantity}` : h.quantity}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{h.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}