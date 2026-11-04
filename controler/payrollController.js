const mongoose = require('mongoose');
const Bank = require('../modle/Bank');
const PayrollBatch = require('../modle/PayrollBatch');
const User = require('../modle/User');

async function findFinanceBank(req, bankId) {
    const employee = await User.findById(req.user.id).select('role staffRole bankId branchId');
    if (employee?.role !== 'employee' || employee.staffRole !== 'finance_manager') {
        return { error: { status: 403, message: 'Finance Manager access is required' } };
    }
    if (!employee.bankId || !employee.branchId || !employee.bankId.equals(bankId)) {
        return { error: { status: 403, message: 'Your Finance Manager account is not assigned to this bank sub-branch' } };
    }
    const bank = await Bank.findById(bankId);
    if (!bank) return { error: { status: 404, message: 'Bank not found' } };
    const branch = bank.branches.id(employee.branchId);
    if (!branch) {
        return { error: { status: 404, message: 'Your assigned sub-branch was not found in this bank' } };
    }
    return { bank, employee, branch };
}

async function listFinanceBanks(req, res) {
    try {
        const financeUser = await User.findById(req.user.id).select('role staffRole bankId branchId');
        if (financeUser?.role !== 'employee' || financeUser.staffRole !== 'finance_manager') {
            return res.status(403).json({ message: 'Finance Manager access is required' });
        }
        if (!financeUser.bankId || !financeUser.branchId) return res.status(200).json({ banks: [] });
        const bank = await Bank.findById(financeUser.bankId);
        if (!bank) return res.status(200).json({ banks: [] });
        const branch = bank.branches.id(financeUser.branchId);
        if (!branch) return res.status(404).json({ message: 'Your assigned sub-branch was not found in this bank' });
        bank.branches = [branch];
        return res.status(200).json({ banks: [bank] });
    } catch (error) {
        console.error('Finance bank list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load assigned banks' });
    }
}

async function listEligibleEmployees(req, res) {
    try {
        const result = await findFinanceBank(req, req.params.bankId);
        if (result.error) return res.status(result.error.status).json({ message: result.error.message });
        const branch = result.bank.branches.id(req.params.branchId);
        if (!branch || !branch._id.equals(result.employee.branchId)) {
            return res.status(403).json({ message: 'You can only view payroll employees in your assigned sub-branch' });
        }
        const employees = await User.find({
            role: 'employee',
            isVerified: true,
            bankId: result.bank._id,
            branchId: branch._id,
            _id: { $ne: req.user.id }
        })
            .select('_id name email')
            .sort({ name: 1 });
        return res.status(200).json({ employees });
    } catch (error) {
        console.error('Payroll employee list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load employees' });
    }
}

async function listBatches(req, res) {
    try {
        const result = await findFinanceBank(req, req.params.bankId);
        if (result.error) return res.status(result.error.status).json({ message: result.error.message });
        const batches = await PayrollBatch.find({ bank: result.bank._id, branchId: result.branch._id }).sort({ createdAt: -1 });
        return res.status(200).json({ batches });
    } catch (error) {
        console.error('Payroll batch list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load payroll batches' });
    }
}

async function createBatch(req, res) {
    const { bankId, branchId, amount, employeeIds } = req.body;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Enter a positive whole-number RWF amount' });
    }
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({ message: 'Select at least one employee' });
    }
    if (new Set(employeeIds).size !== employeeIds.length) {
        return res.status(400).json({ message: 'An employee can only appear once in a batch' });
    }
    if (!employeeIds.every(employeeId => mongoose.Types.ObjectId.isValid(employeeId))) {
        return res.status(400).json({ message: 'Employee selection contains an invalid account' });
    }

    try {
        const result = await findFinanceBank(req, bankId);
        if (result.error) return res.status(result.error.status).json({ message: result.error.message });
        const branch = result.bank.branches.id(branchId);
        if (!branch || !branch._id.equals(result.employee.branchId)) {
            return res.status(403).json({ message: 'You can only queue payroll for your assigned sub-branch' });
        }

        const employees = await User.find({
            _id: { $in: employeeIds },
            role: 'employee',
            isVerified: true,
            bankId: result.bank._id,
            branchId: branch._id
        }).select('_id name email');
        if (employees.length !== employeeIds.length) {
            return res.status(400).json({ message: 'Every recipient must be a verified employee account' });
        }
        const totalAmount = amount * employees.length;
        if (!Number.isSafeInteger(totalAmount)) return res.status(400).json({ message: 'Payroll batch total is too large' });

        const batch = await PayrollBatch.create({
            bank: result.bank._id,
            branchId: branch._id,
            bankName: result.bank.bankName,
            branchName: branch.branchName,
            amount,
            totalAmount,
            employees: employees.map(employee => ({ employee: employee._id, name: employee.name, email: employee.email })),
            status: 'queued',
            createdBy: req.user.id
        });
        return res.status(201).json({ message: 'Payroll batch queued for processing', batch });
    } catch (error) {
        console.error('Payroll batch creation failed:', error.message);
        return res.status(500).json({ message: 'Unable to queue payroll batch' });
    }
}

module.exports = { listFinanceBanks, listEligibleEmployees, listBatches, createBatch };