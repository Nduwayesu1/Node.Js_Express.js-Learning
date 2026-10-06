const express = require('express');
const loanController = require('../controler/loanController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/loans', requireAuth, loanController.listLoans);
router.post('/loans', requireAuth, loanController.createLoan);
router.patch('/loans/:loanId/decision', requireAuth, loanController.decideLoan);
router.post('/loans/:loanId/repayments', requireAuth, loanController.recordRepayment);
router.patch('/loans/:loanId/default', requireAuth, loanController.markLoanDefaulted);

module.exports = router;