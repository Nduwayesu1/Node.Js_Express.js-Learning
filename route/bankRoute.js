const express = require('express');
const bankController = require('../controler/bankController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/payments/paypack/webhook:
 *   post:
 *     summary: Receive a Paypack transaction event
 *     description: Validates the provider signature and payment details before crediting an account. Replayed success events do not credit twice.
 *     tags: [Payments]
 *     parameters:
 *       - in: header
 *         name: X-Paypack-Signature
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, data]
 *             properties:
 *               kind: { type: string, example: transaction:processed }
 *               data:
 *                 type: object
 *                 properties:
 *                   ref: { type: string }
 *                   kind: { type: string, enum: [CASHIN] }
 *                   amount: { type: number }
 *                   client: { type: string, example: '0781234567' }
 *                   status: { type: string, example: successful }
 *     responses:
 *       200: { description: Payment confirmed or marked failed }
 *       202: { description: Event ignored or payment still processing }
 *       400: { description: Event does not match the pending payment }
 *       401: { description: Invalid webhook signature }
 *       404: { description: Payment reference not found }
 */
router.head('/payments/paypack/webhook', bankController.paypackWebhook);
router.post('/payments/paypack/webhook', bankController.paypackWebhook);

/**
 * @swagger
 * /api/banks/available:
 *   get:
 *     summary: List banks and branches available to customers
 *     tags: [Banks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Available banks returned }
 *       403: { description: Customer access is required }
 */
router.get('/banks/available', requireAuth, bankController.listAvailableBanks);

/**
 * @swagger
 * /api/banks:
 *   get:
 *     summary: List banks
 *     tags: [Banks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Banks returned }
 *       403: { description: Administrator access is required }
 */
router.get('/banks', requireAuth, requireAdmin, bankController.listBanks);

/**
 * @swagger
 * /api/banks:
 *   post:
 *     summary: Create a bank
 *     tags: [Banks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bankName, leadership]
 *             properties:
 *               bankName: { type: string }
 *               leadership:
 *                 type: object
 *                 required: [generalManager, hrManager, financeManager, accountsManager]
 *                 properties:
 *                   generalManager: { type: string }
 *                   hrManager: { type: string }
 *                   financeManager:
 *                     type: object
 *                     required: [name, email]
 *                     properties:
 *                       name: { type: string }
 *                       email: { type: string, format: email }
 *                   accountsManager: { type: string }
 *     responses:
 *       201: { description: Bank created with a generated account number }
 *       400: { description: Required bank or leadership information is missing }
 *       403: { description: Administrator access is required }
 */
router.post('/banks', requireAuth, requireAdmin, bankController.createBank);

/**
 * @swagger
 * /api/banks/{bankId}/branches:
 *   post:
 *     summary: Add a branch to a bank
 *     tags: [Banks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchName, branchManager, location]
 *             properties:
 *               branchName: { type: string }
 *               branchManager: { type: string }
 *               location:
 *                 type: object
 *                 required: [province, district, sector, cell, village]
 *                 properties:
 *                   province: { type: string }
 *                   district: { type: string }
 *                   sector: { type: string }
 *                   cell: { type: string }
 *                   village: { type: string }
 *     responses:
 *       201: { description: Branch added with a generated branch code }
 *       400: { description: Branch details or location are invalid }
 *       404: { description: Bank not found }
 *       403: { description: Administrator access is required }
 */
router.post('/banks/:bankId/branches', requireAuth, requireAdmin, bankController.addBranch);

/**
 * @swagger
 * /api/bank-accounts:
 *   get:
 *     summary: List bank accounts visible to the authenticated user
 *     description: Customers see their accounts; employees see assigned branch accounts; admins can filter by bank.
 *     tags: [Bank Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: bankId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Accounts returned }
 *       400: { description: Invalid bank identifier }
 *       403: { description: Caller cannot access these accounts }
 */
router.get('/bank-accounts', requireAuth, bankController.listBankAccounts);

/**
 * @swagger
 * /api/bank-accounts/me:
 *   get:
 *     summary: List the authenticated customer's own accounts
 *     tags: [Bank Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Customer accounts returned }
 */
router.get('/bank-accounts/me', requireAuth, bankController.listBankAccountsForUser);

/**
 * @swagger
 * /api/bank-accounts/recipients/{accountNumber}:
 *   get:
 *     summary: Verify a transfer recipient
 *     description: Returns the recipient name and account number masked to its first and last three digits.
 *     tags: [Transfers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountNumber
 *         required: true
 *         description: Full 12-digit account number
 *         schema: { type: string, pattern: '^[0-9]{12}$', example: '123456789012' }
 *     responses:
 *       200:
 *         description: Active recipient verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recipient:
 *                   type: object
 *                   properties:
 *                     name: { type: string, example: Jane Doe }
 *                     accountNumber: { type: string, example: '123******012' }
 *       400: { description: Invalid account number }
 *       404: { description: Active recipient account not found }
 */
router.get('/bank-accounts/recipients/:accountNumber', requireAuth, bankController.lookupTransferRecipient);

/**
 * @swagger
 * /api/bank-accounts:
 *   post:
 *     summary: Open a bank account
 *     tags: [Bank Accounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bankId, branchId, accountName]
 *             properties:
 *               bankId: { type: string }
 *               branchId: { type: string }
 *               accountName: { type: string, example: My savings }
 *     responses:
 *       201: { description: Account created with a generated 12-digit number }
 *       400: { description: Bank, branch, or account name is invalid }
 *       404: { description: Bank not found }
 */
router.post('/bank-accounts', requireAuth, bankController.createBankAccount);

/**
 * @swagger
 * /api/bank-accounts/{accountId}/deposits:
 *   post:
 *     summary: Start a Paypack mobile-money deposit
 *     description: The account is credited only after a valid Paypack webhook. Requires Paypack credentials in the backend environment.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, phoneNumber]
 *             properties:
 *               amount: { type: integer, minimum: 1, example: 5000 }
 *               phoneNumber: { type: string, example: '0781234567' }
 *     responses:
 *       202: { description: Payment initiated and awaiting mobile-money approval }
 *       400: { description: Invalid amount, phone number, or inactive account }
 *       403: { description: Account is not owned by the caller }
 *       404: { description: Account not found }
 *       409: { description: Account already has a pending payment }
 *       503: { description: Paypack is not configured on the backend }
 *       502: { description: Paypack rejected or did not confirm the request }
 */
router.post('/bank-accounts/:accountId/deposits', requireAuth, bankController.depositToBankAccount);

/**
 * @swagger
 * /api/bank-accounts/{accountId}/status:
 *   patch:
 *     summary: Activate or deactivate a bank account
 *     tags: [Bank Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       200: { description: Account status changed }
 *       400: { description: Invalid status or account identifier }
 *       403: { description: Admin or assigned bank-manager access is required }
 *       404: { description: Account not found }
 */
router.patch('/bank-accounts/:accountId/status', requireAuth, bankController.updateBankAccountStatus);

/**
 * @swagger
 * /api/bank-accounts/transfer:
 *   post:
 *     summary: Transfer funds between bank accounts
 *     description: Transfers whole-number RWF between active accounts. Verify the recipient first with GET /api/bank-accounts/recipients/{accountNumber}.
 *     tags: [Transfers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromAccountId, toAccountNumber, amount]
 *             properties:
 *               fromAccountId: { type: string }
 *               toAccountNumber: { type: string, pattern: '^[0-9]{12}$', example: '123456789012' }
 *               amount: { type: integer, minimum: 1, example: 2500 }
 *               description: { type: string, maxLength: 120, example: Rent payment }
 *     responses:
 *       200: { description: Transfer completed }
 *       400: { description: Invalid transfer, inactive/same account, or insufficient funds }
 *       403: { description: Caller does not own the source account }
 *       404: { description: Source or recipient account not found }
 */
router.post('/bank-accounts/transfer', requireAuth, bankController.transferBetweenAccounts);

/**
 * @swagger
 * /api/bank-accounts/{accountId}/transactions:
 *   get:
 *     summary: Get an account's transaction history
 *     tags: [Bank Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Account and transactions returned }
 *       403: { description: Caller cannot access this account }
 *       404: { description: Account not found }
 */
router.get('/bank-accounts/:accountId/transactions', requireAuth, bankController.getBankAccountTransactions);

module.exports = router;
