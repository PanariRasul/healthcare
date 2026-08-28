// client/src/pages/ipd/IPDDischargeList.jsx
//
// Dedicated "Discharged Patients" directory. Shows every patient whose
// discharge has been finalized (status === "Discharged" — set via the
// Discharge quick action, see DischargeModal.jsx / dischargePatient() in
// ipd.controller.js), plus a small stats strip (Active / Discharged /
// Total) so the counts the dashboard shows are visible right here too.
import { useEffect, useState } from "react";
import {
    PageHeader,
    SearchBar,
    StatCard,
    TableCard,
    Th,
    Td,
    ActionBtn,
    EmptyState,
    Pagination,
} from "../../components/UI";
import { fetchPatients, fetchIpdStats } from "./api/ipd.api";
import IPDPatientForm from "./IPDPatientForm";
import IPDPatientDetails from "./IPDPatientDetails";
import InvoiceModal from "../../components/InvoiceModal";
import DischargeModal from "./DischargeModal";
import PageSizeSelect, { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
import {
    Search,
    Paperclip,
    FileText,
    Receipt,
    Undo2,
    Users,
    DoorOpen,
} from "lucide-react";

const LATEST_DOCS_SHOWN = 3;

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";
const fmtMoney = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;

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

export default function IPDDischargeList({ readOnly = false }) {
    const [patients, setPatients] = useState([]);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [stats, setStats] = useState(null);
    const [statsError, setStatsError] = useState("");

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(DEFAULT_PAGE_SIZE);
    const [editing, setEditing] = useState(null);
    const [viewing, setViewing] = useState(null);
    const [invoicing, setInvoicing] = useState(null);
    const [discharging, setDischarging] = useState(null);

    const load = () => {
        setLoading(true);
        // status is hard-locked to "Discharged" — this page IS the discharged
        // directory, so there's no status filter to show the user.
        fetchPatients({ search, status: "Discharged", page, limit: perPage })
            .then(({ data, totalPages, total }) => {
                setPatients(data);
                setTotalPages(totalPages);
                setTotalCount(total);
                setError("");
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    const loadStats = () => {
        fetchIpdStats()
            .then((data) => {
                setStats(data);
                setStatsError("");
            })
            .catch((err) => setStatsError(err.message));
    };

    useEffect(() => {
        const t = setTimeout(load, 250);
        return () => clearTimeout(t);
    }, [search, page, perPage]);

    useEffect(() => {
        loadStats();
    }, []);

    const handleDischargeModalClosed = (didChange) => {
        setDischarging(null);
        if (didChange) {
            load();
            loadStats();
        }
    };

    if (editing) {
        return (
            <IPDPatientForm
                editPatient={editing}
                onDone={() => {
                    setEditing(null);
                    load();
                    loadStats();
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
                onEdit={(p) => {
                    setViewing(null);
                    setEditing(p);
                }}
                readOnly={readOnly}
            />
        );
    }

    return (
        <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
            <PageHeader
                title="Discharged Patients"
                subtitle={`Finalized discharges and their complete admission records (${totalCount} discharged)`}
            />

            {/* Mini stats strip — just the counts relevant to this page.
          Active patients aren't shown here since this page is
          specifically the discharged directory. */}
            {statsError ? (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
                    Failed to load summary counts: {statsError}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <StatCard
                        label="Discharged Patients"
                        value={stats ? stats.dischargedCount : "—"}
                        icon={DoorOpen}
                        color="green"
                        sub="Finalized discharges"
                    />
                    <StatCard
                        label="Total Patients"
                        value={stats ? stats.totalAdmittedEver : "—"}
                        icon={Users}
                        color="green"
                        sub="Ever admitted"
                    />
                </div>
            )}

            <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between">
                <SearchBar
                    value={search}
                    onChange={(s) => {
                        setSearch(s);
                        setPage(1);
                    }}
                    placeholder="Search discharged patient or IPD no..."
                />
                <PageSizeSelect
                    value={perPage}
                    onChange={(n) => {
                        setPerPage(n);
                        setPage(1);
                    }}
                />
            </div>

            {error && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="p-12 text-center text-xs text-slate-400 font-bold">
                    Loading discharged patients...
                </div>
            ) : patients.length === 0 ? (
                <EmptyState
                    icon={Search}
                    message={
                        search
                            ? "No discharged patients match your search."
                            : "No patients have been discharged yet."
                    }
                />
            ) : (
                <TableCard>
                    <thead>
                        <tr>
                            <Th>IPD No.</Th>
                            <Th>Patient</Th>
                            <Th>Admission</Th>
                            <Th>Discharge</Th>
                            <Th>Total Bill</Th>
                            <Th>Paid</Th>
                            <Th>Pending</Th>
                            <Th>Documents</Th>
                            {!readOnly && <Th>Actions</Th>}
                        </tr>
                    </thead>
                    <tbody>
                        {patients.map((p) => (
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
                                        className="text-left font-extrabold text-slate-900 dark:text-white hover:underline"
                                    >
                                        {p.name}
                                    </button>
                                </Td>
                                <Td>{fmtDate(p.admissionDate)}</Td>
                                <Td>
                                    <div className="text-slate-900 dark:text-white font-bold">
                                        {fmtDate(p.dischargeDate)}
                                    </div>
                                    {p.dischargeTime && (
                                        <div className="text-[10px] text-slate-400 font-medium">
                                            {p.dischargeTime}
                                        </div>
                                    )}
                                </Td>
                                <Td className="font-bold">{fmtMoney(p.totalStay)}</Td>
                                <Td className="text-[#0f4a29] dark:text-[#52b788] font-bold">
                                    {fmtMoney(p.totalPaid)}
                                </Td>
                                <Td>
                                    {p.balance > 0 ? (
                                        <span className="text-rose-500 font-extrabold">
                                            {fmtMoney(p.balance)}
                                        </span>
                                    ) : p.balance < 0 ? (
                                        <span className="text-[#0f4a29] dark:text-[#52b788] font-extrabold">
                                            +{fmtMoney(Math.abs(p.balance))} credit
                                        </span>
                                    ) : (
                                        <span className="text-[#0f4a29] font-bold text-xs">
                                            Cleared
                                        </span>
                                    )}
                                </Td>
                                <Td>
                                    <DocumentsCell documents={p.documents} />
                                </Td>
                                {!readOnly && (
                                    <Td>
                                        <div className="flex gap-1">
                                            <ActionBtn type="view" onClick={() => setViewing(p)} />
                                            <ActionBtn type="edit" onClick={() => setEditing(p)} />
                                            <button
                                                onClick={() => setInvoicing(p)}
                                                title="Generate Invoice"
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-[#0f4a29] hover:bg-[#0f4a29]/10 transition-colors"
                                            >
                                                <Receipt className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setDischarging(p)}
                                                title="Undo Discharge"
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-[#0f4a29] hover:bg-[#0f4a29]/10 transition-colors"
                                            >
                                                <Undo2 className="w-4 h-4" />
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

            {invoicing && (
                <InvoiceModal
                    type="IPD"
                    patient={invoicing}
                    onClose={() => setInvoicing(null)}
                />
            )}

            {discharging && (
                <DischargeModal
                    patient={discharging}
                    onClose={handleDischargeModalClosed}
                />
            )}
        </div>
    );
}