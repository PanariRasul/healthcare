// server/src/auth/auth.middleware.js
import { verifyToken } from "./jwt.js";
import { isPharmacyAdmin } from "./pharmacyAccess.js";

// Attaches req.user = { id, role } if a valid token is present.
// Use on any route that requires the caller to be logged in.
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "No token provided." });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { id, role, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

// Use AFTER requireAuth. Pass one or more allowed roles.
// e.g. router.get("/doctor-only", requireAuth, requireRole("DOCTOR"), handler)
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "You do not have access to this resource." });
    }
    next();
  };
}

// Use AFTER requireAuth. Checks the modules array baked into the JWT.
// e.g. router.get("/opd/x", requireAuth, requireModule("OPD"), handler)
// ADMIN bypasses this check entirely — admins aren't "assigned" to individual
// modules the way a receptionist/doctor/pharmacy user is; they see everything.
//
// NOTE: this does NOT restrict Pharmacy for admins by itself — some Pharmacy
// endpoints (e.g. the medicine stats/list used by the Admin Dashboard
// widgets) are meant to stay visible to every admin. For the routes that
// should be limited to specific admin phone numbers, add
// restrictPharmacyAdmin below as an EXTRA middleware on top of this one.
export function requireModule(...allowedModules) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    if (req.user.role === "ADMIN") {
      return next();
    }
    const userModules = req.user.modules || [];
    const hasAccess = allowedModules.some((m) => userModules.includes(m));
    if (!hasAccess) {
      return res
        .status(403)
        .json({ message: "You are not assigned to this module." });
    }
    next();
  };
}

// Use AFTER requireAuth (order relative to requireModule doesn't matter).
// Restricts ADMIN accounts specifically — only admins whose phone number is
// listed in PHARMACY_ADMIN_PHONES (.env) may pass. Non-admin roles (pharmacy,
// receptionist, doctor, manager) are untouched here; they're already gated
// normally by requireModule/requireRole.
//
// Attach this ONLY to the actual Pharmacy-management routes (create/edit/
// delete medicine, stock entries, categories, billing, etc.) — the pages
// behind the Sidebar's Pharmacy tabs. Do NOT attach it to routes other parts
// of the app rely on for a shared summary, like GET /pharmacy/medicines/stats
// or the medicine list, which the Admin Dashboard widgets use for every
// admin regardless of Pharmacy access.
export function restrictPharmacyAdmin(req, res, next) {
  if (req.user?.role === "ADMIN" && !isPharmacyAdmin(req.user.phone)) {
    return res
      .status(403)
      .json({ message: "You are not assigned to this module." });
  }
  next();
}
