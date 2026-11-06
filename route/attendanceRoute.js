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
 *     summary: Record employee attendance with a consented selfie
 *     description: Stores the JPEG in authenticated Cloudinary storage and serves it only through the bank-scoped HR endpoint. Exact image-file reuse is rejected across employee accounts. The system does not use facial recognition or visual similarity matching.
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
 *       409: { description: Attendance already recorded today or the exact image was used by another employee account }
 *       503: { description: Cloudinary photo storage is not configured or available }
 */
router.post('/attendance/check-in', requireAuth, checkInLimiter, attendanceController.checkIn);

/**
 * @swagger
 * /api/attendance/check-out:
 *   post:
 *     summary: Record the authenticated employee's check-out with a consented selfie
 *     description: Requires a new check-out selfie; exact image-file reuse is rejected across employee accounts. No facial recognition or visual similarity matching is performed.
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
 *               photo: { type: string, description: JPEG data URL }
 *     responses:
 *       200: { description: Attendance check-out and photo recorded }
 *       400: { description: Consent missing or selfie invalid }
 *       403: { description: Employee access required }
 *       404: { description: No check-in exists for today }
 *       409: { description: Check-out is before 5 PM Kigali time, attendance already checked out, or the exact image was used by another employee account }
 *       503: { description: Cloudinary photo storage is not configured or available }
 */
router.post('/attendance/check-out', requireAuth, checkInLimiter, attendanceController.checkOut);

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
 *     summary: Retrieve an attendance check-in or check-out selfie for HR review
 *     description: Select the photo using the optional type query parameter, which defaults to check-in.
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attendanceId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         required: false
 *         schema: { type: string, enum: [check-in, check-out], default: check-in }
 *     responses:
 *       200: { description: JPEG photo; retrieved from authenticated Cloudinary storage, private and non-cacheable }
 *       403: { description: HR Manager access required }
 *       404: { description: Attendance record not found in the HR Manager's bank }
 */
router.get('/attendance/:attendanceId/photo', requireAuth, requireStaffRole('hr_manager'), attendanceController.getAttendancePhoto);

module.exports = router;
