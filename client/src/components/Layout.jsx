// client/src/components/Layout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import NotificationBell from "./NotificationBell";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  Sun,
  Moon,
  Stethoscope,
  UserRound,
  Pill,
  Briefcase,
  ShieldCheck,
} from "lucide-react";

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const { dark, toggle } = useTheme();

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[#f5f6f7] dark:bg-slate-950 transition-colors duration-300 font-sans antialiased">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div
        className={`flex-1 min-w-0 flex flex-col transition-all duration-300 overflow-x-hidden ${collapsed ? "lg:ml-[88px]" : "lg:ml-[260px]"}`}
      >
        <main className="flex-1 min-w-0 p-4 sm:p-8 overflow-y-auto overflow-x-hidden bg-[#f5f6f7] dark:bg-slate-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
