// client/src/pages/pharmacy/PharmacyBilling.jsx
//
// Pharmacy Billing — lists every invoice generated through the Pharmacy
// billing flow (patientType: "PHARMACY"), with a "Create Invoice" action
// that opens PharmacyInvoiceModal, and a "View" action on each row that
// reopens that same modal preloaded onto the existing invoice (see the
// `invoiceToEdit` prop on PharmacyInvoiceModal).
//
// Reachable from the sidebar in OPD, IPD, Admin's Pharmacy group, and
// Pharmacy's own menu (see App.jsx / Sidebar.jsx).
import { useState, useEffect } from "react";
import {
  PageHeader,
  SearchBar,
  TableCard,
  Th,
  Td,
  EmptyState,
  Pagination,
} from "../../components/UI";
import PharmacyInvoiceModal from "../../components/PharmacyInvoiceModal";
import { fetchInvoicesByType } from "../../api/invoice.api";
import {
  Receipt,
  Search,
  Loader2,
  Eye,
  IndianRupee,
  Wallet,
} from "lucide-react";

const PER_PAGE = 10;

const fmtINR = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function SummaryCard({ icon: Icon, label, value, valueClass }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[24px] p-5 shadow-xs flex items-center gap-3">
      <Icon className="w-6 h-6 text-[#0f4a29] dark:text-[#52b788] shrink-0" />
      <div>
        <div
          className={`font-extrabold text-2xl ${valueClass || "text-slate-900 dark:text-white"}`}
        >
          {value}
        </div>
        <div className="text-slate-400 text-xs font-bold">{label}</div>
      </div>
    </div>
  );
}

export default function PharmacyBilling() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchInvoicesByType("PHARMACY");
      setInvoices(data);
    } catch (err) {
      setError(err.message || "Could not load pharmacy invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = invoices.filter(
    (inv) =>
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.patientName.toLowerCase().includes(search.toLowerCase()),
  );

  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (safePage - 1) * PER_PAGE,
    safePage * PER_PAGE,
  );

  const totalCollected = invoices.reduce((s, i) => s + (i.paid || 0), 0);
  const totalOutstanding = invoices.reduce((s, i) => s + (i.balance || 0), 0);

  const closeCreating = () => {
    setCreating(false);
    load();
  };
  const closeViewing = () => {
    setViewingInvoice(null);
    load();
  };

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Pharmacy Billing"
        subtitle={`All pharmacy invoices (${filtered.length})`}
        action={
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
          >
            <Receipt className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>
        }
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={Receipt}
          label="Total Invoices"
          value={invoices.length}
        />
        <SummaryCard
          icon={IndianRupee}
          label="Total Collected"
          value={fmtINR(totalCollected)}
          valueClass="text-[#0f4a29] dark:text-[#52b788]"
        />
        <SummaryCard
          icon={Wallet}
          label="Outstanding Balance"
          value={fmtINR(totalOutstanding)}
          valueClass={totalOutstanding > 0 ? "text-rose-500" : undefined}
        />
      </div>

      <SearchBar
        value={search}
        onChange={(s) => {
          setSearch(s);
          setPage(1);
        }}
        placeholder="Search invoice number or patient name..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            pharmacy invoices...
          </div>
        </div>
      ) : paginated.length === 0 ? (
        <EmptyState
          icon={Search}
          message="No pharmacy invoices yet. Create the first one above."
        />
      ) : (
        <TableCard>
          <thead>
            <tr>
              <Th>Invoice No.</Th>
              <Th>Date</Th>
              <Th>Patient</Th>
              <Th>Total</Th>
              <Th>Paid</Th>
              <Th>Balance</Th>
              <Th>Payment</Th>
              <Th>Generated By</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((inv) => (
              <tr
                key={inv.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                <Td className="font-mono text-xs font-extrabold text-[#0f4a29] dark:text-[#52b788]">
                  {inv.invoiceNumber}
                </Td>
                <Td className="text-slate-400 font-medium whitespace-nowrap">
                  {fmtDateTime(inv.createdAt)}
                </Td>
                <Td className="font-extrabold text-slate-900 dark:text-white">
                  {inv.patientName}
                </Td>
                <Td className="font-extrabold text-slate-900 dark:text-white">
                  {fmtINR(inv.grandTotal)}
                </Td>
                <Td className="text-[#0f4a29] dark:text-[#52b788] font-bold">
                  {fmtINR(inv.paid)}
                </Td>
                <Td
                  className={
                    inv.balance > 0
                      ? "text-rose-500 font-extrabold"
                      : "text-slate-400 font-medium"
                  }
                >
                  {fmtINR(inv.balance)}
                </Td>
                <Td>{inv.paymentMethod || "—"}</Td>
                <Td className="text-slate-500 font-medium">
                  {inv.createdByName || "—"}
                </Td>
                <Td>
                  <button
                    onClick={() => setViewingInvoice(inv)}
                    title="View / Edit Invoice"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-[#0f4a29] hover:bg-[#0f4a29]/10 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      <Pagination
        current={safePage}
        total={totalPages}
        onPageChange={setPage}
      />

      {creating && <PharmacyInvoiceModal onClose={closeCreating} />}
      {viewingInvoice && (
        <PharmacyInvoiceModal
          invoiceToEdit={viewingInvoice}
          onClose={closeViewing}
        />
      )}
    </div>
  );
}
