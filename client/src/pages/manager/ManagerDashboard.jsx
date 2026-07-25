// client/src/pages/manager/ManagerDashboard.jsx
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Building2, UserPlus, ArrowRight, Briefcase } from "lucide-react";

// The Manager role currently has two working areas — the Employee Directory
// and Shift Assignment — both of which are the same pages Admin uses, just
// reached from /manager/* routes. This dashboard is the landing screen and
// quick-access hub into those two; add more cards here as Manager gets more
// pages of its own.
const QUICK_LINKS = [
  {
    to: "/manager/employees",
    label: "Employee Directory",
    description: "Browse staff records, roles, and contact details across departments.",
    icon: Building2,
    accent: {
      wrap: "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20",
      iconWrap: "bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400",
      hover: "hover:border-orange-300 dark:hover:border-orange-500/40",
    },
  },
  {
    to: "/manager/shift-assign",
    label: "Shift Assignment",
    description: "Assign and review upcoming shifts for staff and employees.",
    icon: UserPlus,
    accent: {
      wrap: "bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/20",
      iconWrap: "bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400",
      hover: "hover:border-teal-300 dark:hover:border-teal-500/40",
    },
  },
];

export default function ManagerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Briefcase className="w-5 h-5" strokeWidth={2.5} />
        </span>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight capitalize">
            Welcome{user?.username ? `, ${user.username}` : ""}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Manager overview &mdash; jump into your working areas below.
          </p>
        </div>
      </div>

      {/* Quick access cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.to}
              onClick={() => navigate(link.to)}
              className={`group text-left p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-all duration-200 shadow-sm hover:shadow-md ${link.accent.hover}`}
            >
              <div className="flex items-start justify-between">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${link.accent.iconWrap}`}>
                  <Icon className="w-5 h-5" strokeWidth={2.25} />
                </span>
                <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{link.label}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{link.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}