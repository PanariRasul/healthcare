// server/src/biometric/shift.controller.js
import * as shiftService from "./shift.service.js";

// Same shared handler pattern as biometric.controller.js.
function handle(status, fn) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      return res.status(status).json(data);
    } catch (err) {
      const code = err.status || 500;
      if (code === 500) console.error("Shift module error:", err);
      return res.status(code).json({ message: err.message || "Something went wrong." });
    }
  };
}

// GET /api/biometric/shifts?search=&status=&page=&limit=
export const listShifts = handle(200, async (req) => {
  const [{ shifts, total, page, limit }, summary] = await Promise.all([
    shiftService.listShifts({
      search: req.query.search,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    }),
    shiftService.getShiftSummary(),
  ]);
  return { shifts, total, page, limit, summary };
});

// GET /api/biometric/shifts/:id
export const getShift = handle(200, async (req) => {
  const shift = await shiftService.getShiftById(req.params.id);
  return { shift };
});

// POST /api/biometric/shifts
export const createShift = handle(201, async (req) => {
  const shift = await shiftService.createShift(req.body);
  return { shift };
});

// PUT /api/biometric/shifts/:id
export const updateShift = handle(200, async (req) => {
  const shift = await shiftService.updateShift(req.params.id, req.body);
  return { shift };
});

// PATCH /api/biometric/shifts/:id/toggle
export const toggleShift = handle(200, async (req) => {
  const shift = await shiftService.toggleShift(req.params.id);
  return { shift };
});

// DELETE /api/biometric/shifts/:id
export const deleteShift = handle(200, async (req) => {
  return shiftService.deleteShift(req.params.id);
});

// PATCH /api/biometric/mappings/:id/shift  { shiftId }
export const assignMappingShift = handle(200, async (req) => {
  const mapping = await shiftService.assignShiftToMapping(req.params.id, req.body.shiftId);
  return { mapping };
});