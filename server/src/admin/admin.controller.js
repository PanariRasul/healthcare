// server/src/admin/admin.controller.js
import prisma from "../lib/prisma.js";
import { hashPassword } from "../auth/hash.js";
import { normalizePhone } from "../auth/sms.service.js";

const VALID_ROLES = ["ADMIN", "DOCTOR", "RECEPTIONIST", "PHARMACY", "MANAGER"];
const VALID_MODULES = ["OPD", "IPD", "PHARMACY"];

function toSafeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

// ============================================================================
// Staff accounts (User table — these log in)
// ============================================================================

// GET /api/admin/users
export async function listUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ users: users.map(toSafeUser) });
  } catch (err) {
    console.error("List users error:", err);
    return res.status(500).json({ message: "Could not fetch staff accounts." });
  }
}

// GET /api/admin/users/:id
export async function getUser(req, res) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user)
      return res.status(404).json({ message: "Staff account not found." });
    return res.status(200).json({ user: toSafeUser(user) });
  } catch (err) {
    console.error("Get user error:", err);
    return res.status(500).json({ message: "Could not fetch staff account." });
  }
}

// PUT /api/admin/users/:id
// Edits role/modules/active status/contact info. Does NOT touch password —
// that's adminResetPassword below, kept separate so it's an explicit,
// deliberate action rather than a side effect of a general edit.
export async function updateUser(req, res) {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
    });
    if (!existing)
      return res.status(404).json({ message: "Staff account not found." });

    const { fullName, email, phone, role, modules, isActive } = req.body;
    const data = {};

    if (fullName !== undefined) data.fullName = fullName;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = normalizePhone(phone);
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return res
          .status(400)
          .json({ message: `role must be one of ${VALID_ROLES.join(", ")}` });
      }
      data.role = role;
    }

    if (modules !== undefined) {
      const moduleList = Array.isArray(modules) ? modules : [];
      const invalidModule = moduleList.find((m) => !VALID_MODULES.includes(m));
      if (invalidModule) {
        return res
          .status(400)
          .json({ message: `Invalid module: ${invalidModule}` });
      }
      data.modules = moduleList;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
    });
    return res.status(200).json({ user: toSafeUser(user) });
  } catch (err) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "Email or phone already in use by another account." });
    }
    console.error("Update user error:", err);
    return res.status(500).json({ message: "Could not update staff account." });
  }
}

// PUT /api/admin/users/:id/reset-password  { newPassword }
// Admin-triggered reset — deliberately does NOT require the user's current
// password (unlike Profile's self-service change-password). Use when a
// staff member forgets their password and can't self-serve.
export async function adminResetPassword(req, res) {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({
          message: "newPassword is required and must be at least 6 characters.",
        });
    }

    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
    });
    if (!existing)
      return res.status(404).json({ message: "Staff account not found." });

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { password: hashed },
    });

    return res
      .status(200)
      .json({
        message:
          "Password reset. Share the new password with the staff member securely.",
      });
  } catch (err) {
    console.error("Admin reset password error:", err);
    return res.status(500).json({ message: "Could not reset password." });
  }
}

// ============================================================================
// Employee directory (Employee table — NOT login accounts, pure records)
// ============================================================================

// GET /api/admin/employees
export async function listEmployees(req, res) {
  try {
    const { search = "" } = req.query;
    const where = search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { designation: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const employees = await prisma.employee.findMany({
      where,
      include: { shift: true },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ employees });
  } catch (err) {
    console.error("List employees error:", err);
    return res
      .status(500)
      .json({ message: "Could not fetch employee directory." });
  }
}

// POST /api/admin/employees
export async function createEmployee(req, res) {
  try {
    const {
      fullName,
      designation,
      phone,
      email,
      joiningDate,
      notes,
      salary,
      bankName,
      ifscCode,
      bankAccountNo,
      shiftId,
    } = req.body;
    if (!fullName || !designation || !joiningDate) {
      return res
        .status(400)
        .json({
          message: "fullName, designation, and joiningDate are required.",
        });
    }

    // Salary/bank fields are entirely optional. salary is coerced to a
    // number only when something was actually provided, otherwise left null.
    const parsedSalary =
      salary === undefined || salary === null || salary === ""
        ? null
        : Number(salary);
    if (parsedSalary !== null && Number.isNaN(parsedSalary)) {
      return res.status(400).json({ message: "salary must be a number." });
    }

    if (shiftId) {
      const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
      if (!shift) return res.status(404).json({ message: "Shift not found." });
    }

    const employee = await prisma.employee.create({
      data: {
        fullName,
        designation,
        phone: phone || null,
        email: email || null,
        joiningDate: new Date(joiningDate),
        notes: notes || null,
        salary: parsedSalary,
        bankName: bankName || null,
        ifscCode: ifscCode || null,
        bankAccountNo: bankAccountNo || null,
        shiftId: shiftId || null,
      },
      include: { shift: true },
    });

    return res.status(201).json({ employee });
  } catch (err) {
    console.error("Create employee error:", err);
    return res.status(500).json({ message: "Could not add employee." });
  }
}

// PUT /api/admin/employees/:id
export async function updateEmployee(req, res) {
  try {
    const existing = await prisma.employee.findUnique({
      where: { id: req.params.id },
    });
    if (!existing)
      return res.status(404).json({ message: "Employee not found." });

    const {
      fullName,
      designation,
      phone,
      email,
      joiningDate,
      isActive,
      notes,
      salary,
      bankName,
      ifscCode,
      bankAccountNo,
      shiftId,
    } = req.body;
    const data = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (designation !== undefined) data.designation = designation;
    if (phone !== undefined) data.phone = phone || null;
    if (email !== undefined) data.email = email || null;
    if (joiningDate !== undefined) data.joiningDate = new Date(joiningDate);
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (notes !== undefined) data.notes = notes || null;

    if (salary !== undefined) {
      const parsedSalary =
        salary === null || salary === "" ? null : Number(salary);
      if (parsedSalary !== null && Number.isNaN(parsedSalary)) {
        return res.status(400).json({ message: "salary must be a number." });
      }
      data.salary = parsedSalary;
    }
    if (bankName !== undefined) data.bankName = bankName || null;
    if (ifscCode !== undefined) data.ifscCode = ifscCode || null;
    if (bankAccountNo !== undefined) data.bankAccountNo = bankAccountNo || null;

    if (shiftId !== undefined) {
      if (shiftId) {
        const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
        if (!shift)
          return res.status(404).json({ message: "Shift not found." });
      }
      data.shiftId = shiftId || null;
    }

    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data,
      include: { shift: true },
    });
    return res.status(200).json({ employee });
  } catch (err) {
    console.error("Update employee error:", err);
    return res.status(500).json({ message: "Could not update employee." });
  }
}

// DELETE /api/admin/employees/:id
// Hard delete — this is a plain information record with no dependent rows
// elsewhere (unlike Category/medicine which block deletion when in use), so
// there's nothing to protect against here.
export async function deleteEmployee(req, res) {
  try {
    const existing = await prisma.employee.findUnique({
      where: { id: req.params.id },
    });
    if (!existing)
      return res.status(404).json({ message: "Employee not found." });

    await prisma.employee.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Employee removed." });
  } catch (err) {
    console.error("Delete employee error:", err);
    return res.status(500).json({ message: "Could not remove employee." });
  }
}
