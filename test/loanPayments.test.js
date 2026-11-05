const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../modle/User');
const { canManageLoan, canRepayOwnLoan, validateStaffRepaymentInput } = require('../controler/loanController');

test('customers and employees may repay only their own loans', () => {
    assert.equal(canRepayOwnLoan('user'), true);
    assert.equal(canRepayOwnLoan('employee'), true);
    assert.equal(canRepayOwnLoan('admin'), false);
    assert.equal(canRepayOwnLoan('guest'), false);
});

test('staff repayment recording requires a valid amount, received-payment method, and confirmation', () => {
    assert.equal(validateStaffRepaymentInput({
        amount: 5000,
        paymentChannel: 'cash',
        confirmed: true
    }), null);
    assert.equal(validateStaffRepaymentInput({
        amount: 5000,
        paymentChannel: 'mobile_money',
        confirmed: true
    }), null);
    assert.equal(validateStaffRepaymentInput({
        amount: 5000,
        paymentChannel: 'bank_transfer',
        confirmed: true
    }), null);
    assert.equal(validateStaffRepaymentInput({
        amount: 0,
        paymentChannel: 'cash',
        confirmed: true
    }), 'Enter a positive whole-number RWF repayment');
    assert.equal(validateStaffRepaymentInput({
        amount: 5000,
        paymentChannel: 'unsupported',
        confirmed: true
    }), 'Choose a valid payment method');
    assert.equal(validateStaffRepaymentInput({
        amount: 5000,
        paymentChannel: 'cash',
        confirmed: false
    }), 'Confirm that the customer payment has already been received');
});

test('only Bank Admins and Sub-branch Managers can record repayments within their scope', async () => {
    const originalFindById = User.findById;
    const bankId = new mongoose.Types.ObjectId();
    const otherBankId = new mongoose.Types.ObjectId();
    const branchId = new mongoose.Types.ObjectId();
    const otherBranchId = new mongoose.Types.ObjectId();
    const loan = { bank: bankId, branchId };
    let employee;

    User.findById = () => ({ select: async () => employee });
    try {
        employee = { staffRole: 'bank_admin', bankId };
        assert.equal(await canManageLoan({ user: { role: 'employee', id: 'bank-admin' } }, { bank: bankId, branchId: otherBranchId }), true);
        assert.equal(await canManageLoan({ user: { role: 'employee', id: 'bank-admin' } }, { bank: otherBankId, branchId }), false);

        employee = { staffRole: 'branch_manager', bankId, branchId };
        assert.equal(await canManageLoan({ user: { role: 'employee', id: 'branch-manager' } }, loan), true);
        assert.equal(await canManageLoan({ user: { role: 'employee', id: 'branch-manager' } }, { bank: bankId, branchId: otherBranchId }), false);

        employee = { staffRole: 'general_manager', bankId, branchId };
        assert.equal(await canManageLoan({ user: { role: 'employee', id: 'general-manager' } }, loan), false);
        employee = { bankId, branchId };
        assert.equal(await canManageLoan({ user: { role: 'employee', id: 'unassigned' } }, loan), false);
        assert.equal(await canManageLoan({ user: { role: 'admin', id: 'admin' } }, loan), true);
    } finally {
        User.findById = originalFindById;
    }
});
