const test = require('node:test');
const assert = require('node:assert/strict');
const { generateAccountNumber, maskAccountNumber, applyTransfer } = require('../utils/bankAccountUtils');

test('generates a system account number with the expected format', () => {
    const accountNumber = generateAccountNumber(new Set(['123456789012']));
    assert.match(accountNumber, /^\d{12}$/);
    assert.notEqual(accountNumber, '123456789012');
});

test('masks the middle digits of a bank account number', () => {
    assert.equal(maskAccountNumber('123456789012'), '123******012');
    assert.throws(() => maskAccountNumber('12345678901'), /valid 12-digit account number/);
});

test('applies a transfer between accounts and records balances correctly', () => {
    const result = applyTransfer({
        fromBalance: 5000,
        toBalance: 1000,
        amount: 1500,
        fromAccountNumber: '111111111111',
        toAccountNumber: '222222222222',
        descriptor: 'Transfer to savings'
    });

    assert.deepEqual(result, {
        fromBalance: 3500,
        toBalance: 2500,
        entries: [
            {
                accountNumber: '111111111111',
                type: 'transfer_out',
                amount: 1500,
                balanceAfter: 3500,
                description: 'Transfer to savings'
            },
            {
                accountNumber: '222222222222',
                type: 'transfer_in',
                amount: 1500,
                balanceAfter: 2500,
                description: 'Transfer to savings'
            }
        ]
    });
});

test('rejects transfers above the available balance', () => {
    assert.throws(() => applyTransfer({
        fromBalance: 500,
        toBalance: 200,
        amount: 800,
        fromAccountNumber: '111111111111',
        toAccountNumber: '222222222222',
        descriptor: 'Transfer'
    }), /Insufficient funds/);
});
