// client/src/pages/ipd/IPDPaymentList.jsx
import { useEffect, useState, useCallback } from "react";
import {
  PageHeader,
  Pagination,
  TableCard,
  Th,
  Td,
  SearchBar,
} from "../../../components/UI";
import { fetchPaymentSummary } from "./api/ipdPayment.api";
import IPDPaymentModal from "./IPDPaymentModal";
import { IndianRupee, Wallet } from "lucide-react";

const STATUS_OPTIONS = ["", "Pending", "Partially Paid", "Fully Paid"];

const STATUS_STYLES = {
  "Fully Paid":
    "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20",
  "Partially Paid": "bg-amber-50 text-amber-700 border-amber-200",
  Pending: "bg-rose-50 text-rose-700 border-rose-200",
};

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const fmtMoney = (n) => `₹${(n || 0).toLocaleString("en-IN")}`;

const STATUS_ORDER = { Pending: 0, "Partially Paid": 1, "Fully Paid": 2 };
const sortByStatus = (list) =>
  [...list].sort((a, b) => {
    const oa = STATUS_ORDER[a.settlementStatus] ?? 99;
    const ob = STATUS_ORDER[b.settlementStatus] ?? 99;
    return oa - ob;
  });

const PER_PAGE = 12;

export default function IPDPaymentList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [activePatientId, setActivePatientId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPaymentSummary({ search, status });
      setRows(sortByStatus(data));
    } catch (err) {
      setError(err.message || "Failed to load payment summary");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const pagedRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleModalClosed = (didChange) => {
    setActivePatientId(null);
    if (didChange) load();
  };

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="IPD Payments Management"
        subtitle="Track balances, record payments, and view settlement histories across admitted patients"
      />

      {/* Search & Status Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name or IPD serial number..."
        />

        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full shadow-2xs overflow-x-auto max-w-full">
          {STATUS_OPTIONS.map((s) => {
            const active = status === s;
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all whitespace-nowrap ${
                  active
                    ? "bg-[#0f4a29] text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                {s || "All Statuses"}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Main Payment Directory Table */}
      <TableCard>
        <thead>
          <tr>
            <Th>IPD No.</Th>
            <Th>Patient Name</Th>
            <Th>Admission Date</Th>
            <Th className="text-right">Total Bill</Th>
            <Th className="text-right">Paid</Th>
            <Th className="text-right">Pending</Th>
            <Th>Status</Th>
            <Th className="text-right">Action</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={8}
                className="px-5 py-8 text-center text-xs font-bold text-slate-400"
              >
                Loading payment records...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="px-5 py-8 text-center text-xs font-bold text-slate-400"
              >
                No patients found matching your search.
              </td>
            </tr>
          ) : (
            pagedRows.map((p) => (
              <tr
                key={p.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                <Td className="font-mono text-xs font-bold text-[#0f4a29] dark:text-[#52b788]">
                  #{p.serialNumber}
                </Td>
                <Td className="font-extrabold text-slate-900 dark:text-white">
                  {p.name}
                </Td>
                <Td className="text-slate-500 font-medium">
                  {fmtDate(p.admissionDate)}
                </Td>
                <Td className="text-right font-bold">
                  {fmtMoney(p.totalStay)}
                </Td>
                <Td className="text-right text-[#0f4a29] dark:text-[#52b788] font-extrabold">
                  {fmtMoney(p.totalPaid)}
                </Td>
                <Td className="text-right font-extrabold text-rose-500">
                  {p.balance > 0 ? fmtMoney(p.balance) : "Cleared"}
                </Td>
                <Td>
                  <span
                    className={`inline-block text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                      STATUS_STYLES[p.settlementStatus] || ""
                    }`}
                  >
                    {p.settlementStatus}
                  </span>
                </Td>
                <Td className="text-right">
                  {p.balance > 0 ? (
                    <button
                      onClick={() => setActivePatientId(p.id)}
                      className="inline-flex items-center gap-1.5 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-4 py-1.5 rounded-full shadow-xs transition-all"
                    >
                      <IndianRupee className="w-3.5 h-3.5" /> Pay Now
                    </button>
                  ) : (
                    <button
                      onClick={() => setActivePatientId(p.id)}
                      className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-[#0f4a29] text-xs font-bold px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 transition-colors"
                    >
                      <Wallet className="w-3.5 h-3.5 text-[#0f4a29] dark:text-[#52b788]" />{" "}
                      History
                    </button>
                  )}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>

      {!loading && rows.length > 0 && (
        <Pagination current={page} total={totalPages} onPageChange={setPage} />
      )}

      {activePatientId && (
        <IPDPaymentModal
          patientId={activePatientId}
          onClose={handleModalClosed}
        />
      )}
    </div>
  );
}
