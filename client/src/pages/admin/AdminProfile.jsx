// client/src/pages/admin/AdminProfile.jsx
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { PageHeader } from "../../components/UI";
import {
  Mail,
  Phone,
  ShieldCheck,
  Layers,
  KeyRound,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";

const API_BASE = `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api`;

function getToken() {
  return localStorage.getItem("hms_token");
}

export default function AdminProfile() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return setError("Please fill in all password fields.");
    }
    if (newPassword.length < 6) {
      return setError("New password must be at least 6 characters.");
    }
    if (newPassword !== confirmPassword) {
      return setError("New password and confirmation do not match.");
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Could not update password.");
      } else {
        setSuccess("Password updated successfully.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans text-slate-900 bg-[#f4f5f7] dark:bg-slate-950 p-2 sm:p-4 rounded-3xl">
      <PageHeader
        title="Admin Profile"
        subtitle="Manage account credentials and security settings"
      />

      {/* Profile Overview Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-6 shadow-xs">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#0f4a29] text-[#52b788] flex items-center justify-center text-2xl font-extrabold shrink-0">
            {user.username?.[0]?.toUpperCase() || "A"}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white truncate">
              {user.username}
            </h2>
            <p className="text-xs font-bold text-[#0f4a29] dark:text-[#52b788] mt-0.5">
              Administrator
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoRow icon={Mail} label="Email" value={user.email} />
          <InfoRow icon={Phone} label="Phone" value={user.phone} />
          <InfoRow icon={ShieldCheck} label="Role" value="Admin" />
          <InfoRow
            icon={Layers}
            label="Access Level"
            value="All Modules (OPD, IPD, Pharmacy)"
          />
        </div>
      </div>

      {/* Password Form Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <KeyRound className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788]" />
          <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
            Change Password
          </h3>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <PasswordField
            label="Current Password"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            setShow={setShowCurrent}
            autoComplete="current-password"
          />
          <PasswordField
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            setShow={setShowNew}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm New Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            setShow={setShowConfirm}
            autoComplete="new-password"
          />

          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl px-4 py-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-[#0f4a29]/10 dark:bg-[#52b788]/20 border border-[#0f4a29]/20 text-[#0f4a29] dark:text-[#52b788] rounded-2xl px-4 py-3 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {success}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-[#0f4a29] hover:bg-[#165a34] text-white font-extrabold text-xs px-6 py-3 rounded-full transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Updating Password..." : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
      <Icon className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788] mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  setShow,
  autoComplete,
}) {
  return (
    <div>
      <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 pr-11 text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#0f4a29] transition-all"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
