// client/src/components/Sidebar.jsx
// Replace your existing Sidebar.jsx with this file
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  UserPlus,
  Users,
  CalendarClock,
  BedDouble,
  Stethoscope,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Activity,
  Menu,
  X,
  Pill,
  History,
  Clock,
  Plus,
  Wallet,
  UserRound,
  ShieldCheck,
  Building2,
  Fingerprint,
 
} from "lucide-react";
import { useState, useEffect } from "react";

const menuConfig = {
  "receptionist-OPD": [
    { label: "Dashboard",        icon: LayoutDashboard, to: "/opd-dashboard" },
    { label: "Register Patient", icon: UserPlus,        to: "/opd/register"  },
    { label: "All Patients",     icon: Users,           to: "/opd/patients"  },
    { label: "Follow-Ups",       icon: CalendarClock,   to: "/opd/followups" },
  ],
  "receptionist-IPD": [
    { label: "Dashboard",     icon: LayoutDashboard, to: "/ipd-dashboard" },
    { label: "Admit Patient", icon: BedDouble,       to: "/ipd/admit"     },
    { label: "All Patients",  icon: Users,           to: "/ipd/patients"  },
    { label: "Payments",      icon: Wallet,          to: "/ipd/payments"  },
    { label: "Follow Ups",    icon: CalendarClock,   to: "/ipd/followups"  },
  ],
  "doctor-OPD": [
    { label: "Dashboard",    icon: LayoutDashboard, to: "/doctor/opd/dashboard" },
    { label: "OPD Patients", icon: Stethoscope,     to: "/doctor/opd/patients"  },
    { label: "Follow-Ups",   icon: CalendarClock,   to: "/doctor/opd/followups" },
    { label: "My Profile",   icon: UserRound,       to: "/profile" },
  ],
  "doctor-IPD": [
    { label: "Dashboard", icon: LayoutDashboard, to: "/doctor/ipd/dashboard" },
    { label: "IPD Patients", icon: BedDouble, to: "/doctor/ipd" },
    { label: "My Profile",   icon: UserRound, to: "/profile" },
    { label: "Follow-Ups",   icon: CalendarClock, to: "/doctor/ipd/followups" },
  ],
  "pharmacy-Pharmacy": [
    { label: "Dashboard",     icon: LayoutDashboard, to: "/pharmacy-dashboard"  },
    { label: "Add Medicine",  icon: Plus,            to: "/pharmacy/add"        },
    { label: "All Medicines", icon: Pill,            to: "/pharmacy/medicines"  },
    { label: "Stock History", icon: History,         to: "/pharmacy/stock"      },
    { label: "Expiry Alerts", icon: Clock,           to: "/pharmacy/expiry"     },
  ],
  "admin-ADMIN": [
    { label: "Dashboard",          icon: LayoutDashboard, to: "/admin/dashboard"  },
    { label: "Staff Accounts",     icon: ShieldCheck,     to: "/admin/staff"      },
    { label: "Employee Directory", icon: Building2,       to: "/admin/employees"  },
    { label: "My Profile",         icon: UserRound,       to: "/admin/profile" },
    { label: "Working Days",         icon: CalendarClock,       to: "/admin/workingdays" },
    { label: "Biometric Management",  icon: Fingerprint,   to: "/admin/biometric" },
    { label: "Salary Management",  icon: Wallet ,   to: "/admin/salary-management" },
  ],
};
  
export default function Sidebar({ collapsed, setCollapsed }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const key   = user ? `${user.role}-${user.module}` : "";
  const links = menuConfig[key] || [];

  const isOPD      = user?.module === "OPD";
  const isPharmacy = user?.module === "Pharmacy";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [key]);

  const NavContent = ({ mini }) => (
    <>
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 ${mini ? "flex-col gap-2 px-0" : ""}`}>
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-lg shadow-emerald-500/25">
            <img
              src="/healthcare.jpg"
              alt="MediCore logo"
              className="w-full h-full object-cover"
            />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-900" />
        </div>
        {!mini && (
          <div className="min-w-0">
            <p className="text-slate-900 dark:text-white font-bold text-sm leading-none tracking-tight">VPC</p>
            <p className={`text-[11px] font-semibold mt-0.5 tracking-widest uppercase ${
              isPharmacy ? "text-emerald-600 dark:text-emerald-400" : "text-teal-600 dark:text-teal-400"
            }`}>
              {isPharmacy ? "Pharmacy" : "HMS"}
            </p>
          </div>
        )}
        {/* Collapse/expand toggle — kept inline (not absolutely positioned outside
            the sidebar) so it's never clipped by an ancestor's overflow-x-hidden */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all hidden lg:flex ${mini ? "" : "ml-auto"}`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Module badge */}
      {!mini && user && (
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold w-full ${
            isPharmacy
              ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : isOPD
              ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : "bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20 text-violet-700 dark:text-violet-400"
          }`}>
            {isPharmacy ? <Pill className="w-3.5 h-3.5 flex-shrink-0" />
              : isOPD ? <Stethoscope className="w-3.5 h-3.5 flex-shrink-0" />
              : <BedDouble className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>{user.module} Module</span>
            <span className="ml-auto capitalize text-[10px] opacity-70 font-medium">{user.role}</span>
          </div>
        </div>
      )}

      {/* Nav links */}
      <nav className={`flex-1 overflow-y-auto py-3 ${mini ? "px-2" : "px-3"}`}>
        {!mini && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 px-3 mb-2">Navigation</p>
        )}
        <ul className="space-y-0.5 list-none m-0 p-0">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-sm font-medium group relative ${
                      mini ? "justify-center px-2.5" : ""
                    } ${
                      isActive
                        ? isPharmacy
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-500/20 shadow-sm"
                          : "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200/80 dark:border-teal-500/20 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white border border-transparent"
                    }`
                  }
                  title={mini ? link.label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`flex-shrink-0 transition-colors ${mini ? "w-5 h-5" : "w-4 h-4"} ${
                          isActive
                            ? isPharmacy ? "text-emerald-600 dark:text-emerald-400" : "text-teal-600 dark:text-teal-400"
                            : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                        }`}
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                      {!mini && <span className="truncate">{link.label}</span>}
                      {mini && (
                        <span className="pointer-events-none absolute left-full ml-3 z-50 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150 shadow-lg">
                          {link.label}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User + Logout */}
      <div className="border-t border-slate-200 dark:border-slate-800 flex-shrink-0 p-3 space-y-1">
        {!mini && user && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 mb-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm ${
              isPharmacy ? "bg-gradient-to-br from-emerald-500 to-teal-400" : "bg-gradient-to-br from-teal-500 to-cyan-400"
            }`}>
              {user.username[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-slate-800 dark:text-white text-xs font-semibold capitalize truncate leading-tight">{user.username}</p>
              <p className="text-slate-400 dark:text-slate-500 text-[11px] capitalize leading-tight mt-0.5">{user.role}</p>
            </div>
            <Activity className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all text-sm font-medium border border-transparent hover:border-red-100 dark:hover:border-red-500/20 group relative ${mini ? "justify-center px-2.5" : ""}`}
          title={mini ? "Logout" : undefined}
        >
          <LogOut className={`flex-shrink-0 transition-colors group-hover:text-red-500 ${mini ? "w-5 h-5" : "w-4 h-4"}`} strokeWidth={2} />
          {!mini && <span>Logout</span>}
          {mini && (
            <span className="pointer-events-none absolute left-full ml-3 z-50 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150 shadow-lg">
              Logout
            </span>
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4" />
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl transition-transform duration-300 ease-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Mobile navigation"
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          aria-label="Close menu"
        >
          <X className="w-4 h-4" />
        </button>
        <NavContent mini={false} />
      </aside>

      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out shadow-sm ${collapsed ? "w-[68px]" : "w-64"}`}
        aria-label="Desktop navigation"
      >
        <NavContent mini={collapsed} />
      </aside>
    </>
  );
}