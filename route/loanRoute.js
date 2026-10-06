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
 *     description: Customer must have an active account at the selected bank and branch, be verified, have no existing application, and have no outstanding loan at another bank.
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
 *     summary: Record a repayment against an approved loan
 *     description: The repayment is allocated to accrued interest before principal.
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
 *             required: [amount]
 *             properties:
 *               amount: { type: integer, minimum: 1, example: 5000 }
 *     responses:
 *       200: { description: Repayment recorded }
 *       400: { description: Invalid amount or repayment exceeds the balance due }
 *       403: { description: Caller cannot record repayments for this branch }
 *       404: { description: Loan application not found }
 *       409: { description: Loan is not approved }
 */
router.post('/loans/:loanId/repayments', requireAuth, loanController.recordRepayment);

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