// client/src/pages/ipd/IPDPatientList.jsx
import { useEffect, useState } from "react";
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
import {
  fetchPatients,
  deletePatient as apiDeletePatient,
} from "./api/ipd.api";
import IPDPatientForm from "./IPDPatientForm";
import IPDPatientDetails from "./IPDPatientDetails";
import InvoiceModal from "../../components/InvoiceModal";
import { UserPlus, Search, Paperclip, FileText, Receipt } from "lucide-react";

const PER_PAGE = 7;
const LATEST_DOCS_SHOWN = 3;

const settlementColors = {
  Pending: "bg-rose-50 text-rose-700 border-rose-200",
  "Partially Paid": "bg-amber-50 text-amber-700 border-amber-200",
  "Fully Paid": "bg-[#0f4a29]/10 text-[#0f4a29] border-[#0f4a29]/20",
};

const dischargeStatusColors = {
  Admitted: "bg-blue-50 text-blue-700 border-blue-200",
  "Ready For Discharge": "bg-amber-50 text-amber-700 border-amber-200",
  Discharged: "bg-[#0f4a29]/10 text-[#0f4a29] border-[#0f4a29]/20",
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

function DocumentsCell({ documents = [] }) {
  const count = documents.length;

  if (count === 0) {
    return (
      <span className="text-xs text-slate-400 font-medium">No Documents</span>
    );
  }

  const latest = documents.slice(0, LATEST_DOCS_SHOWN);

  return (
    <div className="min-w-[140px]">
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200 mb-1">
        <Paperclip className="w-3 h-3" /> Docs ({count})
      </span>
      <div className="flex flex-col gap-0.5">
        {latest.map((doc) => (
          <a
            key={doc.id}
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#0f4a29] truncate max-w-[160px]"
            title={doc.name}
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">{doc.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function IPDPatientList({ readOnly = false }) {
  const [patients, setPatients] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [invoicing, setInvoicing] = useState(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    fetchPatients({ search, status: statusFilter, page, limit: PER_PAGE })
      .then(({ data, totalPages, total }) => {
        setPatients(data);
        setTotalPages(totalPages);
        setTotalCount(total);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, statusFilter, page]);

  const handleDelete = (id) => {
    apiDeletePatient(id)
      .then(() => {
        setDeleteId(null);
        load();
      })
      .catch((err) => {
        setError(err.message);
        setDeleteId(null);
      });
  };

  if (editing) {
    return (
      <IPDPatientForm
        editPatient={editing}
        onDone={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }
  if (viewing) {
    return (
      <IPDPatientDetails
        patient={viewing}
        onBack={() => {
          setViewing(null);
          load();
        }}
        readOnly={readOnly}
      />
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="IPD Patients Directory"
        subtitle={`Inpatient admissions and records (${totalCount} patients)`}
        action={
          !readOnly && (
            <button
              onClick={() => navigate("/ipd/admit")}
              className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
            >
              <UserPlus className="w-4 h-4" />
              <span>Admit Patient</span>
            </button>
          )
        }
      />

      {/* <div className="flex items-center gap-2 -mt-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-violet-500" />
          Purple = Patient moved from OPD
        </span>
      </div> */}

      <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between">
        <SearchBar
          value={search}
          onChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
          placeholder="Search patient or IPD no..."
        />
        <div className="flex gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-2xs">
          {["", "Admitted", "Discharged"].map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                statusFilter === s
                  ? "bg-[#0f4a29] text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {s || "All Status"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 font-bold">
          Loading patient directory...
        </div>
      ) : patients.length === 0 ? (
        <EmptyState icon={Search} message="No inpatient records found." />
      ) : (
        <TableCard>
          <thead>
            <tr>
              <Th>IPD No.</Th>
              <Th>Patient</Th>
              <Th>Admission</Th>
              <Th>Total Bill</Th>
              <Th>Paid</Th>
              <Th>Pending</Th>
              <Th>Discharge</Th>
              <Th>Documents</Th>
              {!readOnly && <Th>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr
                key={p.id}
                className={`border-t border-slate-100 dark:border-slate-800/60 ${
                  p.fromOPD
                    ? "bg-violet-50/60 dark:bg-violet-500/10 border-l-4 border-l-violet-400"
                    : ""
                }`}
              >
                <Td>
                  <span className="font-mono text-xs text-[#0f4a29] dark:text-[#52b788] font-extrabold">
                    #{p.serialNumber || "—"}
                  </span>
                </Td>
                <Td>
                  <button
                    onClick={() => setViewing(p)}
                    className="text-left font-extrabold text-slate-900 dark:text-white hover:underline"
                  >
                    {p.name}
                  </button>
                  {p.fromOPD && (
                    <span className="ml-2 inline-flex items-center text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                      From OPD
                    </span>
                  )}
                </Td>
                <Td>{fmtDate(p.admissionDate)}</Td>
                <Td className="font-bold">₹{p.totalStay?.toLocaleString()}</Td>
                <Td className="text-[#0f4a29] dark:text-[#52b788] font-bold">
                  ₹{p.totalPaid?.toLocaleString()}
                </Td>
                <Td>
                  {p.balance > 0 ? (
                    <span className="text-rose-500 font-extrabold">
                      ₹{p.balance?.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-[#0f4a29] font-bold text-xs">
                      Cleared
                    </span>
                  )}
                </Td>
                <Td>
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${dischargeStatusColors[p.dischargeStatus] || dischargeStatusColors["Admitted"]}`}
                  >
                    {p.dischargeStatus || "Admitted"}
                  </span>
                </Td>
                <Td>
                  <DocumentsCell documents={p.documents} />
                </Td>
                {!readOnly && (
                  <Td>
                    <div className="flex gap-1">
                      <ActionBtn type="view" onClick={() => setViewing(p)} />
                      <ActionBtn type="edit" onClick={() => setEditing(p)} />
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
                )}
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
          onCancel={() => setDeleteId(null)}
        />
      )}

      {invoicing && (
        <InvoiceModal
          type="IPD"
          patient={invoicing}
          onClose={() => setInvoicing(null)}
        />
      )}
    </div>
  );
}