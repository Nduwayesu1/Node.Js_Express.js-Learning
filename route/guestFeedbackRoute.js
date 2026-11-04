const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const guestFeedbackController = require('../controler/guestFeedbackController');

const router = express.Router();
const guestFeedbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many feedback submissions. Please try again later.' }
});

/**
 * @swagger
 * /api/guest-feedback:
 *   post:
 *     summary: Submit anonymous guest feedback
 *     description: Stores feedback without collecting a guest name, email, or account details. Limited to five submissions per IP per 15 minutes.
 *     tags: [Guest feedback]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, rating, message]
 *             properties:
 *               category: { type: string, enum: [general, dashboard, loan-process, payments, accessibility] }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               message: { type: string, minLength: 10, maxLength: 2000 }
 *     responses:
 *       201: { description: Feedback saved anonymously }
 *       400: { description: Invalid feedback fields }
 *       429: { description: Submission rate limit exceeded }
 */
router.post('/guest-feedback', guestFeedbackLimiter, guestFeedbackController.submitGuestFeedback);

/**
 * @swagger
 * /api/admin/guest-feedback:
 *   get:
 *     summary: List guest feedback
 *     tags: [Guest feedback]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Recent anonymous feedback returned }
 *       403: { description: System administrator access is required }
 */
router.get('/admin/guest-feedback', requireAuth, requireAdmin, guestFeedbackController.listGuestFeedback);

/**
 * @swagger
 * /api/admin/guest-feedback/{feedbackId}/reviewed:
 *   patch:
 *     summary: Mark guest feedback as reviewed
 *     tags: [Guest feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: feedbackId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Feedback marked as reviewed }
 *       403: { description: System administrator access is required }
 *       404: { description: Feedback record not found }
 */
router.patch('/admin/guest-feedback/:feedbackId/reviewed', requireAuth, requireAdmin, guestFeedbackController.markGuestFeedbackReviewed);

module.exports = router;
