// client/src/pages/admin/AdminStaffAccounts.jsx
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import {
  PageHeader,
  TableCard,
  Th,
  Td,
  SectionCard,
} from "../../components/UI";
import {
  UserPlus,
  Loader2,
  Pencil,
  KeyRound,
  Power,
  X,
  Check,
  ShieldCheck,
} from "lucide-react";

const ROLES = ["ADMIN", "DOCTOR", "RECEPTIONIST", "PHARMACY"];
const MODULES = ["OPD", "IPD", "PHARMACY"];

const ROLE_COLORS = {
  ADMIN:
    "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200",
  DOCTOR:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border-indigo-200",
  RECEPTIONIST:
    "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200",
  PHARMACY:
    "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20",
};

const emptyCreateForm = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  role: "RECEPTIONIST",
  modules: [],
};

export default function AdminStaffAccounts() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [resettingId, setResettingId] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const { users: data } = await api.get("/admin/users");
      setUsers(data);
    } catch (err) {
      setError(err.message || "Could not load staff accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleCreateModule = (m) => {
    setCreateForm((f) => ({
      ...f,
      modules: f.modules.includes(m)
        ? f.modules.filter((x) => x !== m)
        : [...f.modules, m],
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (
      !createForm.fullName ||
      !createForm.email ||
      !createForm.phone ||
      !createForm.password
    ) {
      return setError(
        "Full name, email, phone, and password are all required.",
      );
    }
    setSaving(true);
    try {
      await api.post("/admin/users", createForm);
      setInfo(`${createForm.fullName} added successfully.`);
      setCreateForm(emptyCreateForm);
      setShowCreate(false);
      fetchUsers();
    } catch (err) {
      setError(err.message || "Could not create staff account.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditForm({
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      modules: u.modules || [],
    });
  };

  const toggleEditModule = (m) => {
    setEditForm((f) => ({
      ...f,
      modules: f.modules.includes(m)
        ? f.modules.filter((x) => x !== m)
        : [...f.modules, m],
    }));
  };

  const saveEdit = async (id) => {
    setError("");
    setInfo("");
    setSaving(true);
    try {
      await api.put(`/admin/users/${id}`, editForm);
      setInfo("Account updated.");
      setEditingId(null);
      fetchUsers();
    } catch (err) {
      setError(err.message || "Could not update account.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    setError("");
    setInfo("");
    try {
      await api.put(`/admin/users/${u.id}`, { isActive: !u.isActive });
      setInfo(`${u.fullName} ${u.isActive ? "deactivated" : "reactivated"}.`);
      fetchUsers();
    } catch (err) {
      setError(err.message || "Could not update status.");
    }
  };

  const submitReset = async (id) => {
    if (!newPassword || newPassword.length < 6) {
      return setError("New password must be at least 6 characters.");
    }
    setError("");
    setInfo("");
    setSaving(true);
    try {
      await api.put(`/admin/users/${id}/reset-password`, { newPassword });
      setInfo("Password reset successfully.");
      setResettingId(null);
      setNewPassword("");
    } catch (err) {
      setError(err.message || "Could not reset password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Staff Accounts"
        subtitle={`System login accounts and module permissions (${users.length} active users)`}
        action={
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="flex items-center gap-2 bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full transition-all shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            {showCreate ? "Close Form" : "Add Staff Account"}
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

      {/* Add Staff Form */}
      {showCreate && (
        <SectionCard title="Create New System User" icon={ShieldCheck}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Full Name"
                value={createForm.fullName}
                onChange={(v) => setCreateForm((f) => ({ ...f, fullName: v }))}
                placeholder="Staff Full Name"
                required
              />
              <Field
                label="Email Address"
                type="email"
                value={createForm.email}
                onChange={(v) => setCreateForm((f) => ({ ...f, email: v }))}
                placeholder="Login email"
                required
              />
              <Field
                label="Phone Number"
                value={createForm.phone}
                onChange={(v) => setCreateForm((f) => ({ ...f, phone: v }))}
                placeholder="10-digit mobile"
                required
              />
              <Field
                label="Temporary Password"
                type="password"
                value={createForm.password}
                onChange={(v) => setCreateForm((f) => ({ ...f, password: v }))}
                placeholder="Min 6 characters"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Assign System Role
              </label>
              <select
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, role: e.target.value }))
                }
                className="w-full sm:w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {createForm.role !== "ADMIN" && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Permitted Modules
                </label>
                <div className="flex gap-2 flex-wrap">
                  {MODULES.map((m) => {
                    const selected = createForm.modules.includes(m);
                    return (
                      <button
                        type="button"
                        key={m}
                        onClick={() => toggleCreateModule(m)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold border transition-all ${
                          selected
                            ? "bg-[#0f4a29] text-white border-[#0f4a29]"
                            : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-xs font-bold text-slate-500 px-4 py-2.5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-5 py-2.5 rounded-full disabled:opacity-50 transition-all shadow-xs"
              >
                {saving ? "Creating..." : "Create Account"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {/* Main Staff Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-slate-400 text-xs font-bold">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f4a29]" /> Loading
            staff accounts...
          </div>
        </div>
      ) : (
        <TableCard>
          <thead>
            <tr>
              {["Name", "Contact", "Role", "Modules", "Status", "Actions"].map(
                (h) => (
                  <Th key={h}>{h}</Th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-t border-slate-100 dark:border-slate-800/60"
              >
                {editingId === u.id ? (
                  <td
                    colSpan={6}
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
                        label="Email"
                        value={editForm.email}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, email: v }))
                        }
                      />
                      <Field
                        label="Phone"
                        value={editForm.phone}
                        onChange={(v) =>
                          setEditForm((f) => ({ ...f, phone: v }))
                        }
                      />
                      <div>
                        <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                          Role
                        </label>
                        <select
                          value={editForm.role}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, role: e.target.value }))
                          }
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {editForm.role !== "ADMIN" && (
                      <div className="mb-3">
                        <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                          Modules
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          {MODULES.map((m) => (
                            <button
                              type="button"
                              key={m}
                              onClick={() => toggleEditModule(m)}
                              className={`px-3 py-1 rounded-full text-xs font-bold border ${editForm.modules.includes(m) ? "bg-[#0f4a29] text-white border-[#0f4a29]" : "bg-white text-slate-500"}`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs font-bold text-slate-500 px-3 py-1.5"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(u.id)}
                        disabled={saving}
                        className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-4 py-1.5 rounded-full shadow-xs"
                      >
                        Save Changes
                      </button>
                    </div>
                  </td>
                ) : resettingId === u.id ? (
                  <td
                    colSpan={6}
                    className="p-5 bg-slate-50/50 dark:bg-slate-950/40"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password (min 6 chars)"
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#0f4a29]"
                      />
                      <button
                        onClick={() => submitReset(u.id)}
                        disabled={saving}
                        className="bg-[#0f4a29] hover:bg-[#165a34] text-white text-xs font-extrabold px-4 py-2 rounded-full shadow-xs"
                      >
                        Confirm Reset
                      </button>
                      <button
                        onClick={() => {
                          setResettingId(null);
                          setNewPassword("");
                        }}
                        className="text-xs font-bold text-slate-500 px-3 py-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                ) : (
                  <>
                    <Td className="font-extrabold text-slate-900 dark:text-white">
                      {u.fullName}
                    </Td>
                    <Td className="text-xs font-medium">
                      <div>{u.email}</div>
                      <div className="text-[11px] text-slate-400">
                        {u.phone}
                      </div>
                    </Td>
                    <Td>
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${ROLE_COLORS[u.role]}`}
                      >
                        {u.role}
                      </span>
                    </Td>
                    <Td className="text-xs text-slate-500 font-medium">
                      {(u.modules || []).join(", ") || "—"}
                    </Td>
                    <Td>
                      <button
                        onClick={() => toggleActive(u)}
                        className={`text-[10px] font-extrabold px-3 py-0.5 rounded-full border transition-all ${
                          u.isActive
                            ? "bg-[#0f4a29]/10 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {u.isActive ? "Active" : "Inactive"}
                      </button>
                    </Td>
                    <Td>
                      <div className="flex gap-1 items-center">
                        <button
                          onClick={() => startEdit(u)}
                          title="Edit Account"
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setResettingId(u.id);
                            setNewPassword("");
                          }}
                          title="Reset Password"
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          title={u.isActive ? "Deactivate" : "Activate"}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </TableCard>
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
      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
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
