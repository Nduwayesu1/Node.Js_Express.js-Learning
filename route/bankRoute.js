const express = require('express');
const bankController = require('../controler/bankController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.head('/payments/paypack/webhook', bankController.paypackWebhook);
router.post('/payments/paypack/webhook', bankController.paypackWebhook);
router.get('/banks/available', requireAuth, bankController.listAvailableBanks);
router.get('/banks', requireAuth, requireAdmin, bankController.listBanks);
router.post('/banks', requireAuth, requireAdmin, bankController.createBank);
router.post('/banks/:bankId/branches', requireAuth, requireAdmin, bankController.addBranch);

router.get('/bank-accounts', requireAuth, bankController.listBankAccounts);
router.get('/bank-accounts/me', requireAuth, bankController.listBankAccountsForUser);
router.get('/bank-accounts/recipients/:accountNumber', requireAuth, bankController.lookupTransferRecipient);
router.post('/bank-accounts', requireAuth, bankController.createBankAccount);
router.post('/bank-accounts/:accountId/deposits', requireAuth, bankController.depositToBankAccount);
router.patch('/bank-accounts/:accountId/status', requireAuth, bankController.updateBankAccountStatus);
router.post('/bank-accounts/transfer', requireAuth, bankController.transferBetweenAccounts);
router.get('/bank-accounts/:accountId/transactions', requireAuth, bankController.getBankAccountTransactions);

module.exports = router;
