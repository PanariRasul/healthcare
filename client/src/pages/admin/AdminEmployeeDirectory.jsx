// client/src/pages/admin/AdminEmployeeDirectory.jsx
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import {
  PageHeader,
  DeleteModal,
  SearchBar,
  TableCard,
  Th,
  Td,
  FormInput,
  FormSelect,
  SectionCard,
} from "../../components/UI";
import {
  UserPlus,
  Loader2,
  Pencil,
  Trash2,
  X,
  Check,
  Building2,
  Wallet,
  Sun,
  Moon,
  CalendarClock,
  Plus,
} from "lucide-react";

const emptyForm = {
  fullName: "",
  designation: "",
  phone: "",
  email: "",
  joiningDate: "",
  notes: "",
  salary: "",
  bankName: "",
  ifscCode: "",
  bankAccountNo: "",
  shiftId: "",
};

const SHIFT_TYPE_META = {
  DAY: {
    label: "Day",
    icon: Sun,
    className:
      "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  },
  NIGHT: {
    label: "Night",
    icon: Moon,
    className:
      "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20",
  },
  GENERAL: {
    label: "General",
    icon: CalendarClock,
    className:
      "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  },
};

function ShiftBadge({ shift }) {
  if (!shift)
    return (
      <span className="text-slate-400 dark:text-slate-600 text-xs font-medium">
        Unassigned
      </span>
    );
  const meta = SHIFT_TYPE_META[shift.type] || SHIFT_TYPE_META.GENERAL;
  const Icon = meta.icon;
  return (
    <div>
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${meta.className}`}
      >
        <Icon className="w-3 h-3" /> {meta.label}
      </span>
      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
        {shift.name}
      </div>
    </div>
  );
}

function formatSalary(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return `₹${num.toLocaleString("en-IN")}`;
}

export default function AdminEmployeeDirectory() {
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchEmployees = async () => {
    setLoading(true);
    setError("");
    try {
      const { employees: data } = await api.get("/admin/employees");
      setEmployees(data);
    } catch (err) {
      setError(err.message || "Could not load employee directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/biometric/shifts?status=active&limit=100");
        setShifts(data.shifts);
      } catch {
        // convenience for dropdown
      }
    })();
  }, []);

  const filtered = employees.filter(
    (e) =>
      e.fullName.toLowerCase().includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (
      !createForm.fullName ||
      !createForm.designation ||
      !createForm.joiningDate
    ) {
      return setError("Full name, designation, and joining date are required.");
    }
    setSaving(true);
    try {
      await api.post("/admin/employees", createForm);
      setInfo(`${createForm.fullName} added to the directory.`);
      setCreateForm(emptyForm);
      setShowCreate(false);
      fetchEmployees();
    } catch (err) {
      setError(err.message || "Could not add employee.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (emp) => {
    setEditingId(emp.id);
    setEditForm({
      fullName: emp.fullName,
      designation: emp.designation,
      phone: emp.phone || "",
      email: emp.email || "",
      joiningDate: emp.joiningDate ? emp.joiningDate.split("T")[0] : "",
      notes: emp.notes || "",
      salary: emp.salary ?? "",
      bankName: emp.bankName || "",
      ifscCode: emp.ifscCode || "",
      bankAccountNo: emp.bankAccountNo || "",
      shiftId: emp.shiftId || "",
    });
  };

  const saveEdit = async (id) => {
    setError("");
    setInfo("");
    setSaving(true);
    try {
      await api.put(`/admin/employees/${id}`, editForm);
      setInfo("Employee updated.");
      setEditingId(null);
      fetchEmployees();
    } catch (err) {
      setError(err.message || "Could not update employee.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (emp) => {
    setError("");
    setInfo("");
    try {
      await api.put(`/admin/employees/${emp.id}`, { isActive: !emp.isActive });
      fetchEmployees();
    } catch (err) {
      setError(err.message || "Could not update status.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setError("");
    setInfo("");
    try {
      await api.del(`/admin/employees/${deleteTarget.id}`);
      setInfo(`${deleteTarget.fullName} removed.`);
      setDeleteTarget(null);
      fetchEmployees();
    } catch (err) {
      setError(err.message || "Could not remove employee.");
    }
  };

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      {/* Compact Page Header */}
      <PageHeader
        title="Employee Directory"
        subtitle={`Directory information for staff (${employees.length} recorded)`}
        action={
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0f4a29] hover:bg-[#165a34] text-white rounded-full text-xs font-extrabold transition-all shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            {showCreate ? "Close Form" : "Add Employee"}
          </button>
        }
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-[#0f4a29]/10 dark:bg-[#52b788]/20 border border-[#0f4a29]/20 text-[#0f4a29] dark:text-[#52b788] rounded-2xl px-4 py-3 text-xs font-bold">
          {info}
        </div>
      )}

      {/* Add Employee Form Section */}
      {showCreate && (
        <SectionCard title="Add New Directory Record" icon={UserPlus}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Full Name"
                value={createForm.fullName}
                onChange={(v) => setCreateForm((f) => ({ ...f, fullName: v }))}
                placeholder="Full Name"
                required
              />
              <Field
                label="Designation"
                value={createForm.designation}
                onChange={(v) =>
                  setCreateForm((f) => ({ ...f, designation: v }))
                }
                placeholder="Nurse, Ward Boy, Cleaner..."
                required
              />
              <Field
                label="Phone"
                value={createForm.phone}
                onChange={(v) => setCreateForm((f) => ({ ...f, phone: v }))}
                placeholder="Phone Number"
              />
              <Field
                label="Email"
                type="email"
                value={createForm.email}
                onChange={(v) => setCreateForm((f) => ({ ...f, email: v }))}
                placeholder="Email"
              />
              <Field
                label="Joining Date"
                type="date"
                value={createForm.joiningDate}
                onChange={(v) =>
                  setCreateForm((f) => ({ ...f, joiningDate: v }))
                }
                required
              />
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                  Shift Assignment
                </label>
                <select
                  value={createForm.shiftId}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, shiftId: e.target.value }))
                  }
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                >
                  <option value="">Unassigned</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (
                      {s.type === "DAY"
                        ? "Day Shift"
                        : s.type === "NIGHT"
                          ? "Night Shift"
                          : "General Shift"}
                      )
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                Notes (Optional)
              </label>
              <textarea
                value={createForm.notes}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29] resize-none"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-3.5 h-3.5 text-[#0f4a29] dark:text-[#52b788]" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Salary Details (Optional)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Salary (₹)"
                  type="number"
                  value={createForm.salary}
                  onChange={(v) => setCreateForm((f) => ({ ...f, salary: v }))}
                  placeholder="e.g. 25000"
                />
                <Field
                  label="Bank Name"
                  value={createForm.bankName}
                  onChange={(v) =>
                    setCreateForm((f) => ({ ...f, bankName: v }))
                  }
                  placeholder="Bank Name"
                />
                <Field
                  label="IFSC Code"
                  value={createForm.ifscCode}
                  onChange={(v) =>
                    setCreateForm((f) => ({ ...f, ifscCode: v.toUpperCase() }))
                  }
                  placeholder="e.g. SBIN0001234"
                />
                <Field
                  label="Bank Account No."
                  value={createForm.bankAccountNo}
                  onChange={(v) =>
                    setCreateForm((f) => ({ ...f, bankAccountNo: v }))
                  }
                  placeholder="Bank Account No"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-xs font-bold text-slate-500 dark:text-slate-400 px-4 py-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full disabled:opacity-50 transition-all shadow-xs"
              >
                {saving ? "Adding..." : "Add Employee"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {/* Search Bar Container */}
      <div className="flex items-center justify-between gap-4">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name or designation..."
        />
      </div>

      {/* Main Directory Table Card */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" />
            Loading directory...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-10 text-center text-slate-400 dark:text-slate-500 text-xs font-bold">
          No employees found.
        </div>
      ) : (
        <TableCard>
          <thead>
            <tr>
              {[
                "Name",
                "Designation",
                "Shift",
                "Contact",
                "Joined",
                "Salary",
                "Status",
                "Actions",
              ].map((h) => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp) => (
              <tr
                key={emp.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                {editingId === emp.id ? (
                  <td
                    colSpan={8}
                    className="p-5 bg-slate-50/50 dark:bg-slate-950/40"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <Field
                        label="Full Name"
                        value={editForm.fullName}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, fullName: v }))
                        }
                      />
                      <Field
                        label="Designation"
                        value={editForm.designation}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, designation: v }))
                        }
                      />
                      <Field
                        label="Phone"
                        value={editForm.phone}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, phone: v }))
                        }
                      />
                      <Field
                        label="Email"
                        value={editForm.email}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, email: v }))
                        }
                      />
                      <Field
                        label="Joining Date"
                        type="date"
                        value={editForm.joiningDate}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, joiningDate: v }))
                        }
                      />
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                          Shift Assignment
                        </label>
                        <select
                          value={editForm.shiftId}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              shiftId: e.target.value,
                            }))
                          }
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                        >
                          <option value="">Unassigned</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} (
                              {s.type === "DAY"
                                ? "Day Shift"
                                : s.type === "NIGHT"
                                  ? "Night Shift"
                                  : "General Shift"}
                              )
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 mt-1 mb-3 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2 mt-2 mb-2">
                        <Wallet className="w-3.5 h-3.5 text-[#0f4a29] dark:text-[#52b788]" />
                        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Salary Details
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field
                          label="Salary (₹)"
                          type="number"
                          value={editForm.salary}
                          onChange={(v) =>
                            setEditForm((f) => ({ ...f, salary: v }))
                          }
                        />
                        <Field
                          label="Bank Name"
                          value={editForm.bankName}
                          onChange={(v) =>
                            setEditForm((f) => ({ ...f, bankName: v }))
                          }
                        />
                        <Field
                          label="IFSC Code"
                          value={editForm.ifscCode}
                          onChange={(v) =>
                            setEditForm((f) => ({
                              ...f,
                              ifscCode: v.toUpperCase(),
                            }))
                          }
                        />
                        <Field
                          label="Bank Account No."
                          value={editForm.bankAccountNo}
                          onChange={(v) =>
                            setEditForm((f) => ({ ...f, bankAccountNo: v }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 px-3 py-1.5 rounded-full"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(emp.id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-4 py-1.5 rounded-full disabled:opacity-50 shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" /> Save Changes
                      </button>
                    </div>
                  </td>
                ) : (
                  <>
                    <Td className="font-extrabold text-slate-900 dark:text-white">
                      {emp.fullName}
                    </Td>
                    <Td>{emp.designation}</Td>
                    <Td>
                      <ShiftBadge shift={emp.shift} />
                    </Td>
                    <Td className="text-xs font-medium">
                      <div>{emp.phone || "—"}</div>
                      <div className="text-[11px] text-slate-400">
                        {emp.email || ""}
                      </div>
                    </Td>
                    <Td className="text-xs text-slate-500 font-medium">
                      {emp.joiningDate?.split("T")[0]}
                    </Td>
                    <Td>
                      <span
                        title={
                          emp.bankName || emp.ifscCode || emp.bankAccountNo
                            ? `${emp.bankName || "—"} • IFSC: ${
                                emp.ifscCode || "—"
                              } • A/C: ${emp.bankAccountNo || "—"}`
                            : "No bank details on file"
                        }
                        className="font-bold text-xs"
                      >
                        {formatSalary(emp.salary)}
                      </span>
                    </Td>
                    <Td>
                      <button
                        onClick={() => toggleActive(emp)}
                        className={`text-[10px] font-extrabold px-3 py-0.5 rounded-full border transition-all ${
                          emp.isActive
                            ? "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {emp.isActive ? "Active" : "Inactive"}
                      </button>
                    </Td>
                    <Td>
                      <div className="flex gap-1 items-center">
                        <IconBtn title="Edit" onClick={() => startEdit(emp)}>
                          <Pencil className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                        </IconBtn>
                        <IconBtn
                          title="Remove"
                          onClick={() => setDeleteTarget(emp)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        </IconBtn>
                      </div>
                    </Td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      {/* Shared Delete Modal Component */}
      {deleteTarget && (
        <DeleteModal
          name={deleteTarget.fullName}
          itemLabel="Employee Record"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}) {
  return (
    <div>
      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
      />
    </div>
  );
}

function IconBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {children}
    </button>
  );
}
