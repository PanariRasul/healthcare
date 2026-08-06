// client/src/pages/pharmacy/PharmacyStockHistory.jsx
import { useState, useEffect } from "react";
import {
  PageHeader,
  SearchBar,
  TableCard,
  Th,
  Td,
  EmptyState,
} from "../../components/UI";
import {
  History,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { api } from "../../lib/api";

export default function PharmacyStockHistory() {
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
        setError(err.message || "Could not load stock history.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allHistory = medicines
    .flatMap((m) =>
      (m.stockHistory || []).map((h) => ({
        ...h,
        drugName: m.drugName,
        batchNumber: m.batchNumber,
        medicineId: m.id,
      })),
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = allHistory.filter(
    (h) =>
      h.drugName.toLowerCase().includes(search.toLowerCase()) ||
      h.reason.toLowerCase().includes(search.toLowerCase()) ||
      h.action.toLowerCase().includes(search.toLowerCase()),
  );

  const totalAdded = allHistory
    .filter((h) => h.quantity > 0)
    .reduce((s, h) => s + h.quantity, 0);
  const totalRemoved = Math.abs(
    allHistory
      .filter((h) => h.quantity < 0)
      .reduce((s, h) => s + h.quantity, 0),
  );

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Stock History"
        subtitle="Audit log of all stock adjustments, additions, and removals"
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            Total Transactions
          </p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            {allHistory.length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            Units Added
          </p>
          <p className="text-2xl font-extrabold text-[#0f4a29] dark:text-[#52b788] mt-1">
            +{totalAdded}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            Units Removed
          </p>
          <p className="text-2xl font-extrabold text-rose-500 mt-1">
            -{totalRemoved}
          </p>
        </div>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search medicine, action, or reason..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            stock history...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={History} message="No stock history records found." />
      ) : (
        <TableCard>
          <thead>
            <tr>
              {[
                "Date",
                "Medicine",
                "Batch",
                "Action",
                "Quantity",
                "Reason",
              ].map((h) => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((h, idx) => (
              <tr
                key={`${h.medicineId}-${h.id}-${idx}`}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                <Td className="text-slate-400 font-medium whitespace-nowrap">
                  {h.date}
                </Td>
                <Td className="font-extrabold text-slate-900 dark:text-white">
                  {h.drugName}
                </Td>
                <Td className="font-mono text-xs">{h.batchNumber}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {h.action === "Add Stock" ? (
                      <TrendingUp className="w-3 h-3 text-[#0f4a29] dark:text-[#52b788]" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-rose-500" />
                    )}
                    {h.action}
                  </span>
                </Td>
                <Td className="font-extrabold">
                  <span
                    className={
                      h.quantity > 0
                        ? "text-[#0f4a29] dark:text-[#52b788]"
                        : "text-rose-500"
                    }
                  >
                    {h.unit && h.enteredQuantity
                      ? `${h.quantity > 0 ? "+" : "-"}${h.enteredQuantity} ${h.unit}${
                          h.enteredQuantity === 1 ? "" : "s"
                        }`
                      : h.quantity > 0
                        ? `+${h.quantity}`
                        : h.quantity}
                  </span>
                </Td>
                <Td className="text-slate-500 font-medium max-w-[200px] truncate">
                  {h.reason}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}