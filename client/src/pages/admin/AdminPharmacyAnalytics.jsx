// client/src/pages/admin/AdminPharmacyAnalytics.jsx
import { useState, useEffect } from "react";
import { PageHeader, StatCard } from "../../components/UI";
import { api } from "../../lib/api";
import {
  Pill,
  Package,
  AlertTriangle,
  Boxes,
  Loader2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
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
        <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-xs font-bold">
          <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
          pharmacy analytics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
        <PageHeader
          title="Pharmacy Analytics"
          subtitle="Inventory overview across the pharmacy module"
        />
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      </div>
    );
  }

  const categoryCounts = medicines.reduce((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {});
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCategoryCount = topCategories[0]?.[1] || 1;

  const recentHistory = medicines
    .flatMap((m) =>
      (m.stockHistory || []).map((h) => ({
        ...h,
        drugName: m.drugName,
        batchNumber: m.batchNumber,
        medicineId: m.id,
      })),
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);

  const totalStockUnits = medicines.reduce((s, m) => s + m.quantity, 0);

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Pharmacy Analytics"
        subtitle="Inventory overview, stock movement, and valuation metrics"
      />

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Medicines"
          value={stats.totalMedicines}
          icon={Pill}
          color="green"
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

      {/* Financial Valuation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Purchase Value (Stock on Hand)",
            val: `₹${stats.totalPurchaseValue.toLocaleString()}`,
          },
          {
            label: "Selling Value (Stock on Hand)",
            val: `₹${stats.totalSellingValue.toLocaleString()}`,
          },
          {
            label: "Potential Profit",
            val: `₹${stats.potentialProfit.toLocaleString()}`,
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

      {/* Low Stock & Expiring Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
          <h3 className="text-amber-700 dark:text-amber-400 font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 mb-4">
            <Package className="w-4 h-4" /> Low Stock ({stats.lowStockCount})
          </h3>
          {stats.lowStockItems.length === 0 ? (
            <p className="text-slate-400 text-xs py-8 text-center font-medium">
              Nothing running low.
            </p>
          ) : (
            <div className="space-y-2.5">
              {stats.lowStockItems.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                >
                  <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                    {m.drugName[0]}
                  </div>
                  <span className="text-slate-800 dark:text-white font-bold truncate">
                    {m.drugName}
                  </span>
                  <span className="text-amber-600 font-extrabold text-[11px] ml-auto shrink-0">
                    {m.quantity} left
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
          <h3 className="text-rose-600 dark:text-rose-400 font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4" /> Expiring Soon (
            {stats.expiringSoonCount})
          </h3>
          {stats.expiringSoonItems.length === 0 ? (
            <p className="text-slate-400 text-xs py-8 text-center font-medium">
              Nothing expiring within 30 days.
            </p>
          ) : (
            <div className="space-y-2.5">
              {stats.expiringSoonItems.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                >
                  <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 flex items-center justify-center font-bold text-xs shrink-0">
                    {m.drugName[0]}
                  </div>
                  <span className="text-slate-800 dark:text-white font-bold truncate">
                    {m.drugName}
                  </span>
                  <span className="text-rose-500 font-extrabold text-[11px] ml-auto shrink-0">
                    {m.expiryDate}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Categories & Recent Stock Movement Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs">
          <h3 className="text-slate-900 dark:text-white font-extrabold text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
            <Boxes className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" /> Top
            Categories
          </h3>
          {topCategories.length === 0 ? (
            <p className="text-slate-400 text-xs py-8 text-center font-medium">
              No medicines yet.
            </p>
          ) : (
            <div className="space-y-3">
              {topCategories.map(([name, count]) => (
                <div key={name}>
                  <div className="flex justify-between text-xs mb-1 font-bold">
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

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 shadow-xs lg:col-span-2 overflow-hidden">
          <h3 className="text-slate-900 dark:text-white font-extrabold text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />{" "}
            Recent Stock Activity
          </h3>
          {recentHistory.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">
              No stock transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800/80">
                    {["Date", "Medicine", "Action", "Qty", "Reason"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left py-2.5 px-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.map((h, idx) => (
                    <tr
                      key={`${h.medicineId}-${h.id}-${idx}`}
                      className="border-t border-slate-100 dark:border-slate-800/60"
                    >
                      <td className="py-2.5 px-2 text-slate-400 font-medium whitespace-nowrap">
                        {h.date}
                      </td>
                      <td className="py-2.5 px-2 font-extrabold text-slate-800 dark:text-white truncate">
                        {h.drugName}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {h.action === "Add Stock" ? (
                            <TrendingUp className="w-3 h-3 text-[#0f4a29] dark:text-[#52b788]" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-rose-500" />
                          )}
                          {h.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-extrabold">
                        <span
                          className={
                            h.quantity > 0
                              ? "text-[#0f4a29] dark:text-[#52b788]"
                              : "text-rose-500"
                          }
                        >
                          {h.quantity > 0 ? `+${h.quantity}` : h.quantity}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-slate-400 font-medium truncate max-w-[180px]">
                        {h.reason || "—"}
                      </td>
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
