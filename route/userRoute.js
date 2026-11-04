// User Routes
const express = require('express');
const router = express.Router();
const userController = require('../controler/userController');
const { requireAuth, requireAdmin, requireStaffRole } = require('../middleware/auth');

/**
 * @swagger
 * /api/users/bank-admins:
 *   post:
 *     summary: Create a bank administrator assigned to a bank sub-branch
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, bankId, branchId]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               bankId: { type: string }
 *               branchId: { type: string }
 *     responses:
 *       202: { description: Bank administrator created and verification code sent }
 *       400: { description: Invalid registration details or bank sub-branch }
 *       403: { description: Administrator access is required }
 */
router.post('/users/bank-admins', requireAuth, requireAdmin, userController.createBankAdmin);

/**
 * @swagger
 * /api/users/members:
 *   get:
 *     summary: List members registered with the authenticated Bank Admin's assigned sub-branch
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Bank members returned }
 *       403: { description: Bank administrator access is required }
 *   post:
 *     summary: Register a member with the authenticated Bank Admin's assigned sub-branch
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       202: { description: Member created and verification code sent; manager approval is still required after OTP verification }
 *       400: { description: Invalid registration details }
 *       403: { description: Bank Admin must be assigned to a bank sub-branch }
 */
router.get('/users/members', requireAuth, requireStaffRole('branch_manager', 'general_manager', 'hr_manager'), userController.listBankMembers);
router.post('/users/members', requireAuth, requireStaffRole('branch_manager'), userController.createBankMember);
/**
 * @swagger
 * /api/users/staff:
 *   get:
 *     summary: List bank employees assigned to the authenticated employee's sub-branch
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Bank staff returned }
 *       403: { description: Bank employee must have a sub-branch assignment }
 *   post:
 *     summary: Create a bank employee in the authenticated Branch Manager's sub-branch
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, staffRole]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               staffRole: { type: string, enum: [general_manager, hr_manager, finance_manager, accounts_manager] }
 *     responses:
 *       202: { description: Bank employee created and verification code sent }
 *       400: { description: Invalid registration details or staff role }
 *       403: { description: Branch Manager access is required }
 */
router.get('/users/staff', requireAuth, requireStaffRole('branch_manager', 'general_manager', 'hr_manager'), userController.listBankStaff);
router.post('/users/staff', requireAuth, requireStaffRole('branch_manager'), userController.createBankStaff);

/**
 * @swagger
 * /api/users/members/{memberId}/activate:
 *   patch:
 *     summary: Approve and activate a member of the authenticated Branch Manager's assigned sub-branch
 *     description: Marks the member approved and verified so they can sign in without entering their emailed OTP.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Bank member approved and activated }
 *       400: { description: Invalid bank member identifier }
 *       403: { description: Bank administrator access is required }
 *       404: { description: Bank member not found in the administrator's bank }
 */
router.patch('/users/members/:memberId/activate', requireAuth, requireStaffRole('branch_manager'), userController.activateBankMember);

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
 *     summary: Log in an OTP-verified and, when applicable, Branch Manager-approved user and issue a JWT
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
 *       - in: query
 *         name: bankId
 *         description: Filter users assigned to this bank
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Users returned successfully
 *       403:
 *         description: Admin access is required
 */
router.get('/users', requireAuth, requireAdmin, userController.listUsers);

/**
 * @swagger
 * /api/users/{id}/activate:
 *   patch:
 *     summary: Activate a user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User account activated successfully
 *       404:
 *         description: User not found
 */
router.patch('/users/:id/activate', requireAuth, requireAdmin, userController.activateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Update a user's details or employee assignment
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               role: { type: string, enum: [user, employee, admin] }
 *               isVerified: { type: boolean }
 *               bankId: { type: string, nullable: true }
 *               branchId: { type: string, nullable: true }
 *     responses:
 *       200: { description: User updated }
 *       400: { description: No valid fields or invalid employee assignment }
 *       403: { description: Administrator access is required }
 *       404: { description: User or bank not found }
 *       409: { description: Email is already in use }
 */
router.patch('/users/:id', requireAuth, requireAdmin, userController.updateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User deleted }
 *       400: { description: Admin cannot delete their own account }
 *       403: { description: Administrator access is required }
 *       404: { description: User not found }
 */
router.delete('/users/:id', requireAuth, requireAdmin, userController.deleteUser);

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
