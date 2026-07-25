// client/src/components/Layout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import NotificationBell from "./NotificationBell";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { Sun, Moon, Stethoscope, UserRound, Pill, Briefcase, ShieldCheck } from "lucide-react";

const ROLE_STYLES = {
  doctor: {
    icon: Stethoscope,
    wrap: "bg-violet-50 dark:bg-violet-500/15 border-violet-200 dark:border-violet-500/20",
    iconWrap: "bg-violet-100 dark:bg-violet-500/25 text-violet-600 dark:text-violet-400",
    text: "text-violet-700 dark:text-violet-400",
  },
  receptionist: {
    icon: UserRound,
    wrap: "bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/20",
    iconWrap: "bg-blue-100 dark:bg-blue-500/25 text-blue-600 dark:text-blue-400",
    text: "text-blue-700 dark:text-blue-400",
  },
  pharmacy: {
    icon: Pill,
    wrap: "bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/20",
    iconWrap: "bg-emerald-100 dark:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  admin: {
    icon: ShieldCheck,
    wrap: "bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/20",
    iconWrap: "bg-amber-100 dark:bg-amber-500/25 text-amber-600 dark:text-amber-400",
    text: "text-amber-700 dark:text-amber-400",
  },
  manager: {
    icon: Briefcase,
    wrap: "bg-orange-50 dark:bg-orange-500/15 border-orange-200 dark:border-orange-500/20",
    iconWrap: "bg-orange-100 dark:bg-orange-500/25 text-orange-600 dark:text-orange-400",
    text: "text-orange-700 dark:text-orange-400",
  },
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const { dark, toggle } = useTheme();

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      {/* Main content — offset only on lg+ where sidebar is fixed */}
<div
  className={`flex-1 min-w-0 flex flex-col transition-all duration-300 overflow-x-hidden ${
    collapsed ? "lg:ml-[68px]" : "lg:ml-64"
  }`}
>
        {/* Top Navbar */}
        <header className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 sticky top-0 z-20 transition-colors duration-300">
          {/* Left: spacer for mobile hamburger + status */}
          <div className="flex items-center gap-3">
            {/* Spacer so hamburger (fixed) doesn't overlap text */}
            <div className="w-9 lg:hidden" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium hidden sm:block">
                System Online
              </span>
            </div>
          </div>

          {/* Right: date, notifications, role badge, theme toggle */}
          <div className="flex items-center gap-3">
            <span className="text-slate-400 dark:text-slate-500 text-sm hidden md:block">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>

            <NotificationBell />

            {user && (() => {
              const style = ROLE_STYLES[user.role] || ROLE_STYLES.receptionist;
              const RoleIcon = style.icon;
              return (
                <div
                  className={`pl-1 pr-3 py-1 rounded-full border hidden sm:flex items-center gap-2 ${style.wrap}`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${style.iconWrap}`}>
                    <RoleIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </span>
                  <span className={`text-xs font-semibold capitalize ${style.text}`}>{user.role}</span>
                </div>
              );
            })()}
  
            <button
              onClick={toggle}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white transition-all duration-200"
              title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto overflow-x-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
          <Outlet />
        </main>
      </div>
    </div>
  );
}