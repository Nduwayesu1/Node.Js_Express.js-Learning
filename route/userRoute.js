// User Routes
const express = require('express');
const router = express.Router();
const userController = require('../controler/userController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       202:
 *         description: User created and OTP sent for verification
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserCreatedResponse'
 *       400:
 *         description: Required fields are missing or the email already exists
 *       500:
 *         description: Server error while creating the user
 */
router.post('/users', userController.createUser);

/**
 * @swagger
 * /api/users/resend-otp:
 *   post:
 *     summary: Resend an email verification OTP
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: jane@example.com }
 *     responses:
 *       202:
 *         description: Verification code sent
 *       400:
 *         description: Invalid or already verified account
 */
router.post('/users/resend-otp', userController.resendOtp);

/**
 * @swagger
 * /api/users/verify-otp:
 *   post:
 *     summary: Verify a user's email using an OTP
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OtpOnlyRequest'
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerificationResponse'
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/users/verify-otp', userController.verifyOtp);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Log in a verified user and issue a JWT
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TokenResponse'
 *       403:
 *         description: User email has not been verified
 */
router.post('/users/login', userController.loginUser);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [name, email, role, createdAt, isVerified], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [user, employee, admin] }
 *     responses:
 *       200:
 *         description: Users returned successfully
 *       403:
 *         description: Admin access is required
 */
router.get('/users', requireAuth, requireAdmin, userController.listUsers);

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: View the authenticated user's profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile returned successfully
 */
router.get('/users/me', requireAuth, userController.getMyProfile);

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     summary: Update the authenticated user's profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.patch('/users/me', requireAuth, userController.updateMyProfile);

module.exports = router;
