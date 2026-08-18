// client/src/components/Sidebar.jsx
import { NavLink, useNavigate, useLocation } from "react-router-dom";
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
  ChevronDown,
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
  Briefcase,
  ActivitySquare,
  Receipt,
} from "lucide-react";
import { useState, useEffect } from "react";

const menuConfig = {
  "receptionist-OPD": [
    { label: "Dashboard", icon: LayoutDashboard, to: "/opd-dashboard" },
    { label: "Register Patient", icon: UserPlus, to: "/opd/register" },
    { label: "All Patients", icon: Users, to: "/opd/patients" },
    { label: "Follow-Ups", icon: CalendarClock, to: "/opd/followups" },
    { label: "Pharmacy Billing", icon: Receipt, to: "/opd/pharmacy-billing" },
  ],
  "receptionist-IPD": [
    { label: "Dashboard", icon: LayoutDashboard, to: "/ipd-dashboard" },
    { label: "Admit Patient", icon: BedDouble, to: "/ipd/admit" },
    { label: "All Patients", icon: Users, to: "/ipd/patients" },
    { label: "Payments", icon: Wallet, to: "/ipd/payments" },
    { label: "Follow Ups", icon: CalendarClock, to: "/ipd/followups" },
    { label: "Pharmacy Billing", icon: Receipt, to: "/ipd/pharmacy-billing" },
  ],
  "doctor-OPD": [
    { label: "Dashboard", icon: LayoutDashboard, to: "/doctor/opd/dashboard" },
    { label: "OPD Patients", icon: Stethoscope, to: "/doctor/opd/patients" },
    { label: "Follow-Ups", icon: CalendarClock, to: "/doctor/opd/followups" },
    {
      label: "Pharmacy Billing",
      icon: Receipt,
      to: "/doctor/opd/pharmacy-billing",
    },
  ],
  "doctor-IPD": [
    { label: "Dashboard", icon: LayoutDashboard, to: "/doctor/ipd/dashboard" },
    { label: "IPD Patients", icon: BedDouble, to: "/doctor/ipd" },
    { label: "Follow-Ups", icon: CalendarClock, to: "/doctor/ipd/followups" },
    {
      label: "Pharmacy Billing",
      icon: Receipt,
      to: "/doctor/ipd/pharmacy-billing",
    },
  ],
  "pharmacy-Pharmacy": [
    { label: "Dashboard", icon: LayoutDashboard, to: "/pharmacy-dashboard" },
    { label: "Add Medicine", icon: Plus, to: "/pharmacy/add" },
    { label: "All Medicines", icon: Pill, to: "/pharmacy/medicines" },
    { label: "Billing", icon: Receipt, to: "/pharmacy/billing" },
    { label: "Stock History", icon: History, to: "/pharmacy/stock" },
    { label: "Expiry Alerts", icon: Clock, to: "/pharmacy/expiry" },
  ],
  "admin-ADMIN": [
    { label: "Dashboard", icon: LayoutDashboard, to: "/admin/dashboard" },
    { label: "Staff Accounts", icon: ShieldCheck, to: "/admin/staff" },
    { label: "Employee Directory", icon: Building2, to: "/admin/employees" },
    { label: "Patient Analytics", icon: Users, to: "/admin/patients" },
    // Every Pharmacy-related page lives under this one dropdown group
    // instead of as separate flat sidebar items — see the `children`
    // render branch below.
    {
      label: "Pharmacy",
      icon: Pill,
      children: [
        {
          label: "Dashboard",
          icon: LayoutDashboard,
          to: "/admin/pharmacy-dashboard",
        },
        { label: "Add Medicine", icon: Plus, to: "/admin/pharmacy/add" },
        { label: "All Medicines", icon: Pill, to: "/admin/pharmacy/medicines" },
        { label: "Billing", icon: Receipt, to: "/admin/pharmacy/billing" },
        { label: "Stock History", icon: History, to: "/admin/pharmacy/stock" },
        { label: "Expiry Alerts", icon: Clock, to: "/admin/pharmacy/expiry" },
        { label: "Analytics", icon: ActivitySquare, to: "/admin/pharmacy" },
      ],
    },
    { label: "Working Days", icon: CalendarClock, to: "/admin/workingdays" },
    { label: "Biometric Mgmt", icon: Fingerprint, to: "/admin/biometric" },
    { label: "Salary Mgmt", icon: Wallet, to: "/admin/salary-management" },
    { label: "Shift Assignment", icon: UserPlus, to: "/admin/shift-assign" },

    { label: "My Profile", icon: UserRound, to: "/admin/profile" },
  ],
  "manager-MANAGER": [
    { label: "Dashboard", icon: LayoutDashboard, to: "/manager/dashboard" },
    { label: "Employee Directory", icon: Building2, to: "/manager/employees" },
    { label: "Biometric Mgmt", icon: Fingerprint, to: "/manager/biometric" },
    { label: "Shift Assignment", icon: UserPlus, to: "/manager/shift-assign" },
  ],
};

const HOSPITAL_DASHBOARD_ROUTES = {
  "receptionist-OPD": "/opd-dashboard",
  "receptionist-IPD": "/ipd-dashboard",
  "doctor-OPD": "/doctor/opd/dashboard",
  "doctor-IPD": "/doctor/ipd/dashboard",
};

export default function Sidebar({ collapsed, setCollapsed }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Which dropdown groups (e.g. "Pharmacy") are expanded. Keyed by group
  // label. When a key is absent, openness falls back to whether the
  // current route is inside that group's children (see isOpen below), so
  // a group auto-expands when you land on one of its pages.
  const [openGroups, setOpenGroups] = useState({});

  const isPharmacy = user?.role === "pharmacy";
  const isManager = user?.role === "manager";
  const isAdmin = user?.role === "admin";
  const isHospitalRole =
    user?.role === "receptionist" || user?.role === "doctor";
  const hospitalModules = (user?.modules || []).filter(
    (m) => m === "OPD" || m === "IPD",
  );

  const [activeModule, setActiveModule] = useState(() => {
    if (!user || !isHospitalRole) return null;
    const stored = user.id
      ? localStorage.getItem(`activeModule:${user.id}`)
      : null;
    if (stored && hospitalModules.includes(stored)) return stored;
    return hospitalModules.includes("OPD") ? "OPD" : hospitalModules[0] || null;
  });

  useEffect(() => {
    if (!user || !isHospitalRole) return;
    if (activeModule && hospitalModules.includes(activeModule)) return;
    const stored = user.id
      ? localStorage.getItem(`activeModule:${user.id}`)
      : null;
    const next =
      stored && hospitalModules.includes(stored)
        ? stored
        : hospitalModules.includes("OPD")
          ? "OPD"
          : hospitalModules[0] || null;
    setActiveModule(next);
  }, [user?.id, user?.modules?.join(",")]);

  const contextForKey = isHospitalRole
    ? activeModule
    : isPharmacy
      ? "Pharmacy"
      : isAdmin
        ? "ADMIN"
        : isManager
          ? "MANAGER"
          : "";
  const key = user ? `${user.role}-${contextForKey}` : "";
  const rawLinks = menuConfig[key] || [];
  // Pharmacy tab only shows for admins whose phone is in the
  // PHARMACY_ADMIN_PHONES allowlist (flag comes from the backend as
  // user.canAccessPharmacy — see auth.controller.js toSafeUser()). Every
  // other admin sees everything except Pharmacy.
  const links =
    isAdmin && !user?.canAccessPharmacy
      ? rawLinks.filter((l) => l.label !== "Pharmacy")
      : rawLinks;

  const handleModuleSwitch = (mod) => {
    if (!user || mod === activeModule) return;
    setActiveModule(mod);
    if (user.id) localStorage.setItem(`activeModule:${user.id}`, mod);
    const dest = HOSPITAL_DASHBOARD_ROUTES[`${user.role}-${mod}`];
    if (dest) navigate(dest);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [key]);

  const NavContent = ({ mini }) => (
    <div className="flex flex-col h-full justify-between py-6">
      <div>
        {/* Brand Logo Header matching Screenshot */}
        <div
          className={`flex items-center gap-3 px-5 pb-6 flex-shrink-0 ${mini ? "flex-col gap-2 px-2" : ""}`}
        >
          <div className="w-10 h-10 rounded-2xl bg-slate-200/60 dark:bg-slate-800 border border-slate-300/50 dark:border-slate-700/60 flex items-center justify-center flex-shrink-0">
            <img
              src="/healthcare.jpg"
              alt="Logo"
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => {
                // Fallback icon if logo image is not found
                e.target.style.display = "none";
                e.target.parentNode.classList.add(
                  "bg-[#0f4a29]",
                  "text-[#52b788]",
                );
              }}
            />
          </div>
          {!mini && (
            <div className="min-w-0 flex-1">
              <h2 className="text-[#191d23] dark:text-white font-black text-xs tracking-wider uppercase leading-tight truncate">
                VIRUPAKSHIPURAM
              </h2>
              <p className="text-[#0f4a29] dark:text-[#52b788] font-bold text-[11px] tracking-normal leading-tight truncate mt-0.5">
                Paralysis Centre
              </p>
            </div>
          )}
        </div>

        {/* Dynamic Context Switcher Tab */}
        {isHospitalRole && hospitalModules.length > 1 && (
          <div className={`flex-shrink-0 mb-6 ${mini ? "px-2" : "px-5"}`}>
            <div
              className={`flex items-center gap-1 p-1 rounded-full bg-[#f3f4f6] dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 ${mini ? "flex-col rounded-2xl" : ""}`}
            >
              {["OPD", "IPD"]
                .filter((m) => hospitalModules.includes(m))
                .map((m) => {
                  const Icon = m === "OPD" ? Stethoscope : BedDouble;
                  const isActiveTab = activeModule === m;
                  return (
                    <button
                      key={m}
                      onClick={() => handleModuleSwitch(m)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                        mini ? "w-full px-0 py-2" : ""
                      } ${
                        isActiveTab
                          ? "bg-white dark:bg-slate-900 text-[#0f4a29] dark:text-[#52b788] shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <Icon
                        className="w-3.5 h-3.5"
                        strokeWidth={isActiveTab ? 2.5 : 2}
                      />
                      {!mini && <span>{m}</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Navigation Categories */}
        <nav className={`space-y-6 ${mini ? "px-2" : "px-4"}`}>
          <div>
            {!mini && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af] px-4 mb-2">
                Menu
              </p>
            )}
            <ul className="space-y-0.5 list-none m-0 p-0">
              {links.map((link) => {
                // --- Dropdown group (e.g. "Pharmacy") ---
                if (link.children) {
                  const GroupIcon = link.icon;
                  const isGroupActive = link.children.some((c) =>
                    location.pathname.startsWith(c.to),
                  );
                  const isOpen = openGroups[link.label] ?? isGroupActive;

                  return (
                    <li key={link.label}>
                      <button
                        type="button"
                        onClick={() => {
                          // Collapsed rail: no room for a submenu, so just
                          // jump straight to the group's first page.
                          if (mini) {
                            navigate(link.children[0].to);
                            return;
                          }
                          setOpenGroups((o) => ({
                            ...o,
                            [link.label]: !isOpen,
                          }));
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all group relative ${
                          mini ? "justify-center px-0" : ""
                        } ${
                          isGroupActive
                            ? "text-[#0f4a29] dark:text-white bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs font-extrabold"
                            : "text-[#6b7280] dark:text-slate-400 hover:text-[#155430] dark:hover:text-white"
                        }`}
                      >
                        {isGroupActive && !mini && (
                          <span className="absolute left-0 top-1/3 bottom-1/3 w-1 rounded-r-full bg-[#0f4a29]" />
                        )}
                        <GroupIcon
                          className={`flex-shrink-0 ${mini ? "w-5 h-5" : "w-4 h-4"} ${
                            isGroupActive
                              ? "text-[#0f4a29] dark:text-[#52b788]"
                              : "text-[#9ca3af] group-hover:text-[#4b5563]"
                          }`}
                          strokeWidth={isGroupActive ? 2.5 : 2}
                        />
                        {!mini && (
                          <span className="truncate flex-1 text-left">
                            {link.label}
                          </span>
                        )}
                        {!mini && (
                          <ChevronDown
                            className={`w-3.5 h-3.5 flex-shrink-0 text-[#9ca3af] transition-transform duration-200 ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </button>

                      {!mini && isOpen && (
                        <ul className="mt-0.5 mb-1 ml-[26px] pl-3 border-l border-slate-200 dark:border-slate-800 space-y-0.5 list-none">
                          {link.children.map((child) => {
                            const ChildIcon = child.icon;
                            return (
                              <li key={child.to}>
                                <NavLink
                                  to={child.to}
                                  end
                                  onClick={() => setMobileOpen(false)}
                                  className={({ isActive }) =>
                                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                                      isActive
                                        ? "text-[#0f4a29] dark:text-white bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs font-extrabold"
                                        : "text-[#6b7280] dark:text-slate-400 hover:text-[#155430] dark:hover:text-white"
                                    }`
                                  }
                                >
                                  {({ isActive }) => (
                                    <>
                                      <ChildIcon
                                        className={`w-3.5 h-3.5 flex-shrink-0 ${
                                          isActive
                                            ? "text-[#0f4a29] dark:text-[#52b788]"
                                            : "text-[#9ca3af]"
                                        }`}
                                      />
                                      <span className="truncate">
                                        {child.label}
                                      </span>
                                    </>
                                  )}
                                </NavLink>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                }

                // --- Regular flat link ---
                const Icon = link.icon;
                return (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all group relative ${
                          mini ? "justify-center px-0" : ""
                        } ${
                          isActive
                            ? "text-[#0f4a29] dark:text-white bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs font-extrabold"
                            : "text-[#6b7280] dark:text-slate-400 hover:text-[#155430] dark:hover:text-white"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Active State Indicator Strip on left edge */}
                          {isActive && !mini && (
                            <span className="absolute left-0 top-1/3 bottom-1/3 w-1 rounded-r-full bg-[#0f4a29]" />
                          )}
                          <Icon
                            className={`flex-shrink-0 ${mini ? "w-5 h-5" : "w-4 h-4"} ${
                              isActive
                                ? "text-[#0f4a29] dark:text-[#52b788]"
                                : "text-[#9ca3af] group-hover:text-[#4b5563]"
                            }`}
                            strokeWidth={isActive ? 2.5 : 2}
                          />
                          {!mini && (
                            <span className="truncate">{link.label}</span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      </div>

      {/* Donezo System Actions footer */}
      <div className="px-4 space-y-2">
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-4 py-3 rounded-full text-[#6b7280] hover:text-red-600 transition-all text-xs font-bold group relative ${mini ? "justify-center px-0" : ""}`}
        >
          <LogOut
            className={`flex-shrink-0 group-hover:text-red-500 ${mini ? "w-5 h-5" : "w-4 h-4"}`}
            strokeWidth={2.5}
          />
          {!mini && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-5 left-4 z-40 w-9 h-9 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700"
      >
        <Menu className="w-4 h-4" />
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-xs z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col bg-[#fcfdfe] dark:bg-slate-900 border-r border-slate-200/60 dark:border-slate-800 shadow-xl transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-5 right-4 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
        <NavContent mini={false} />
      </aside>

      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-[#fcfdfe] dark:bg-slate-950 border-r border-slate-200/60 dark:border-slate-800 transition-all duration-300 ${collapsed ? "w-[88px]" : "w-[260px]"}`}
      >
        <NavContent mini={collapsed} />
      </aside>
    </>
  );
}
