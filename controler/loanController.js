const mongoose = require('mongoose');
const Bank = require('../modle/Bank');
const BankAccount = require('../modle/BankAccount');
const LoanApplication = require('../modle/LoanApplication');
const User = require('../modle/User');
const { getSystemAnnualInterestRate, calculateLoanTerms, calculateAccruedInterest, allocateRepayment, applyLoanDisbursement } = require('../utils/loanCalculations');

async function listLoans(req, res) {
    try {
        let filter = {};
        if (req.user.role === 'user') {
            filter = { applicant: req.user.id };
        } else if (req.user.role === 'employee') {
            const employee = await User.findById(req.user.id).select('bankId branchId');
            if (!employee?.bankId || !employee?.branchId) return res.status(200).json({ loans: [] });
            filter = { bank: employee.bankId, branchId: employee.branchId };
        } else if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Loan access is not available for this account' });
        }

        const applications = await LoanApplication.find(filter).sort({ createdAt: -1 });
        const seenPendingApplicants = new Set();
        const loans = applications.filter((application) => {
            if (application.status !== 'pending') return true;
            const applicantId = String(application.applicant);
            if (seenPendingApplicants.has(applicantId)) return false;
            seenPendingApplicants.add(applicantId);
            return true;
        });
        return res.status(200).json({ loans, systemAnnualInterestRate: getSystemAnnualInterestRate() });
    } catch (error) {
        console.error('Loan list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load loan applications' });
    }
}

async function createLoan(req, res) {
    const { bankId, branchId, amount, purpose, termMonths, hasExternalLoans, externalLoanDetails } = req.body;
    if (req.user.role !== 'user') return res.status(403).json({ message: 'Only customer accounts can apply for loans' });
    if (hasExternalLoans) return res.status(403).json({ message: 'Applicants with an outstanding loan at another bank are not eligible' });
    if (!mongoose.Types.ObjectId.isValid(bankId) || !mongoose.Types.ObjectId.isValid(branchId)) {
        return res.status(400).json({ message: 'Select a valid bank and sub-branch' });
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ message: 'Enter a positive whole-number RWF amount' });
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 360) return res.status(400).json({ message: 'Loan term must be between 1 and 360 months' });
    if (typeof purpose !== 'string' || !purpose.trim()) return res.status(400).json({ message: 'Loan purpose is required' });
    if (hasExternalLoans && (typeof externalLoanDetails !== 'string' || !externalLoanDetails.trim())) {
        return res.status(400).json({ message: 'Provide details for existing external loans' });
    }

    try {
        const [bank, applicant] = await Promise.all([
            Bank.findById(bankId),
            User.findById(req.user.id).select('name email isVerified')
        ]);
        if (!bank) return res.status(404).json({ message: 'Bank not found' });
        const branch = bank.branches.id(branchId);
        if (!branch) return res.status(404).json({ message: 'Sub-branch not found in this bank' });
        if (!applicant?.isVerified) return res.status(403).json({ message: 'A verified customer account is required' });
        const existingApplication = await LoanApplication.findOne({ applicant: applicant._id }).select('_id');
        if (existingApplication) {
            return res.status(409).json({ message: 'You have already submitted a loan application.' });
        }
        const existingExternalLoan = await LoanApplication.findOne({
            applicant: applicant._id,
            bank: { $ne: bank._id },
            status: { $in: ['approved', 'defaulted'] },
            outstandingPrincipal: { $gt: 0 }
        }).select('_id');
        if (existingExternalLoan) return res.status(403).json({ message: 'An active loan at another bank must be repaid before applying' });
        const bankAccount = await BankAccount.findOne({ userId: applicant._id, bankId: bank._id, branchId: branch._id, status: 'active' }).select('_id');
        if (!bankAccount) return res.status(409).json({ message: 'Create an active bank account at this bank and sub-branch before applying' });

        const loan = await LoanApplication.create({
            applicant: applicant._id,
            applicantName: applicant.name,
            applicantEmail: applicant.email,
            bank: bank._id,
            bankName: bank.bankName,
            branchId: branch._id,
            branchName: branch.branchName,
            amount,
            purpose: purpose.trim(),
            termMonths,
            hasExternalLoans: Boolean(hasExternalLoans),
            externalLoanDetails: hasExternalLoans ? externalLoanDetails.trim() : 'None reported'
        });
        return res.status(201).json({ message: 'Loan application submitted', loan });
    } catch (error) {
        console.error('Loan application creation failed:', error.message);
        return res.status(500).json({ message: 'Unable to submit loan application' });
    }
}

async function canManageLoan(req, loan) {
    if (req.user.role === 'admin') return true;
    if (req.user.role !== 'employee') return false;
    const employee = await User.findById(req.user.id).select('bankId branchId');
    return Boolean(employee?.bankId?.equals(loan.bank) && employee.branchId?.equals(loan.branchId));
}

async function decideLoan(req, res) {
    const { status } = req.body;
    if (!['approved', 'declined'].includes(status)) return res.status(400).json({ message: 'Choose approved or declined' });

    try {
        const loan = await LoanApplication.findById(req.params.loanId);
        if (!loan) return res.status(404).json({ message: 'Loan application not found' });
        if (!await canManageLoan(req, loan)) return res.status(403).json({ message: 'You cannot manage loans for this branch' });
        if (loan.status !== 'pending') return res.status(409).json({ message: 'This loan application has already been reviewed' });

        if (status === 'declined') {
            loan.status = status;
            loan.reviewedBy = req.user.id;
            await loan.save();
            return res.status(200).json({ message: 'Loan declined', loan });
        }

        if (loan.hasExternalLoans) return res.status(409).json({ message: 'This applicant has an outstanding loan at another bank' });
        const annualInterestRate = getSystemAnnualInterestRate();

        const session = await mongoose.startSession();
        let approvedLoan;
        try {
            await session.withTransaction(async () => {
                const currentLoan = await LoanApplication.findById(req.params.loanId).session(session);
                if (!currentLoan) throw Object.assign(new Error('Loan application not found'), { status: 404 });
                if (currentLoan.status !== 'pending') throw Object.assign(new Error('This loan application has already been reviewed'), { status: 409 });

                const otherActiveLoan = await LoanApplication.findOne({
                    applicant: currentLoan.applicant,
                    bank: { $ne: currentLoan.bank },
                    status: { $in: ['approved', 'defaulted'] },
                    outstandingPrincipal: { $gt: 0 }
                }).select('_id').session(session);
                if (otherActiveLoan) throw Object.assign(new Error('An active loan at another bank must be repaid before approval'), { status: 409 });

                const bankAccount = await BankAccount.findOne({
                    userId: currentLoan.applicant,
                    bankId: currentLoan.bank,
                    branchId: currentLoan.branchId,
                    status: 'active'
                }).session(session);
                if (!bankAccount) throw Object.assign(new Error('The applicant needs an active bank account at this bank and sub-branch'), { status: 409 });

                const terms = calculateLoanTerms(currentLoan.amount, annualInterestRate, currentLoan.termMonths);
                const approvedAt = new Date();
                const { balanceAfter } = applyLoanDisbursement(bankAccount.balance, currentLoan.amount);
                bankAccount.balance = balanceAfter;
                bankAccount.transactions.push({
                    type: 'loan_disbursement',
                    amount: currentLoan.amount,
                    balanceAfter,
                    description: `Loan disbursement for application ${currentLoan._id}`
                });
                currentLoan.status = 'approved';
                currentLoan.reviewedBy = req.user.id;
                currentLoan.annualInterestRate = annualInterestRate;
                currentLoan.monthlyPayment = terms.monthlyPayment;
                currentLoan.expectedInterest = terms.expectedInterest;
                currentLoan.outstandingPrincipal = currentLoan.amount;
                currentLoan.approvedAt = approvedAt;
                currentLoan.lastPaymentAt = approvedAt;

                await bankAccount.save({ session });
                await currentLoan.save({ session });
                approvedLoan = currentLoan;
            });
        } finally {
            await session.endSession();
        }

        return res.status(200).json({ message: 'Loan approved and disbursed to the applicant bank account', loan: approvedLoan });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        console.error('Loan decision failed:', error.message);
        return res.status(500).json({ message: 'Unable to update loan decision' });
    }
}

async function recordRepayment(req, res) {
    const { amount } = req.body;
    if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ message: 'Enter a positive whole-number RWF repayment' });

    try {
        const loan = await LoanApplication.findById(req.params.loanId);
        if (!loan) return res.status(404).json({ message: 'Loan application not found' });
        if (!await canManageLoan(req, loan)) return res.status(403).json({ message: 'You cannot record repayments for this branch' });
        if (loan.status !== 'approved') return res.status(409).json({ message: 'Repayments can only be recorded for approved loans' });

        const paidAt = new Date();
        const interestDue = loan.unpaidInterest + calculateAccruedInterest(loan.outstandingPrincipal, loan.annualInterestRate, loan.lastPaymentAt || loan.approvedAt, paidAt);
        const allocation = allocateRepayment(amount, loan.outstandingPrincipal, interestDue);
        loan.repayments.push({ amount, interestPortion: allocation.interestPortion, principalPortion: allocation.principalPortion, recordedBy: req.user.id, paidAt });
        loan.interestIncome += allocation.interestPortion;
        loan.principalRecovered += allocation.principalPortion;
        loan.outstandingPrincipal = allocation.remainingPrincipal;
        loan.unpaidInterest = allocation.remainingInterest;
        loan.lastPaymentAt = paidAt;
        if (loan.outstandingPrincipal === 0) loan.status = 'repaid';
        await loan.save();
        return res.status(200).json({ message: 'Repayment recorded', loan });
    } catch (error) {
        if (error.message === 'Repayment exceeds the current balance due') return res.status(400).json({ message: error.message });
        console.error('Loan repayment failed:', error.message);
        return res.status(500).json({ message: 'Unable to record repayment' });
    }
}

async function markLoanDefaulted(req, res) {
    try {
        const loan = await LoanApplication.findById(req.params.loanId);
        if (!loan) return res.status(404).json({ message: 'Loan application not found' });
        if (!await canManageLoan(req, loan)) return res.status(403).json({ message: 'You cannot manage loans for this branch' });
        if (loan.status !== 'approved') return res.status(409).json({ message: 'Only approved loans can be marked defaulted' });

        loan.loss = loan.outstandingPrincipal;
        loan.status = 'defaulted';
        loan.defaultedAt = new Date();
        loan.reviewedBy = req.user.id;
        await loan.save();
        return res.status(200).json({ message: 'Loan marked as defaulted', loan });
    } catch (error) {
        console.error('Loan default update failed:', error.message);
        return res.status(500).json({ message: 'Unable to mark loan as defaulted' });
    }
}

module.exports = { listLoans, createLoan, decideLoan, recordRepayment, markLoanDefaulted };