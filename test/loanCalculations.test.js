const test = require('node:test');
const assert = require('node:assert/strict');
const { getSystemAnnualInterestRate, calculateLoanTerms, calculateAccruedInterest, allocateRepayment, applyLoanDisbursement } = require('../utils/loanCalculations');

test('uses the system annual interest rate or its default', () => {
    const previousRate = process.env.SYSTEM_ANNUAL_INTEREST_RATE;
    try {
        delete process.env.SYSTEM_ANNUAL_INTEREST_RATE;
        assert.equal(getSystemAnnualInterestRate(), 12);
        process.env.SYSTEM_ANNUAL_INTEREST_RATE = '8.5';
        assert.equal(getSystemAnnualInterestRate(), 8.5);
        process.env.SYSTEM_ANNUAL_INTEREST_RATE = '101';
        assert.throws(() => getSystemAnnualInterestRate(), /between 0 and 100/);
    } finally {
        if (previousRate === undefined) delete process.env.SYSTEM_ANNUAL_INTEREST_RATE;
        else process.env.SYSTEM_ANNUAL_INTEREST_RATE = previousRate;
    }
});

test('calculates reducing-balance installments and total interest', () => {
    assert.deepEqual(calculateLoanTerms(100000, 12, 12), { monthlyPayment: 8885, expectedInterest: 6619 });
});

test('zero-interest loans do not add interest', () => {
    assert.deepEqual(calculateLoanTerms(12000, 0, 12), { monthlyPayment: 1000, expectedInterest: 0 });
});

test('accrues interest by elapsed days and allocates repayments interest-first', () => {
    const interest = calculateAccruedInterest(100000, 12, '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    assert.equal(interest, 11992);
    assert.deepEqual(allocateRepayment(15000, 100000, interest), {
        interestPortion: 11992,
        principalPortion: 3008,
        remainingInterest: 0,
        remainingPrincipal: 96992
    });
});

test('carries unpaid accrued interest into the next balance', () => {
    assert.deepEqual(allocateRepayment(5000, 100000, 12000), {
        interestPortion: 5000,
        principalPortion: 0,
        remainingInterest: 7000,
        remainingPrincipal: 100000
    });
});

test('rejects repayments above the balance due', () => {
    assert.throws(() => allocateRepayment(1200, 1000, 100), /exceeds the current balance due/);
});

test('adds an approved loan to the account balance', () => {
    assert.deepEqual(applyLoanDisbursement(2500, 100000), { balanceAfter: 102500 });
});

test('rejects loan disbursements that exceed safe account balance', () => {
    assert.throws(() => applyLoanDisbursement(Number.MAX_SAFE_INTEGER, 1), /safe account balance/);
});