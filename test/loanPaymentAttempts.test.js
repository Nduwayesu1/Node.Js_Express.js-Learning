const test = require('node:test');
const assert = require('node:assert/strict');
const LoanApplication = require('../modle/LoanApplication');
const LoanPaymentAttempt = require('../modle/LoanPaymentAttempt');
const { paymentAttemptMatches } = require('../controler/loanController');

const payment = {
    loan: 'loan-1',
    amount: 5000,
    channel: 'bank_account',
    accountId: 'account-1'
};

test('payment idempotency compares the loan, amount, channel, and source account', () => {
    assert.equal(paymentAttemptMatches(payment, {
        loanId: 'loan-1',
        amount: 5000,
        channel: 'bank_account',
        accountId: 'account-1'
    }), true);
    assert.equal(paymentAttemptMatches(payment, {
        loanId: 'loan-1',
        amount: 5000,
        channel: 'bank_account',
        accountId: 'account-2'
    }), false);
    assert.equal(paymentAttemptMatches(payment, {
        loanId: 'loan-1',
        amount: 6000,
        channel: 'bank_account',
        accountId: 'account-1'
    }), false);
});

test('payment schemas allow account transfers and Airtel simulation channel values', () => {
    const attemptChannels = LoanPaymentAttempt.schema.path('channel').enumValues;
    const repaymentModes = LoanApplication.schema.path('repayments.0.paymentMode').enumValues;

    assert.ok(attemptChannels.includes('airtel_mobile_money'));
    assert.ok(attemptChannels.includes('bank_account'));
    assert.ok(repaymentModes.includes('account_transfer'));
});
