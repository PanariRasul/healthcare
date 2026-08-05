// client/src/context/AuthContext.jsx
// Replace your existing AuthContext.jsx with this file
import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

const API_BASE = `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api`;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("hms_token"));
  const [initializing, setInitializing] = useState(true);

  // On app load, if a token exists, verify it's still valid and restore the session.
  useEffect(() => {
    async function restoreSession() {
      if (!token) {
        setInitializing(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Session expired");
        const data = await res.json();
        const savedModule =
          localStorage.getItem("hms_module") || data.user.modules[0];
        setUser({
          ...data.user,
          role: data.user.role.toLowerCase(),
          module: savedModule === "PHARMACY" ? "Pharmacy" : savedModule,
          username: data.user.fullName,
        });
      } catch {
        localStorage.removeItem("hms_token");
        localStorage.removeItem("hms_module");
        setToken(null);
        setUser(null);
      } finally {
        setInitializing(false);
      }
    }
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // module = the OPD/IPD/Pharmacy the user selected on the login screen.
  // We validate it against the modules actually assigned to that user in the DB.
  const login = async (email, password, module) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: data.message || "Invalid credentials.",
        };
      }

      const { token: newToken, user: fetchedUser } = data;

      if (module && !fetchedUser.modules.includes(module)) {
        return {
          success: false,
          error: `This account is not assigned to the ${module} module.`,
        };
      }

      setAuth(newToken, fetchedUser, module);

      const resolvedModule = module || fetchedUser.modules[0];
      return {
        success: true,
        role: fetchedUser.role.toLowerCase(),
        module: resolvedModule === "PHARMACY" ? "Pharmacy" : resolvedModule,
      };
    } catch (err) {
      return {
        success: false,
        error: "Could not reach the server. Please try again.",
      };
    }
  };

  // Used by flows that already have a token + user from the server (e.g. the
  // OTP login on the Login page) and just need to persist the session —
  // without making a second network call the way login() does.
  //
  // DB enums are uppercase (DOCTOR / RECEPTIONIST / PHARMACY, OPD / IPD / PHARMACY),
  // but Sidebar.jsx / App.jsx / ProtectedRoute.jsx were built against the old dummy
  // data which used lowercase role + module ("doctor", "OPD", etc). Normalize here
  // so none of that existing UI code needs to change.
  const setAuth = (newToken, fetchedUser, module) => {
    const resolvedModule = module || fetchedUser.modules[0];
    const normalizedUser = {
      ...fetchedUser,
      role: fetchedUser.role.toLowerCase(),
      module: resolvedModule === "PHARMACY" ? "Pharmacy" : resolvedModule,
      username: fetchedUser.fullName, // Sidebar.jsx reads user.username[0] for the avatar initial
    };

    localStorage.setItem("hms_token", newToken);
    localStorage.setItem("hms_module", resolvedModule);
    setToken(newToken);
    setUser(normalizedUser);
  };

  const logout = () => {
    localStorage.removeItem("hms_token");
    localStorage.removeItem("hms_module");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, setAuth, initializing }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
