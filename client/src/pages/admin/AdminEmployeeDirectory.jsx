// client/src/pages/admin/AdminEmployeeDirectory.jsx
// Manages the Employee table — pure information records (nurses, ward
// staff, cleaners, etc.). These do NOT log in — no password, no role, no
// module. For login accounts (Doctor/Receptionist/Pharmacy/Admin), see
// AdminStaffAccounts.jsx instead.
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { UserPlus, Loader2, Pencil, Trash2, X, Check, Building2, Search, Wallet, Sun, Moon, CalendarClock } from "lucide-react";

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
  DAY: { label: "Day", icon: Sun, className: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" },
  NIGHT: { label: "Night", icon: Moon, className: "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20" },
  GENERAL: { label: "General", icon: CalendarClock, className: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700" },
};

function ShiftBadge({ shift }) {
  if (!shift) return <span className="text-slate-400 dark:text-slate-600 text-xs">Unassigned</span>;
  const meta = SHIFT_TYPE_META[shift.type] || SHIFT_TYPE_META.GENERAL;
  const Icon = meta.icon;
  return (
    <div>
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.className}`}>
        <Icon className="w-3 h-3" /> {meta.label}
      </span>
      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{shift.name}</div>
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

  useEffect(() => { fetchEmployees(); }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/biometric/shifts?status=active&limit=100");
        setShifts(data.shifts);
      } catch {
        // shift list is a convenience for the dropdown only — a failure here
        // shouldn't block viewing/editing the employee directory.
      }
    })();
  }, []);

  const filtered = employees.filter((e) =>
    e.fullName.toLowerCase().includes(search.toLowerCase()) ||
    e.designation.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");
    if (!createForm.fullName || !createForm.designation || !createForm.joiningDate) {
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
    setError(""); setInfo("");
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
    setError(""); setInfo("");
    try {
      await api.put(`/admin/employees/${emp.id}`, { isActive: !emp.isActive });
      fetchEmployees();
    } catch (err) {
      setError(err.message || "Could not update status.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setError(""); setInfo("");
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-500" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Employee Directory</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">({employees.length})</span>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:scale-[1.02] transition-transform shadow-lg shadow-teal-500/20"
        >
          <UserPlus className="w-4 h-4" /> Add Employee
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-400 text-sm font-medium">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/30 rounded-xl px-4 py-3 text-teal-700 dark:text-teal-400 text-sm font-medium">
          {info}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name" value={createForm.fullName} onChange={(v) => setCreateForm(f => ({ ...f, fullName: v }))} placeholder="Full Name" />
            <Field label="Designation" value={createForm.designation} onChange={(v) => setCreateForm(f => ({ ...f, designation: v }))} placeholder="Nurse, Ward Boy, Cleaner..." />
            <Field label="Phone" value={createForm.phone} onChange={(v) => setCreateForm(f => ({ ...f, phone: v }))} placeholder="Phone Number" />
            <Field label="Email" type="email" value={createForm.email} onChange={(v) => setCreateForm(f => ({ ...f, email: v }))} placeholder="Email" />
            <Field label="Joining Date" type="date" value={createForm.joiningDate} onChange={(v) => setCreateForm(f => ({ ...f, joiningDate: v }))} />
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Shift</label>
              <select
                value={createForm.shiftId}
                onChange={(e) => setCreateForm(f => ({ ...f, shiftId: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
              >
                <option value="">Unassigned</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.type === "DAY" ? "Day Shift" : s.type === "NIGHT" ? "Night Shift" : "General Shift"})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Notes (optional)</label>
            <textarea
              value={createForm.notes}
              onChange={(e) => setCreateForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-3.5 h-3.5 text-teal-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Salary Details (optional)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Salary (₹)"
                type="number"
                value={createForm.salary}
                onChange={(v) => setCreateForm(f => ({ ...f, salary: v }))}
                placeholder="e.g. 25000"
              />
              <Field
                label="Bank Name"
                value={createForm.bankName}
                onChange={(v) => setCreateForm(f => ({ ...f, bankName: v }))}
                placeholder="Bank Name"
              />
              <Field
                label="IFSC Code"
                value={createForm.ifscCode}
                onChange={(v) => setCreateForm(f => ({ ...f, ifscCode: v.toUpperCase() }))}
                placeholder="e.g. SBIN0001234"
              />
              <Field
                label="Bank Account No."
                value={createForm.bankAccountNo}
                onChange={(v) => setCreateForm(f => ({ ...f, bankAccountNo: v }))}
                placeholder="Bank Account No"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
              {saving ? "Adding..." : "Add Employee"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2.5">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or designation..."
          className="w-full pl-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm font-medium">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading directory...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-slate-400 dark:text-slate-500 text-sm">
          No employees found.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[940px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  {["Name", "Designation", "Shift", "Contact", "Joined", "Salary", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id} className="border-t border-slate-100 dark:border-slate-800/50">
                    {editingId === emp.id ? (
                      <td colSpan={8} className="px-5 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          <Field label="Full Name" value={editForm.fullName} onChange={(v) => setEditForm(f => ({ ...f, fullName: v }))} />
                          <Field label="Designation" value={editForm.designation} onChange={(v) => setEditForm(f => ({ ...f, designation: v }))} />
                          <Field label="Phone" value={editForm.phone} onChange={(v) => setEditForm(f => ({ ...f, phone: v }))} />
                          <Field label="Email" value={editForm.email} onChange={(v) => setEditForm(f => ({ ...f, email: v }))} />
                          <Field label="Joining Date" type="date" value={editForm.joiningDate} onChange={(v) => setEditForm(f => ({ ...f, joiningDate: v }))} />
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Shift</label>
                            <select
                              value={editForm.shiftId}
                              onChange={(e) => setEditForm(f => ({ ...f, shiftId: e.target.value }))}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
                            >
                              <option value="">Unassigned</option>
                              {shifts.map((s) => (
                                <option key={s.id} value={s.id}>{s.name} ({s.type === "DAY" ? "Day Shift" : s.type === "NIGHT" ? "Night Shift" : "General Shift"})</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="pt-2 mt-1 mb-3 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2 mt-3 mb-2">
                            <Wallet className="w-3.5 h-3.5 text-teal-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Salary Details (optional)
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Salary (₹)" type="number" value={editForm.salary} onChange={(v) => setEditForm(f => ({ ...f, salary: v }))} />
                            <Field label="Bank Name" value={editForm.bankName} onChange={(v) => setEditForm(f => ({ ...f, bankName: v }))} />
                            <Field label="IFSC Code" value={editForm.ifscCode} onChange={(v) => setEditForm(f => ({ ...f, ifscCode: v.toUpperCase() }))} />
                            <Field label="Bank Account No." value={editForm.bankAccountNo} onChange={(v) => setEditForm(f => ({ ...f, bankAccountNo: v }))} />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(emp.id)} disabled={saving} className="flex items-center gap-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50">
                            <Check className="w-3.5 h-3.5" /> Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 px-3 py-2">
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-white">{emp.fullName}</td>
                        <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{emp.designation}</td>
                        <td className="px-5 py-3.5"><ShiftBadge shift={emp.shift} /></td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 text-xs">
                          <div>{emp.phone || "—"}</div>
                          <div>{emp.email || ""}</div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{emp.joiningDate?.split("T")[0]}</td>
                        <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                          <span
                            title={
                              emp.bankName || emp.ifscCode || emp.bankAccountNo
                                ? `${emp.bankName || "—"} • IFSC: ${emp.ifscCode || "—"} • A/C: ${emp.bankAccountNo || "—"}`
                                : "No bank details on file"
                            }
                          >
                            {formatSalary(emp.salary)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => toggleActive(emp)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                              emp.isActive
                                ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {emp.isActive ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-1">
                            <IconBtn title="Edit" onClick={() => startEdit(emp)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                            <IconBtn title="Remove" onClick={() => setDeleteTarget(emp)}><Trash2 className="w-3.5 h-3.5 text-rose-500" /></IconBtn>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-2">Remove {deleteTarget.fullName}?</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">This permanently deletes this directory record. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="text-sm text-slate-500 dark:text-slate-400 px-4 py-2">Cancel</button>
              <button onClick={confirmDelete} className="bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-teal-500"
      />
    </div>
  );
}

function IconBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {children}
    </button>
  );
}