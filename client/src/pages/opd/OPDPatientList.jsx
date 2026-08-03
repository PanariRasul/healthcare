// client/src/pages/opd/OPDPatientList.jsx
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
  StatusBadge,
} from "../../components/UI";
import OPDPatientDetails from "./OPDPatientDetails";
import InvoiceModal from "../../components/InvoiceModal";
import { UserPlus, SlidersHorizontal, X, Search, Receipt } from "lucide-react";
import { api } from "../../lib/api";

const PER_PAGE = 7;

const followUpStatusColors = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-[#0f4a29]/10 text-[#0f4a29] border-[#0f4a29]/20",
  Missed: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function OPDPatients({ isDoctor = false }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [invoicing, setInvoicing] = useState(null);
  const navigate = useNavigate();
  const basePath = isDoctor ? "/doctor/opd" : "/opd";

  const fetchPatients = async () => {
    setLoading(true);
    setError("");
    try {
      const { patients: data } = await api.get("/opd/patients");
      setPatients(data);
    } catch (err) {
      setError(err.message || "Could not load patients.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const filtered = patients.filter((p) => {
    const matchName =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.serialNumber || "").toLowerCase().includes(search.toLowerCase());
    const matchDate = !dateFilter || p.visitDate === dateFilter;
    return matchName && matchDate;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await api.del(`/opd/patients/${id}`);
      setPatients((ps) => ps.filter((p) => p.id !== id));
      setDeleteId(null);
    } catch (err) {
      setError(err.message || "Could not delete this patient.");
    } finally {
      setDeleting(false);
    }
  };

  if (viewing) {
    return (
      <OPDPatientDetails
        patient={viewing}
        onBack={() => setViewing(null)}
        onUpdated={(updated) => {
          setPatients((ps) =>
            ps.map((p) => (p.id === updated.id ? updated : p)),
          );
          setViewing(updated);
        }}
        isDoctor={isDoctor}
      />
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="OPD Patients Directory"
        subtitle={`Outpatient consultation records (${filtered.length} patients)`}
        action={
          <button
            onClick={() => navigate(`${basePath}/register`)}
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

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <SearchBar
          value={search}
          onChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
          placeholder="Search by name or token..."
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-4 py-2 text-xs font-extrabold text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-xs font-bold text-slate-500"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs font-bold text-slate-400">
          Loading patients...
        </div>
      ) : paginated.length === 0 ? (
        <EmptyState icon={Search} message="No OPD patients found." />
      ) : (
        <TableCard>
          <thead>
            <tr>
              <Th>Token</Th>
              <Th>Patient</Th>
              <Th>Age</Th>
              <Th>Phone</Th>
              <Th>Place</Th>
              <Th>Cash</Th>
              <Th>UPI</Th>
              <Th>Total</Th>
              <Th>Visit Date</Th>
              <Th>Follow-Up</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((p) => (
              <tr
                key={p.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                <Td>
                  <span className="font-mono text-xs text-[#0f4a29] dark:text-[#52b788] font-extrabold">
                    #{p.serialNumber || "—"}
                  </span>
                </Td>
                <Td>
                  <button
                    onClick={() => setViewing(p)}
                    className="font-extrabold text-slate-900 dark:text-white hover:underline"
                  >
                    {p.name}
                  </button>
                </Td>
                <Td>{p.age}y</Td>
                <Td>{p.phone}</Td>
                <Td>{p.place}</Td>
                <Td className="text-amber-600 font-bold">₹{p.cash || 0}</Td>
                <Td className="text-[#0f4a29] dark:text-[#52b788] font-bold">
                  ₹{p.upi || 0}
                </Td>
                <Td className="font-extrabold text-slate-900 dark:text-white">
                  ₹{p.total}
                </Td>
                <Td>{p.visitDate}</Td>
                <Td>
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${followUpStatusColors[p.followUpStatus] || followUpStatusColors["Pending"]}`}
                  >
                    {p.followUpStatus || "Pending"}
                  </span>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <ActionBtn type="view" onClick={() => setViewing(p)} />
                    <ActionBtn
                      type="edit"
                      onClick={() =>
                        navigate(`${basePath}/patients/${p.id}/edit`)
                      }
                    />
                    <ActionBtn
                      type="delete"
                      onClick={() => setDeleteId(p.id)}
                    />
                    <button
                      onClick={() => setInvoicing(p)}
                      title="Generate Invoice"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-[#0f4a29] hover:bg-[#0f4a29]/10 transition-colors"
                    >
                      <Receipt className="w-4 h-4" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      <Pagination current={page} total={totalPages} onPageChange={setPage} />

      {deleteId && (
        <DeleteModal
          name={patients.find((p) => p.id === deleteId)?.name}
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => !deleting && setDeleteId(null)}
        />
      )}

      {invoicing && (
        <InvoiceModal
          type="OPD"
          patient={invoicing}
          onClose={() => setInvoicing(null)}
        />
      )}
    </div>
  );
}