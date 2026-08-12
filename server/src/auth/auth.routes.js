// server/src/auth/auth.routes.js
import { Router } from "express";
import {
  register,
  login,
  loginWithPhone,
  me,
  updatePassword,
} from "./auth.controller.js";
import { requireAuth, requireRole } from "./auth.middleware.js";

const router = Router();

// SECURITY: this used to be a PUBLIC, unauthenticated endpoint — anyone who
// found it could create an account with any role (including PHARMACY or
// DOCTOR), no login required. Now that Admin exists, account creation is an
// admin-only action. Kept here (rather than duplicated in admin.routes.js)
// since it's the same underlying logic — just re-guarded.
router.post("/register", requireAuth, requireRole("ADMIN"), register);

// Legacy email/password login — kept for backward compatibility.
router.post("/login", login);

// Phone + password login (used by the current Login page). OTP has been
// removed — this is a single request, no verification code step.
router.post("/login-phone", loginWithPhone);

router.get("/me", requireAuth, me); // handy for "am I still logged in?" checks on app load

// Used by the Profile page's "Change Password" form. Requires the caller to
// already be logged in and to know their current password.
router.put("/change-password", requireAuth, updatePassword);

export default router;
