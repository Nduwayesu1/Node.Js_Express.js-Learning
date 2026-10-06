const express = require('express');
const payrollController = require('../controler/payrollController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/payroll/banks', requireAuth, payrollController.listFinanceBanks);
router.get('/payroll/banks/:bankId/branches/:branchId/employees', requireAuth, payrollController.listEligibleEmployees);
router.get('/payroll/banks/:bankId/batches', requireAuth, payrollController.listBatches);
router.post('/payroll/batches', requireAuth, payrollController.createBatch);

module.exports = router;