// client/src/components/NotificationBell.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Clock, Package, X, CheckCheck } from "lucide-react";
import { api } from "../lib/api";
import { getMedicineNotifications } from "../lib/pharmacyAlerts";
import { useAuth } from "../context/AuthContext";

const REFRESH_MS = 60000;

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [medicines, setMedicines] = useState([]);
  const [readKeys, setReadKeys] = useState(new Set());

  // Only OPD and Pharmacy modules are allowed to read the medicines list
  // at the API level — matches server/src/pharmacy/medicine.routes.js.
  const canSeeMedicines = user?.module === "OPD" || user?.module === "Pharmacy";
  const isPharmacy = user?.module === "Pharmacy";

  useEffect(() => {
    if (!canSeeMedicines) return;
    let cancelled = false;

    const fetchMedicines = async () => {
      try {
        const { medicines: data } = await api.get("/pharmacy/medicines");
        if (!cancelled) setMedicines(data);
      } catch {
        // silent — bell just stays empty if this fails
      }
    };

    const fetchReadKeys = async () => {
      try {
        const { readKeys: keys } = await api.get("/notifications/read");
        if (!cancelled) setReadKeys(new Set(keys));
      } catch {
        // silent — worst case, previously-read items show up again once
      }
    };

    fetchMedicines();
    fetchReadKeys();
    const interval = setInterval(fetchMedicines, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [canSeeMedicines]);

  if (!canSeeMedicines) return null;

  // Doctors don't need "out of stock" alerts — that's a Pharmacy/receptionist
  // restocking concern. Low-stock and expiry alerts still matter to doctors
  // (affects what they can prescribe), so only that one category is dropped,
  // and only for the doctor role — everyone else sees the full set.
  const isDoctor = user?.role === "doctor";
  const allNotifications = getMedicineNotifications(medicines).filter(
    (n) => !(isDoctor && n.key.endsWith(":out-of-stock")),
  );
  const visible = allNotifications.filter((n) => !readKeys.has(n.key));

  const markAsRead = async (key) => {
    // Optimistic update — feels instant, matches how the rest of the app behaves.
    setReadKeys((prev) => new Set(prev).add(key));
    try {
      await api.post("/notifications/read", { keys: [key] });
    } catch {
      // if this fails, the key just reappears on the next fetchReadKeys refresh
    }
  };

  const clearAll = async () => {
    const keys = visible.map((n) => n.key);
    if (keys.length === 0) return;
    setReadKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
    try {
      await api.post("/notifications/read", { keys });
    } catch {
      // same fallback as above
    }
  };

  const handleItemClick = (n) => {
    // Only Pharmacy staff have sidebar access to these pages — OPD users see
    // the info but there's nowhere useful for them to be sent.
    if (!isPharmacy) return;
    navigate(n.type === "expiry" ? "/pharmacy/expiry" : "/pharmacy/medicines");
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white transition-all duration-200"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {visible.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {visible.length > 9 ? "9+" : visible.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-800 dark:text-white">
                Notifications
              </span>
              {visible.length > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 text-xs text-[#0e3b22] dark:text-[#52b788] hover:underline font-medium"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Clear all
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {visible.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">
                  You're all caught up
                </div>
              ) : (
                visible.map((n) => (
                  <div
                    key={n.key}
                    className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        n.severity === "critical"
                          ? "bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400"
                          : "bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {n.type === "expiry" ? (
                        <Clock className="w-4 h-4" />
                      ) : (
                        <Package className="w-4 h-4" />
                      )}
                    </div>
                    <button
                      onClick={() => handleItemClick(n)}
                      className={`flex-1 min-w-0 text-left ${isPharmacy ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <div className="text-sm font-medium text-slate-800 dark:text-white truncate">
                        {n.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {n.message}
                      </div>
                    </button>
                    <button
                      onClick={() => markAsRead(n.key)}
                      title="Mark as read"
                      className="flex-shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
