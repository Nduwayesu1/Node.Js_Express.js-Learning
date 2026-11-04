const express = require('express');
const rateLimit = require('express-rate-limit');
const attendanceController = require('../controler/attendanceController');
const { requireAuth, requireStaffRole } = require('../middleware/auth');

const router = express.Router();
const checkInLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attendance requests. Please try again later.' }
});

/**
 * @swagger
 * /api/attendance/check-in:
 *   post:
 *     summary: Record employee attendance with a consented, encrypted selfie
 *     description: Stores the JPEG attendance photo encrypted at rest. The system does not use facial recognition or identity matching.
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [photoConsent, photo]
 *             properties:
 *               photoConsent: { type: boolean, enum: [true] }
 *               photo: { type: string, description: JPEG data URL, example: data:image/jpeg;base64,/9j/4AAQSkZJRg... }
 *     responses:
 *       201: { description: Attendance recorded }
 *       400: { description: Consent missing or selfie invalid }
 *       403: { description: Active employee access required }
 *       409: { description: Attendance already recorded today }
 *       503: { description: Encrypted photo storage is not configured }
 */
router.post('/attendance/check-in', requireAuth, checkInLimiter, attendanceController.checkIn);

/**
 * @swagger
 * /api/attendance/mine:
 *   get:
 *     summary: List the authenticated employee's attendance history
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Attendance records returned without photo data }
 *       403: { description: Employee access required }
 */
router.get('/attendance/mine', requireAuth, attendanceController.listMyAttendance);

/**
 * @swagger
 * /api/attendance/hr:
 *   get:
 *     summary: View attendance records for the authenticated HR Manager's bank
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Bank-scoped attendance report returned without photo data }
 *       403: { description: HR Manager access required }
 */
router.get('/attendance/hr', requireAuth, requireStaffRole('hr_manager'), attendanceController.listBankAttendance);

/**
 * @swagger
 * /api/attendance/{attendanceId}/photo:
 *   get:
 *     summary: Retrieve an encrypted attendance selfie for HR review
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attendanceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: JPEG photo; private and non-cacheable }
 *       403: { description: HR Manager access required }
 *       404: { description: Attendance record not found in the HR Manager's bank }
 */
router.get('/attendance/:attendanceId/photo', requireAuth, requireStaffRole('hr_manager'), attendanceController.getAttendancePhoto);

module.exports = router;
