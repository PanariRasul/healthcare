// client/src/pages/login/Login.jsx
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import SplashCursor from "../../components/SplashCursor"; // Imported SplashCursor
import {
  ShieldCheck,
  Stethoscope,
  Building2,
  Lock,
  Smartphone,
  ArrowRight,
  Activity,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const MODULES = [
  {
    id: "HOSPITAL",
    label: "OPD / IPD",
    description: "Reception & Doctor Console",
    icon: Stethoscope,
  },
  {
    id: "ADMIN",
    label: "Administrator",
    description: "System & Roles",
    icon: ShieldCheck,
  },
  {
    id: "MANAGER",
    label: "Manager",
    description: "Employee Management",
    icon: Building2,
  },
];

const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api`;

function routeFor(user, loginContext) {
  const r = String(user?.role || "").toLowerCase();
  const ctx = String(loginContext || "").toUpperCase();

  if (r === "admin") return "/admin/dashboard";
  if (r === "manager") return "/manager/dashboard";
  if (r === "pharmacy") return "/pharmacy-dashboard";

  if (ctx === "HOSPITAL" && (r === "receptionist" || r === "doctor")) {
    const modules = user?.modules || [];
    const landingModule = modules.includes("OPD")
      ? "OPD"
      : modules.includes("IPD")
        ? "IPD"
        : null;

    if (r === "receptionist" && landingModule === "OPD")
      return "/opd-dashboard";
    if (r === "receptionist" && landingModule === "IPD")
      return "/ipd-dashboard";
    if (r === "doctor" && landingModule === "OPD")
      return "/doctor/opd/dashboard";
    if (r === "doctor" && landingModule === "IPD")
      return "/doctor/ipd/dashboard";
  }

  return "/login";
}

export default function Login() {
  const [module, setModule] = useState("HOSPITAL");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("phone");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const resendTimer = useRef(null);

  // Cursor tracking: hero parallax/spotlight + a soft spotlight on the login
  // card. Both are gated behind a real hover-capable pointer, so touch
  // devices (phones/tablets) never get jittery transforms from touch-move.
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, rawX: 0, rawY: 0 });
  const [hasMoved, setHasMoved] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const [cardGlow, setCardGlow] = useState({ x: 50, y: 20 });
  const [btnOffset, setBtnOffset] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);

  const { setAuth } = useAuth();
  const navigate = useNavigate();

  // Prevent SplashCursor fluid triggers on the login card
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const stopSplash = (e) => {
      e.stopPropagation();
    };

    const events = [
      "mousemove",
      "pointermove",
      "mousedown",
      "pointerdown",
      "touchstart",
      "touchmove",
    ];

    events.forEach((evt) =>
      card.addEventListener(evt, stopSplash, { capture: true }),
    );

    return () => {
      events.forEach((evt) =>
        card.removeEventListener(evt, stopSplash, { capture: true }),
      );
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const handleMouseMove = (e) => {
    if (!canHover) return;
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    const x = (clientX / innerWidth) * 2 - 1;
    const y = (clientY / innerHeight) * 2 - 1;
    setMousePos({ x, y, rawX: clientX, rawY: clientY });
    if (!hasMoved) setHasMoved(true);
  };

  const handleCardMouseMove = (e) => {
    if (!canHover || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setCardGlow({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const handleBtnMouseMove = (e) => {
    if (!canHover) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    setBtnOffset({ x: relX * 10, y: relY * 8 });
  };

  const resetBtnOffset = () => setBtnOffset({ x: 0, y: 0 });

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

    if (!module)
      return setError("Please select an administration module first.");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10)
      return setError("Please enter a valid 10-digit mobile number.");
    if (!password) return setError("Please enter your password.");

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: digits,
          password,
          module: module.toUpperCase(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Could not send OTP. Please try again.");
        setLoading(false);
        return;
      }

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
        body: JSON.stringify({
          phone: digits,
          otp: "000000",
          module: module.toUpperCase(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Could not log in.");
        return;
      }

      try {
        setAuth(data.token, data.user, module.toUpperCase());
        navigate(routeFor(data.user, module.toUpperCase()));
      } catch (authErr) {
        console.error("setAuth/navigate failed after dev auto-login:", authErr);
        setError(
          "Signed in, but couldn't start your session. Please refresh and try again.",
        );
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
        body: JSON.stringify({
          phone: digits,
          password,
          module: module.toUpperCase(),
        }),
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

    if (otp.trim().length !== 6)
      return setError("Enter the 6-digit code sent to your phone.");

    setLoading(true);
    try {
      const digits = phone.replace(/\D/g, "");
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: digits,
          otp: otp.trim(),
          module: module.toUpperCase(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Invalid or expired code.");
      } else {
        try {
          setAuth(data.token, data.user, module.toUpperCase());
          navigate(routeFor(data.user, module.toUpperCase()));
        } catch (authErr) {
          console.error(
            "setAuth/navigate failed after OTP verification:",
            authErr,
          );
          setError(
            "Signed in, but couldn't start your session. Please refresh and try again.",
          );
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
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen w-full bg-[#071F14] text-slate-100 flex flex-col lg:flex-row font-[Manrope,ui-sans-serif,system-ui] overflow-x-hidden overflow-y-auto relative select-none"
    >
      {/* Interactive Fluid Cursor Component */}
      <SplashCursor
        DENSITY_DISSIPATION={3.5}
        VELOCITY_DISSIPATION={2}
        PRESSURE={0.1}
        CURL={3}
        SPLAT_RADIUS={0.2}
        SPLAT_FORCE={6000}
        COLOR_UPDATE_SPEED={10}
        SHADING={true}
        RAINBOW_MODE={false}
        COLOR="#22c55e"
      />

      {/* Fonts: a restrained display serif for the headline, Manrope for everything else */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Manrope:wght@500;700;800&display=swap');

        @keyframes vitals-travel {
          0% { stroke-dashoffset: 1200; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes vitals-fade {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.85; }
        }
        @keyframes drift {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(0px, -10px); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes step-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ring-pop {
          0% { box-shadow: 0 0 0 0 rgba(82, 183, 136, 0.45); }
          100% { box-shadow: 0 0 0 8px rgba(82, 183, 136, 0); }
        }
        .vitals-path {
          stroke-dasharray: 1200;
          animation: vitals-travel 5.5s linear infinite;
        }
        .vitals-glow {
          animation: vitals-fade 5.5s ease-in-out infinite;
        }
        .badge-drift {
          animation: drift 6s ease-in-out infinite;
        }
        .anim-fade-up {
          opacity: 0;
          animation: fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .anim-fade-in {
          opacity: 0;
          animation: fade-in 0.9s ease-out forwards;
        }
        .anim-step-in {
          animation: step-in 0.35s ease-out both;
        }
        .module-active {
          animation: ring-pop 0.5s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .anim-fade-up, .anim-fade-in, .anim-step-in, .module-active,
          .badge-drift, .vitals-path, .vitals-glow {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* ============ LEFT — HERO ============ */}
      <div className="relative lg:w-7/12 min-h-[360px] sm:min-h-[420px] lg:min-h-screen p-6 sm:p-8 md:p-10 lg:p-16 flex flex-col justify-between overflow-hidden">
        {/* Parallax background image */}
        <div
          className="absolute inset-0 z-0 motion-safe:transition-transform motion-safe:duration-700 ease-out scale-105"
          style={{
            transform: canHover
              ? `translate(${mousePos.x * -20}px, ${mousePos.y * -20}px)`
              : "translate(0px, 0px)",
          }}
        >
          <img
            src="/healthcare.jpg"
            alt="Hospital Banner"
            className="w-full h-full object-cover filter brightness-[0.4] contrast-125 saturate-[0.9]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071F14] via-[#0B2E1D]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#071F14]/95 via-transparent to-[#071F14]/90" />
        </div>

        {/* Cursor spotlight */}
        <div
          className="pointer-events-none absolute inset-0 z-[1] motion-safe:transition-opacity duration-300 ease-out"
          style={{
            opacity: canHover && hasMoved ? 0.7 : 0,
            background: `radial-gradient(700px circle at ${mousePos.rawX}px ${mousePos.rawY}px, rgba(82, 183, 136, 0.16), transparent 75%)`,
          }}
        />

        {/* Brand header */}
        <div className="anim-fade-up relative z-20 flex items-center gap-3 sm:gap-3.5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-4xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl flex items-center justify-center shrink-0">
            <img
              src="/healthcare.jpg"
              alt="Virupakshipuram Logo"
              className="w-full h-full object-contain rounded-4xl"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-extrabold tracking-widest text-white uppercase leading-none">
              VIRUPAKSHIPURAM
            </h1>
            <p className="text-[10px] sm:text-[11px] font-bold text-[#8FCDAE] mt-1 tracking-normal">
              Paralysis Centre
            </p>
          </div>
        </div>

        {/* Hero content — subtle cursor-parallax on the whole block */}
        <div
          className="relative z-20 my-auto py-8 sm:py-10 max-w-xl space-y-5 sm:space-y-7 motion-safe:transition-transform motion-safe:duration-500"
          style={{
            transform: canHover
              ? `translate(${mousePos.x * 14}px, ${mousePos.y * 14}px)`
              : "translate(0px, 0px)",
          }}
        >
          <div
            className="anim-fade-up motion-safe:badge-drift inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full bg-[#52B788]/15 border border-[#52B788]/40 text-[#8FCDAE] text-[11px] sm:text-xs font-extrabold backdrop-blur-md"
            style={{ animationDelay: "0.08s" }}
          >
            <Activity className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>Hospital Operations Console</span>
          </div>

          <h2
            className="anim-fade-up text-3xl sm:text-4xl md:text-5xl lg:text-[3.4rem] text-white leading-[1.1] lg:leading-[1.08] tracking-tight"
            style={{
              fontFamily: "'Fraunces', serif",
              fontWeight: 600,
              animationDelay: "0.16s",
            }}
          >
            Steady care, run
            <br />
            from one console.
          </h2>

          <p
            className="anim-fade-up text-slate-300/90 text-sm leading-relaxed font-medium max-w-md"
            style={{ animationDelay: "0.24s" }}
          >
            Outpatient, inpatient, pharmacy and staff operations — one secure
            sign-in for every team at the centre.
          </p>

          {/* Signature element: an animated vitals line with a traveling pulse */}
          <div
            className="anim-fade-up pt-2"
            style={{ animationDelay: "0.32s" }}
          >
            <svg
              viewBox="0 0 400 60"
              className="w-full max-w-[260px] sm:max-w-sm h-10 sm:h-12 motion-safe:vitals-glow overflow-visible"
              fill="none"
            >
              <path
                d="M0 30 H120 L140 10 L160 50 L180 5 L200 55 L220 30 H400"
                stroke="#52B788"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="motion-safe:vitals-path"
              />
              <circle r="4.5" fill="#8FCDAE">
                <animateMotion
                  dur="5.5s"
                  repeatCount="indefinite"
                  path="M0 30 H120 L140 10 L160 50 L180 5 L200 55 L220 30 H400"
                />
              </circle>
            </svg>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#6F8578] font-bold mt-1">
              Systems online
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className="anim-fade-up relative z-20 flex flex-wrap items-center gap-x-6 gap-y-1 text-[10px] sm:text-[11px] text-slate-400 font-semibold pt-4"
          style={{ animationDelay: "0.4s" }}
        >
          <span>
            © {new Date().getFullYear()} Virupakshipuram Paralysis Centre
          </span>
        </div>
      </div>

      {/* ============ RIGHT — LOGIN CARD ============ */}
      <div className="lg:w-5/12 flex items-center justify-center p-4 sm:p-6 md:p-10 relative z-30 bg-[#0B2E1D] lg:bg-transparent">
        <div
          ref={cardRef}
          onMouseMove={handleCardMouseMove}
          className="anim-fade-in w-full max-w-md bg-white border border-[#132A1D]/10 rounded-3xl sm:rounded-[28px] p-6 sm:p-8 md:p-10 shadow-2xl relative overflow-hidden z-30"
          style={{ animationDelay: "0.15s" }}
        >
          {/* Cursor-tracking spotlight on the card */}
          <div
            className="pointer-events-none absolute inset-0 z-0 motion-safe:transition-opacity duration-300"
            style={{
              opacity: canHover ? 1 : 0,
              background: `radial-gradient(320px circle at ${cardGlow.x}% ${cardGlow.y}%, rgba(82, 183, 136, 0.10), transparent 70%)`,
            }}
          />

          <div className="relative mb-6 sm:mb-7">
            <h3
              className="text-xl sm:text-2xl text-[#132A1D] tracking-tight"
              style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}
            >
              System login
            </h3>
            <p className="text-xs text-[#7C8C82] font-semibold mt-1">
              Select your access module to sign in
            </p>
          </div>

          {/* Module Selector Grid */}
          <div className="relative mb-6">
            <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#7C8C82] block mb-2">
              Select module
            </label>
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
              {MODULES.map((m) => {
                const Icon = m.icon;
                const isActive = module === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={step === "otp"}
                    onClick={() => {
                      setModule(m.id);
                      setError("");
                    }}
                    className={`p-3 sm:p-3.5 rounded-2xl border text-left relative overflow-hidden transition-all duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-60 ${
                      isActive
                        ? "module-active bg-[#0B2E1D] text-[#FAF8F3] border-[#0B2E1D] scale-[1.02] shadow-md"
                        : "bg-[#FAF8F3] border-[#132A1D]/15 text-[#132A1D] hover:bg-[#F1EEE5] hover:border-[#132A1D]/25 hover:-translate-y-0.5"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        className={`w-4 h-4 transition-colors duration-200 ${
                          isActive ? "text-[#52B788]" : "text-[#7C8C82]"
                        }`}
                        strokeWidth={2.5}
                      />
                      <span className="text-xs font-extrabold">{m.label}</span>
                    </div>
                    <p
                      className={`text-[10px] font-medium truncate ${
                        isActive ? "text-[#C8D8CE]" : "text-[#7C8C82]"
                      }`}
                    >
                      {m.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          {step === "phone" ? (
            <form
              key="phone"
              onSubmit={handleSendOtp}
              className="anim-step-in relative space-y-4"
            >
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#7C8C82] block mb-1.5">
                  Mobile number
                </label>
                <div className="relative flex items-center">
                  <Smartphone className="w-4 h-4 text-[#7C8C82] absolute left-3.5 pointer-events-none" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setError("");
                    }}
                    placeholder="Enter 10-digit mobile number"
                    maxLength={10}
                    className="w-full bg-white border border-[#132A1D]/15 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-[#132A1D] placeholder-[#A3AFA8] transition-all duration-200 focus:outline-none focus:border-[#0B2E1D] focus:ring-4 focus:ring-[#52B788]/15"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#7C8C82] block mb-1.5">
                  Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-[#7C8C82] absolute left-3.5 pointer-events-none" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className="w-full bg-white border border-[#132A1D]/15 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-[#132A1D] placeholder-[#A3AFA8] transition-all duration-200 focus:outline-none focus:border-[#0B2E1D] focus:ring-4 focus:ring-[#52B788]/15"
                  />
                </div>
              </div>

              {error && <ErrorBanner text={error} />}

              <button
                type="submit"
                disabled={loading}
                onMouseMove={handleBtnMouseMove}
                onMouseLeave={resetBtnOffset}
                style={{
                  transform: `translate(${btnOffset.x}px, ${btnOffset.y}px)`,
                }}
                className="w-full bg-[#0B2E1D] hover:bg-[#0F3B26] text-[#FAF8F3] font-extrabold text-xs py-3.5 rounded-full shadow-md hover:shadow-xl disabled:opacity-50 flex items-center justify-center gap-2 mt-2 transition-all duration-150 ease-out active:scale-[0.98]"
              >
                {loading ? (
                  <Spinner label="Authenticating..." />
                ) : (
                  <>
                    <span>Sign in</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form
              key="otp"
              onSubmit={handleVerifyOtp}
              className="anim-step-in relative space-y-4"
            >
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#7C8C82]">
                  Verification code
                </label>
                <button
                  type="button"
                  onClick={changeNumber}
                  className="text-xs font-extrabold text-[#0B2E1D] hover:underline underline-offset-2"
                >
                  Change number
                </button>
              </div>

              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                placeholder="••••••"
                maxLength={6}
                className="w-full text-center tracking-[0.5em] font-mono font-extrabold text-lg bg-white border border-[#132A1D]/15 rounded-2xl px-4 py-3 text-[#132A1D] transition-all duration-200 focus:outline-none focus:border-[#0B2E1D] focus:ring-4 focus:ring-[#52B788]/15"
              />

              <p className="text-[11px] text-[#7C8C82] text-center font-medium">
                Code sent to{" "}
                <span className="font-bold text-[#132A1D]">{phone}</span>.{" "}
                {resendIn > 0 ? (
                  <span className="text-[#A3AFA8]">Resend in {resendIn}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="text-[#0B2E1D] font-bold hover:underline underline-offset-2"
                  >
                    Resend code
                  </button>
                )}
              </p>

              {info && !error && <InfoBanner text={info} />}
              {error && <ErrorBanner text={error} />}

              <button
                type="submit"
                disabled={loading}
                onMouseMove={handleBtnMouseMove}
                onMouseLeave={resetBtnOffset}
                style={{
                  transform: `translate(${btnOffset.x}px, ${btnOffset.y}px)`,
                }}
                className="w-full bg-[#0B2E1D] hover:bg-[#0F3B26] text-[#FAF8F3] font-extrabold text-xs py-3.5 rounded-full shadow-md hover:shadow-xl disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-150 ease-out active:scale-[0.98]"
              >
                {loading ? (
                  <Spinner label="Verifying..." />
                ) : (
                  "Verify & sign in"
                )}
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
      <svg
        className="animate-spin h-4 w-4 text-current"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v8z"
        />
      </svg>
      {label}
    </span>
  );
}

function ErrorBanner({ text }) {
  return (
    <div className="anim-step-in bg-[#E15C5C]/10 border border-[#E15C5C]/30 rounded-2xl p-3 text-[#B23A3A] text-xs font-bold flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0 text-[#E15C5C]" />
      <span>{text}</span>
    </div>
  );
}

function InfoBanner({ text }) {
  return (
    <div className="anim-step-in bg-[#0B2E1D]/10 border border-[#0B2E1D]/20 rounded-2xl p-3 text-[#0B2E1D] text-xs font-bold flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4 shrink-0 text-[#0B2E1D]" />
      <span>{text}</span>
    </div>
  );
}
