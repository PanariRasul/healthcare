// client/src/components/UI.jsx
import { useState, useEffect } from "react";
import {
  Eye,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Inbox,
  Users,
  DollarSign,
  Banknote,
  Smartphone,
  BedDouble,
  CheckCircle2,
  Clock,
  TrendingUp,
  X,
  Sun,
  Moon,
} from "lucide-react";

// ── Stat Card ──────────────────────────────────────────────
export function StatCard({ label, value, icon: Icon, color = "green", sub }) {
  const colorMap = {
    green:
      "from-[#0f4a29]/10 to-[#52b788]/10 dark:from-[#0f4a29]/30 dark:to-[#52b788]/20 border-[#0f4a29]/20 text-[#0f4a29] dark:text-[#52b788]",
    blue: "from-blue-50 to-blue-100/50 dark:from-blue-500/20 dark:to-blue-600/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400",
    yellow:
      "from-amber-50 to-amber-100/50 dark:from-amber-500/20 dark:to-amber-600/10 border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400",
    purple:
      "from-violet-50 to-violet-100/50 dark:from-violet-500/20 dark:to-violet-600/10 border-violet-200 dark:border-violet-500/20 text-violet-600 dark:text-violet-400",
    red: "from-red-50 to-red-100/50 dark:from-red-500/20 dark:to-red-600/10 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400",
    cyan: "from-cyan-50 to-cyan-100/50 dark:from-cyan-500/20 dark:to-cyan-600/10 border-cyan-200 dark:border-cyan-500/20 text-cyan-600 dark:text-cyan-400",
    teal: "from-teal-50 to-teal-100/50 dark:from-teal-500/20 dark:to-teal-600/10 border-teal-200 dark:border-teal-500/20 text-teal-600 dark:text-teal-400",
  };
  return (
    <div
      className={`bg-gradient-to-br ${colorMap[color]} border rounded-2xl p-4 sm:p-5 flex items-center gap-4 transition-colors duration-300 shadow-xs`}
    >
      {Icon && (
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}
        >
          <Icon className="w-5 h-5" strokeWidth={2.5} />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-white truncate">
          {value}
        </div>
        <div className="text-slate-600 dark:text-slate-400 text-xs font-bold leading-tight">
          {label}
        </div>
        {sub && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Status Badge ───────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    Admitted:
      "bg-[#0f4a29]/10 dark:bg-[#52b788]/20 text-[#0f4a29] dark:text-[#52b788] border-[#0f4a29]/20 dark:border-[#52b788]/30",
    Discharged:
      "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    Active:
      "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
    Stable:
      "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
    Improving:
      "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
    Chronic:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",
    Mild: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
    Good: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
    Critical:
      "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",
  };
  return (
    <span
      className={`text-[11px] font-extrabold px-3 py-0.5 rounded-full border ${map[status] || "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"}`}
    >
      {status}
    </span>
  );
}

// ── Delete Confirmation Modal ──────────────────────────────
export function DeleteModal({
  onConfirm,
  onCancel,
  name,
  itemLabel = "Patient",
}) {
  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 max-w-sm w-full shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-6 h-6 text-red-500 dark:text-red-400" />
        </div>
        <h3 className="text-slate-900 dark:text-white font-extrabold text-lg text-center mb-2">
          Delete {itemLabel}
        </h3>
        <p className="text-slate-500 dark:text-slate-400 text-xs text-center mb-6 font-medium leading-relaxed">
          Are you sure you want to delete{" "}
          <span className="text-slate-900 dark:text-white font-bold">
            {name}
          </span>
          ? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-bold text-xs border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors font-bold text-xs flex items-center justify-center gap-2 shadow-xs"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────
export function EmptyState({
  icon: Icon = Inbox,
  message = "No records found",
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
        <Icon
          className="w-7 h-7 text-slate-400 dark:text-slate-500"
          strokeWidth={1.5}
        />
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-xs font-bold">
        {message}
      </p>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────
export function Pagination({ current, total, onPageChange }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: total }, (_, i) => i + 1);
  const visiblePages =
    total <= 5
      ? pages
      : pages.filter(
          (p) =>
            p === 1 || p === total || (p >= current - 1 && p <= current + 1),
        );

  return (
    <div className="flex items-center gap-1.5 mt-4 flex-wrap justify-end">
      <button
        onClick={() => onPageChange(current - 1)}
        disabled={current === 1}
        className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Prev</span>
      </button>

      {visiblePages.map((p, idx, arr) => (
        <span key={p} className="flex items-center gap-1.5">
          {idx > 0 && arr[idx - 1] !== p - 1 && (
            <span className="text-slate-400 dark:text-slate-500 px-1 text-xs">
              …
            </span>
          )}
          <button
            onClick={() => onPageChange(p)}
            className={`w-8 h-8 rounded-full text-xs font-bold transition-colors border ${
              p === current
                ? "bg-[#0f4a29] text-white border-[#0f4a29]"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {p}
          </button>
        </span>
      ))}

      <button
        onClick={() => onPageChange(current + 1)}
        disabled={current === total}
        className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-colors"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Search Bar ─────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = "Search..." }) {
  return (
    <div className="relative flex-1 sm:flex-none">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0f4a29] dark:focus:border-[#52b788] focus:ring-2 focus:ring-[#0f4a29]/10 text-xs font-medium w-full sm:w-64 transition-colors"
      />
    </div>
  );
}


// ── Page Header ────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  const [isDark, setIsDark] = useState(false);

  // Sync state with HTML dark class on mount
  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  return (
    <div className="relative overflow-hidden bg-white/80 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-[22px] py-3.5 px-5 sm:py-4 sm:px-6 mb-5 shadow-xs transition-all">
      {/* Brand Accent Bar on Left Edge */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 rounded-r-full bg-[#0f4a29] dark:bg-[#52b788]" />

      {/* Background Soft Glow Effect */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 w-32 h-32 rounded-full bg-[#0f4a29]/5 dark:bg-[#52b788]/5 blur-2xl"
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pl-2">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#155430] dark:text-white leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {action && <div className="flex items-center gap-2.5">{action}</div>}

          {/* Animated Dual-Icon Pill Switch Toggle */}
          <button
            onClick={toggleTheme}
            type="button"
            role="switch"
            aria-checked={isDark}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="relative w14 h-8 flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 rounded-full p-1 cursor-pointer transition-colors duration-300 shrink-0 focus:outline-none select-none shadow-inner"
            style={{ width: "60px" }}
          >
            {/* Sliding Knob Background */}
            <span
              className={`absolute top-0.5 left-0.5 w-7 h-7 bg-white dark:bg-slate-900 rounded-full shadow-md transition-transform duration-300 ease-spring border border-slate-200/50 dark:border-slate-700/50 ${
                isDark ? "translate-x-[28px]" : "translate-x-0"
              }`}
            />

            {/* Sun Icon (Left) */}
            <div className="z-10 flex-1 flex items-center justify-center pointer-events-none">
              <Sun
                className={`w-4 h-4 transition-all duration-300 ${
                  !isDark
                    ? "text-[#0f4a29] scale-110"
                    : "text-slate-400 dark:text-slate-600 scale-90 opacity-60"
                }`}
                strokeWidth={!isDark ? 2.5 : 2}
              />
            </div>

            {/* Moon Icon (Right) */}
            <div className="z-10 flex-1 flex items-center justify-center pointer-events-none">
              <Moon
                className={`w-4 h-4 transition-all duration-300 ${
                  isDark
                    ? "text-[#52b788] scale-110"
                    : "text-slate-400 dark:text-slate-600 scale-90 opacity-60"
                }`}
                strokeWidth={isDark ? 2.5 : 2}
              />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Table Container ────────────────────────────────────────
export function TableCard({ children }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] overflow-hidden shadow-xs transition-colors duration-300">
      <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
        <table className="w-full text-xs min-w-[500px] lg:min-w-full">
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({ children }) {
  return (
    <th className="text-left px-5 py-4 text-[11px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 whitespace-nowrap">
      {children}
    </th>
  );
}

export function Td({ children, className = "" }) {
  return (
    <td
      className={`px-5 py-3.5 text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800/50 font-medium ${className}`}
    >
      {children}
    </td>
  );
}

// ── Form Input ─────────────────────────────────────────────
export function FormInput({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0f4a29] dark:focus:border-[#52b788] focus:ring-2 focus:ring-[#0f4a29]/10 text-xs font-medium transition-colors"
      />
    </div>
  );
}

export function FormSelect({ label, value, onChange, options, required }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#0f4a29] dark:focus:border-[#52b788] focus:ring-2 focus:ring-[#0f4a29]/10 text-xs font-medium transition-colors"
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FormTextarea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0f4a29] dark:focus:border-[#52b788] focus:ring-2 focus:ring-[#0f4a29]/10 text-xs font-medium transition-colors resize-none"
      />
    </div>
  );
}

// ── Section Card ───────────────────────────────────────────
export function SectionCard({ title, children, icon: Icon }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] p-5 sm:p-6 shadow-xs transition-colors duration-300">
      {title && (
        <h3 className="text-slate-900 dark:text-white font-extrabold mb-4 flex items-center gap-2 text-xs uppercase tracking-wider">
          {Icon && (
            <Icon
              className="w-4 h-4 text-[#0f4a29] dark:text-[#52b788] flex-shrink-0"
              strokeWidth={2.5}
            />
          )}
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

// ── Action Button ──────────────────────────────────────────
export function ActionBtn({ onClick, type = "view", disabled }) {
  const styles = {
    view: "text-[#0f4a29] dark:text-[#52b788] hover:bg-[#0f4a29]/10 border-slate-200 dark:border-slate-800",
    edit: "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 border-amber-100 dark:border-amber-500/10",
    delete:
      "text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 border-red-100 dark:border-red-500/10",
  };
  const icons = {
    view: <Eye className="w-3.5 h-3.5" />,
    edit: <Pencil className="w-3.5 h-3.5" />,
    delete: <Trash2 className="w-3.5 h-3.5" />,
  };
  const labels = { view: "View", edit: "Edit", delete: "Delete" };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={labels[type]}
      aria-label={labels[type]}
      className={`p-2 rounded-xl transition-colors border ${styles[type]} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {icons[type]}
    </button>
  );
}
