const express = require('express');
const payrollController = require('../controler/payrollController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/payroll/banks:
 *   get:
 *     summary: List banks assigned to the Finance Manager
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Assigned banks returned, or an empty list if none are assigned }
 *       403: { description: Finance Manager access is required }
 */
router.get('/payroll/banks', requireAuth, payrollController.listFinanceBanks);

/**
 * @swagger
 * /api/payroll/banks/{bankId}/branches/{branchId}/employees:
 *   get:
 *     summary: List verified employees eligible for payroll at a branch
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Eligible employees returned }
 *       403: { description: Caller is not the Finance Manager assigned to this bank }
 *       404: { description: Bank or branch not found }
 */
router.get('/payroll/banks/:bankId/branches/:branchId/employees', requireAuth, payrollController.listEligibleEmployees);

/**
 * @swagger
 * /api/payroll/banks/{bankId}/batches:
 *   get:
 *     summary: List payroll batches for a bank
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Payroll batches returned }
 *       403: { description: Caller is not the Finance Manager assigned to this bank }
 *       404: { description: Bank not found }
 */
router.get('/payroll/banks/:bankId/batches', requireAuth, payrollController.listBatches);

/**
 * @swagger
 * /api/payroll/batches:
 *   post:
 *     summary: Queue a payroll batch
 *     description: A batch pays the same whole-number RWF amount to each selected verified employee at the selected branch. Employee identifiers must be unique.
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bankId, branchId, amount, employeeIds]
 *             properties:
 *               bankId: { type: string }
 *               branchId: { type: string }
 *               amount: { type: integer, minimum: 1, example: 50000 }
 *               employeeIds:
 *                 type: array
 *                 minItems: 1
 *                 uniqueItems: true
 *                 items: { type: string }
 *     responses:
 *       201: { description: Payroll batch queued }
 *       400: { description: Invalid amount, branch, or employee selection }
 *       403: { description: Caller is not the Finance Manager assigned to this bank }
 *       404: { description: Bank or branch not found }
 */
router.post('/payroll/batches', requireAuth, payrollController.createBatch);

module.exports = router;