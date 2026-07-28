// client/src/routes/ProtectedRoute.jsx
// Replace your existing ProtectedRoute.jsx with this file
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, role, module }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;

  if (module) {
    // Route guarding now checks the modules actually assigned to the user
    // (e.g. ["OPD", "IPD"]) rather than `user.module`, which is just the
    // login-context string picked on the Login screen ("HOSPITAL" for the
    // merged OPD/IPD login, "Pharmacy", "ADMIN", "MANAGER"). That string
    // doesn't reliably match a single module name anymore, so it can't be
    // used to decide per-module route access.
    const required = String(module).toUpperCase();
    const assigned = (user.modules || []).map((m) => String(m).toUpperCase());
    if (!assigned.includes(required)) return <Navigate to="/login" replace />;
  }

  return children;
}