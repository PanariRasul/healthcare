// client/src/pages/login/Login.jsx
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const MODULES = [
  {
    id: "OPD",
    label: "Outpatient",
    description: "OPD Desk & Consults",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    id: "IPD",
    label: "Inpatient",
    description: "Admissions & Beds",
    icon: "M19 16v1a1 1 0 01-1 1H6a1 1 0 01-1-1v-1m14-4v2m-14-2v2m14-5V7a2 2 0 00-2-2H6a2 2 0 00-2 2v3m16 0h-2M4 10h2m11 4H7",
  },
  {
    id: "Pharmacy",
    label: "Pharmacy",
    description: "Dispensary & Inventory",
    icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  },
  {
    id: "ADMIN",
    label: "Administrator",
    description: "System & Roles",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    id: "MANAGER",
    label: "Manager",
    description: "Employee Management",
    icon: "M9 17v-2a4 4 0 014-4h3m0 0l-3-3m3 3l-3 3M3 7a4 4 0 014-4h3m10 14v-2a4 4 0 00-4-4H8",
  },
];

const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api`;

function routeFor(role, module) {
  const r = String(role || "").toLowerCase();
  const m = String(module || "").toUpperCase();
  if (r === "admin") return "/admin/dashboard";
  if (r === "manager") return "/manager/dashboard";
  if (r === "receptionist" && m === "OPD") return "/opd-dashboard";
  if (r === "receptionist" && m === "IPD") return "/ipd-dashboard";
  if (r === "doctor" && m === "OPD") return "/doctor/opd/dashboard";
  if (r === "doctor" && m === "IPD") return "/doctor/ipd/dashboard";
  if (r === "pharmacy") return "/pharmacy-dashboard";
  return "/login";
}

export default function Login() {
  const [module, setModule] = useState("OPD");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const resendTimer = useRef(null);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const startResendCountdown = (seconds = 60) => {
    setResendIn(seconds);
    clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) {
          clearInterval(resendTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!module) return setError("Please select an administration module first.");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return setError("Please enter a valid 10-digit mobile number.");
    if (!password) return setError("Please enter your password.");

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, password, module: module.toUpperCase() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Could not send OTP. Please try again.");
        setLoading(false);
        return;
      }

      /* ===================== OTP STEP — DISABLED FOR DEV ==================
      setStep("otp");
      setInfo("A 6-digit code has been sent to your mobile number.");
      startResendCountdown(60);
      setLoading(false);
      ======================================================================== */

      await devAutoVerify(digits);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  const devAutoVerify = async (digits) => {
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, otp: "000000", module: module.toUpperCase() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Could not log in.");
        return;
      }

      try {
        setAuth(data.token, data.user, module.toUpperCase());
        navigate(routeFor(data.user.role, module.toUpperCase()));
      } catch (authErr) {
        console.error("setAuth/navigate failed after dev auto-login:", authErr);
        setError("Signed in, but couldn't start your session. Please refresh and try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendIn > 0) return;
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const digits = phone.replace(/\D/g, "");
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, password, module: module.toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Could not resend OTP.");
      } else {
        setInfo("A new code has been sent.");
        startResendCountdown(60);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (otp.trim().length !== 6) return setError("Enter the 6-digit code sent to your phone.");

    setLoading(true);
    try {
      const digits = phone.replace(/\D/g, "");
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, otp: otp.trim(), module: module.toUpperCase() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Invalid or expired code.");
      } else {
        try {
          setAuth(data.token, data.user, module.toUpperCase());
          navigate(routeFor(data.user.role, module.toUpperCase()));
        } catch (authErr) {
          console.error("setAuth/navigate failed after OTP verification:", authErr);
          setError("Signed in, but couldn't start your session. Please refresh and try again.");
        }
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const changeNumber = () => {
    setStep("phone");
    setOtp("");
    setPassword("");
    setError("");
    setInfo("");
    clearInterval(resendTimer.current);
    setResendIn(0);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col xl:flex-row font-sans overflow-x-hidden antialiased transition-colors duration-300">
      
      {/* Left Stage - Full Background Showcase */}
      <div className="relative xl:w-7/12 min-h-[320px] xl:min-h-screen p-8 xl:p-16 flex flex-col justify-between overflow-hidden">
        
        {/* Full Image Background with Vignette Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/healthcare.jpg" 
            alt="Hospital Banner" 
            className="w-full h-full object-cover filter brightness-[1.2] dark:brightness-[2.8] contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-slate-900/80 dark:from-slate-950 dark:via-slate-950/40 dark:to-slate-950/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-transparent to-slate-900 dark:from-slate-950/80 dark:via-transparent dark:to-slate-950" />
        </div>

        {/* Brand Bar */}
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 dark:bg-white/10 backdrop-blur-md border border-white/30 dark:border-white/20 p-1.5 shadow-xl">
            <img src="/healthcare.jpg" alt="Virupakshipuram Logo" className="w-full h-full object-cover rounded-xl" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase">Virupakshipuram</h1>
            <p className="text-xs font-bold text-teal-300 dark:text-teal-400">Paralysis Centre</p>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 my-auto py-12 max-w-xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-500/20 dark:bg-teal-500/10 border border-teal-400/30 dark:border-teal-500/20 text-teal-200 dark:text-teal-300 text-xs font-semibold backdrop-blur-md">
            <span>Hospital Operations Console</span>
          </div>
          <h2 className="text-3xl sm:text-4xl xl:text-5xl font-black text-white leading-tight tracking-tight">
            Streamlined Management for Advanced Care.
          </h2>
          <p className="text-slate-200 dark:text-slate-300 text-sm xl:text-base leading-relaxed">
            Connecting Outpatient, Inpatient, and Pharmacy departments into a unified, secure administration platform.
          </p>
        </div>

        {/* Footer info */}
        <div className="relative z-10 flex items-center gap-6 text-xs text-slate-300 dark:text-slate-400 font-medium pt-4">
          <span>© {new Date().getFullYear()} Virupakshipuram Paralysis Centre</span>
        </div>
      </div>

      {/* Right Stage - Centered Floating Glass Form */}
      <div className="xl:w-5/12 flex items-center justify-center p-6 sm:p-10 bg-slate-50 dark:bg-slate-950 relative transition-colors duration-300">
        <div className="w-full max-w-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-slate-200/50 dark:shadow-none relative z-10">
          
          <div className="mb-6">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">System Login</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Select your access module to log in</p>
          </div>

          {/* Module Selector List */}
          <div className="mb-6">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
              Select Module
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MODULES.map((m) => {
                const isActive = module === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={step === "otp"}
                    onClick={() => { setModule(m.id); setError(""); }}
                    className={`p-3 rounded-2xl border text-left transition-all duration-200 ${
                      isActive
                        ? "bg-teal-50 dark:bg-teal-500/10 border-teal-500 text-teal-950 dark:text-white shadow-md shadow-teal-500/10"
                        : "bg-slate-100/60 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <svg className={`w-4 h-4 ${isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-400 dark:text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={m.icon} />
                      </svg>
                      <span className="text-xs font-bold">{m.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-500 truncate">{m.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          {step === "phone" ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(""); }}
                  placeholder="Enter 10-digit mobile number"
                  maxLength={10}
                  className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 dark:focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-all font-medium"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 dark:focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-all font-medium"
                />
              </div>

              {error && <ErrorBanner text={error} />}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 dark:from-teal-500 dark:to-cyan-500 dark:hover:from-teal-400 dark:hover:to-cyan-400 text-white dark:text-slate-950 font-bold text-xs py-3.5 rounded-xl transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Spinner label="Authenticating..." /> : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Verification Code
                </label>
                <button type="button" onClick={changeNumber} className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline">
                  Change number
                </button>
              </div>

              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                placeholder="••••••"
                maxLength={6}
                className="w-full text-center tracking-[0.5em] font-mono font-bold text-lg bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-teal-700 dark:text-teal-300 placeholder-slate-300 dark:placeholder-slate-700 focus:outline-none focus:border-teal-500 dark:focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
              />

              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                Code sent to <span className="font-semibold text-slate-800 dark:text-white">{phone}</span>.{" "}
                {resendIn > 0 ? (
                  <span className="text-slate-400">Resend in {resendIn}s</span>
                ) : (
                  <button type="button" onClick={handleResendOtp} className="text-teal-600 dark:text-teal-400 font-bold hover:underline">
                    Resend code
                  </button>
                )}
              </p>

              {info && !error && <InfoBanner text={info} />}
              {error && <ErrorBanner text={error} />}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 dark:from-teal-500 dark:to-cyan-500 dark:hover:from-teal-400 dark:hover:to-cyan-400 text-white dark:text-slate-950 font-bold text-xs py-3.5 rounded-xl transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Spinner label="Verifying..." /> : "Verify & Sign In"}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

function Spinner({ label }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      {label}
    </span>
  );
}

function ErrorBanner({ text }) {
  return (
    <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/80 rounded-xl p-3 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
      <span className="font-medium">{text}</span>
    </div>
  );
}

function InfoBanner({ text }) {
  return (
    <div className="bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800/80 rounded-xl p-3 text-teal-700 dark:text-teal-300 text-xs flex items-center gap-2">
      <span className="font-medium">{text}</span>
    </div>
  );
}