// client/src/pages/pharmacy/PharmacyMedicineList.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  PageHeader,
  SearchBar,
  TableCard,
  Th,
  Td,
  ActionBtn,
  DeleteModal,
  EmptyState,
  Pagination,
} from "../../components/UI";
import { PharmacyStatusBadge, getMedicineStatus } from "./PharmacyDashboard";
import PharmacyMedicineDetails from "./PharmacyMedicineDetails";
import PharmacyInvoiceModal from "../../components/PharmacyInvoiceModal";
import { Plus, Search, Loader2, Receipt } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const PER_PAGE = 8;
const STATUS_FILTERS = [
  "",
  "In Stock",
  "Low Stock",
  "Out of Stock",
  "Expiring Soon",
  "Expired",
];
const TYPE_FILTERS = [
  "",
  "Generic Medicine",
  "Ayurvedic Medicine",
  "Surgery Related Item",
];

export default function PharmacyMedicineList() {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [invoicing, setInvoicing] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  // Admin uses /admin/pharmacy/*, the Pharmacy role uses /pharmacy/*.
  const base = user?.role === "admin" ? "/admin/pharmacy" : "/pharmacy";

  const fetchMedicines = async () => {
    setLoading(true);
    setError("");
    try {
      const { medicines: data } = await api.get("/pharmacy/medicines");
      setMedicines(data);
    } catch (err) {
      setError(err.message || "Could not load medicines.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedicines();
  }, []);

  const filtered = medicines.filter((m) => {
    const matchName =
      m.drugName.toLowerCase().includes(search.toLowerCase()) ||
      m.genericName?.toLowerCase().includes(search.toLowerCase()) ||
      m.batchNumber?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || getMedicineStatus(m) === statusFilter;
    const matchType = !typeFilter || m.medicineType === typeFilter;
    return matchName && matchStatus && matchType;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await api.del(`/pharmacy/medicines/${id}`);
      setMedicines((ms) => ms.filter((m) => m.id !== id));
      setDeleteId(null);
    } catch (err) {
      setError(err.message || "Could not delete this medicine.");
    } finally {
      setDeleting(false);
    }
  };

  if (viewing) {
    return (
      <PharmacyMedicineDetails
        medicine={viewing}
        onBack={() => setViewing(null)}
        onUpdated={(updated) => {
          setMedicines((ms) =>
            ms.map((m) => (m.id === updated.id ? updated : m)),
          );
          setViewing(updated);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Medicine Inventory"
        subtitle={`Pharmacy inventory records (${filtered.length} drugs listed)`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInvoicing(true)}
              className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#0f4a29] text-slate-700 dark:text-slate-300 text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
            >
              <Receipt className="w-4 h-4" />
              <span>Create Invoice</span>
            </button>
            <button
              onClick={() => navigate(`${base}/add`)}
              className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Medicine</span>
            </button>
          </div>
        }
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <SearchBar
          value={search}
          onChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
          placeholder="Search drug, generic name, batch..."
        />
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full shadow-2xs overflow-x-auto max-w-full">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all whitespace-nowrap ${
                  active
                    ? "bg-[#0f4a29] text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {s || "All Status"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Type Filter Row */}
      <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-full shadow-2xs overflow-x-auto max-w-full w-fit">
        {TYPE_FILTERS.map((t) => {
          const active = typeFilter === t;
          return (
            <button
              key={t}
              onClick={() => {
                setTypeFilter(t);
                setPage(1);
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all whitespace-nowrap ${
                active
                  ? "bg-[#0f4a29] text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t || "All Types"}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs font-bold text-slate-400">
          Loading medicines...
        </div>
      ) : paginated.length === 0 ? (
        <EmptyState icon={Search} message="No medicines found in inventory." />
      ) : (
        <TableCard>
          <thead>
            <tr>
              <Th>Medicine</Th>
              <Th>Type</Th>
              <Th>Category</Th>
              <Th>Batch</Th>
              <Th>Purchase ₹</Th>
              <Th>Selling ₹</Th>
              <Th>Stock</Th>
              <Th>Expiry</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((m) => {
              const status = getMedicineStatus(m);
              return (
                <tr
                  key={m.id}
                  className="border-t border-slate-100 dark:border-slate-800/60"
                >
                  <Td>
                    <button
                      onClick={() => setViewing(m)}
                      className="font-extrabold text-slate-900 dark:text-white hover:underline text-left"
                    >
                      {m.drugName}
                    </button>
                  </Td>
                  <Td>
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {m.medicineType}
                    </span>
                  </Td>
                  <Td>{m.category}</Td>
                  <Td className="font-mono text-xs">{m.batchNumber}</Td>
                  <Td className="font-bold">₹{m.purchasePrice}</Td>
                  <Td className="text-[#0f4a29] dark:text-[#52b788] font-bold">
                    ₹{m.sellingPrice}
                    <div className="text-slate-400 dark:text-slate-500 font-medium text-[10px]">
                      ₹{(m.sellingPricePerTablet || 0).toFixed(2)}/tab
                    </div>
                  </Td>
                  <Td className="font-extrabold text-slate-900 dark:text-white">
                    {m.quantity}
                  </Td>
                  <Td>{m.expiryDate}</Td>
                  <Td>
                    <PharmacyStatusBadge status={status} />
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <ActionBtn type="view" onClick={() => setViewing(m)} />
                      <ActionBtn
                        type="edit"
                        onClick={() =>
                          navigate(`${base}/medicines/${m.id}/edit`)
                        }
                      />
                      <ActionBtn
                        type="delete"
                        onClick={() => setDeleteId(m.id)}
                      />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      <Pagination current={page} total={totalPages} onPageChange={setPage} />

      {deleteId && (
        <DeleteModal
          name={medicines.find((m) => m.id === deleteId)?.drugName}
          itemLabel="Medicine"
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => !deleting && setDeleteId(null)}
        />
      )}

      {invoicing && (
        <PharmacyInvoiceModal onClose={() => setInvoicing(false)} />
      )}
    </div>
  );
}
