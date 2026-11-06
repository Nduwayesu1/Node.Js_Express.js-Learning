const express = require('express');
const loanController = require('../controler/loanController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/loans:
 *   get:
 *     summary: List loan applications visible to the caller
 *     description: Customers see their applications, employees see loans for their assigned branch, and administrators see all applications.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Applications and configured annual interest rate returned }
 *       403: { description: Loan access is not available for this account }
 */
router.get('/loans', requireAuth, loanController.listLoans);

/**
 * @swagger
 * /api/loans:
 *   post:
 *     summary: Submit a loan application
 *     description: Customers and employees may apply for themselves with an active account at the selected bank and branch. Customers must be verified and approved members of their selected bank; employees must be verified and choose only their assigned bank and sub-branch (Bank Admins may choose any branch within their bank). Applicants may have only one application and no outstanding loan at another bank.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bankId, branchId, amount, purpose, termMonths]
 *             properties:
 *               bankId: { type: string }
 *               branchId: { type: string }
 *               amount: { type: integer, minimum: 1, example: 100000 }
 *               purpose: { type: string, example: Small business inventory }
 *               termMonths: { type: integer, minimum: 1, maximum: 360, example: 12 }
 *               hasExternalLoans: { type: boolean, default: false }
 *               externalLoanDetails: { type: string }
 *     responses:
 *       201: { description: Loan application submitted }
 *       400: { description: Invalid bank, branch, amount, term, or purpose }
 *       403: { description: Caller is not eligible to apply }
 *       404: { description: Bank or branch not found }
 *       409: { description: Existing application or required active bank account }
 */
router.post('/loans', requireAuth, loanController.createLoan);

/**
 * @swagger
 * /api/loans/{loanId}/decision:
 *   patch:
 *     summary: Approve or decline a loan application
 *     description: Administrators and employees assigned to the loan's branch may review pending applications. Approval uses the configured system rate and disburses funds to the applicant's bank account.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loanId
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
 *               status: { type: string, enum: [approved, declined] }
 *     responses:
 *       200: { description: Application reviewed }
 *       400: { description: Decision must be approved or declined }
 *       403: { description: Caller cannot manage loans for this branch }
 *       404: { description: Application not found }
 *       409: { description: Application was already reviewed or applicant is ineligible }
 */
router.patch('/loans/:loanId/decision', requireAuth, loanController.decideLoan);

/**
 * @swagger
 * /api/loans/{loanId}/repayments:
 *   post:
 *     summary: Record a customer repayment received by bank staff
 *     description: System Admins, Bank Admins, and Sub-branch Managers with access to the loan may record a payment already received from the customer. This does not debit an account. The repayment is allocated to accrued interest before principal and receives a receipt number.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, paymentChannel, confirmed]
 *             properties:
 *               amount: { type: integer, minimum: 1, example: 5000 }
 *               paymentChannel: { type: string, enum: [cash, mobile_money, bank_transfer] }
 *               confirmed: { type: boolean, enum: [true], description: Confirm that the customer's payment has already been received }
 *     responses:
 *       200: { description: Repayment recorded with a receipt number }
 *       400: { description: Invalid amount, payment method, missing confirmation, or repayment exceeds the balance due }
 *       403: { description: Caller cannot record repayments for this branch }
 *       404: { description: Loan application not found }
 *       409: { description: Loan is not approved }
 */
router.post('/loans/:loanId/repayments', requireAuth, loanController.recordRepayment);

/**
 * @swagger
 * /api/loans/{loanId}/virtual-payments:
 *   post:
 *     summary: Simulate a borrower loan repayment
 *     description: Test-only virtual payment processing. A successful simulation updates the loan ledger and issues a receipt but moves no real funds and does not debit a bank or mobile-money account.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, channel, idempotencyKey]
 *             properties:
 *               amount: { type: integer, minimum: 1, example: 5000 }
 *               channel: { type: string, enum: [mtn_mobile_money, airtel_mobile_money, bank_transfer, virtual_account] }
 *               idempotencyKey: { type: string, format: uuid }
 *               simulateFailure: { type: boolean, default: false }
 *     responses:
 *       200: { description: Virtual payment succeeded; receipt and updated loan returned }
 *       400: { description: Invalid payment or repayment exceeds the balance due }
 *       402: { description: Virtual payment declined by the simulator }
 *       403: { description: Authenticated user is not the loan applicant }
 *       409: { description: Payment request key conflict or loan is not approved }
 *       503: { description: Payment simulator is unavailable or not configured }
 */
router.post('/loans/:loanId/virtual-payments', requireAuth, loanController.payLoanWithVirtualSimulator);

/**
 * @swagger
 * /api/loans/{loanId}/account-payments:
 *   post:
 *     summary: Repay an approved loan from the customer's bank account
 *     description: Debits an active account owned by the loan applicant at the same bank and sub-branch as the loan. The debit and loan ledger update are committed atomically.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loanId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, accountId, idempotencyKey]
 *             properties:
 *               amount: { type: integer, minimum: 1, example: 5000 }
 *               accountId: { type: string, example: 65f1a3b2c4d5e6f789012345 }
 *               idempotencyKey: { type: string, format: uuid }
 *     responses:
 *       200: { description: Account debited and loan repayment recorded }
 *       400: { description: Invalid payment or account does not match the loan }
 *       403: { description: Authenticated user is not the loan applicant }
 *       404: { description: Loan application not found }
 *       409: { description: Insufficient funds, request key conflict, or loan is not approved }
 */
router.post('/loans/:loanId/account-payments', requireAuth, loanController.payLoanFromAccount);

/**
 * @swagger
 * /api/loans/{loanId}/default:
 *   patch:
 *     summary: Mark an approved loan as defaulted
 *     description: Records remaining principal as a loss.
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loanId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Loan marked as defaulted }
 *       403: { description: Caller cannot manage loans for this branch }
 *       404: { description: Loan application not found }
 *       409: { description: Only approved loans can be defaulted }
 */
router.patch('/loans/:loanId/default', requireAuth, loanController.markLoanDefaulted);

module.exports = router;