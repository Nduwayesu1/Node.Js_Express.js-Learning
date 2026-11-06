const mongoose = require('mongoose');
const crypto = require('crypto');
const Bank = require('../modle/Bank');
const BankAccount = require('../modle/BankAccount');
const LoanApplication = require('../modle/LoanApplication');
const LoanPaymentAttempt = require('../modle/LoanPaymentAttempt');
const User = require('../modle/User');
const { getSystemAnnualInterestRate, calculateLoanTerms, calculateAccruedInterest, allocateRepayment, applyLoanDisbursement } = require('../utils/loanCalculations');
const { requestVirtualPayment } = require('../utils/virtualPaymentClient');

const STAFF_REPAYMENT_CHANNELS = new Set(['cash', 'mobile_money', 'bank_transfer']);

function canApplyForLoan(role) {
    return role === 'user' || role === 'employee';
}

function canEmployeeApplyAt(employee, bankId, branchId) {
    if (employee?.role !== 'employee' || employee.isActive === false || !employee.bankId
        || String(employee.bankId) !== String(bankId)) return false;
    if (employee.branchId) return String(employee.branchId) === String(branchId);
    return employee.staffRole === 'bank_admin';
}

async function listLoans(req, res) {
    try {
        let filter = {};
        if (req.user.role === 'user') {
            filter = { applicant: req.user.id };
        } else if (req.user.role === 'employee') {
            const employee = await User.findById(req.user.id).select('bankId branchId staffRole');
            const filters = [{ applicant: req.user.id }];
            const staffRole = employee?.staffRole;
            if (['bank_admin', 'branch_manager', 'general_manager'].includes(staffRole)
                && employee?.bankId && (staffRole === 'bank_admin' || employee.branchId)) {
                filters.push(staffRole === 'bank_admin'
                    ? { bank: employee.bankId }
                    : { bank: employee.bankId, branchId: employee.branchId });
            }
            filter = { $or: filters };
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
    if (!canApplyForLoan(req.user.role)) return res.status(403).json({ message: 'Only customers and employees can apply for loans' });
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
        const applicantQuery = req.user.role === 'employee'
            ? User.findById(req.user.id).select('name email role staffRole bankId branchId isVerified isActive')
            : User.findById(req.user.id).select('name email role isVerified isApproved customerBankId');
        const [bank, applicant] = await Promise.all([
            Bank.findById(bankId),
            applicantQuery
        ]);
        if (!bank) return res.status(404).json({ message: 'Bank not found' });
        const branch = bank.branches.id(branchId);
        if (!branch) return res.status(404).json({ message: 'Sub-branch not found in this bank' });
        if (!applicant?.isVerified) return res.status(403).json({ message: 'A verified account is required to apply for a loan' });
        if (req.user.role === 'user') {
            if (!applicant.isApproved) return res.status(403).json({ message: 'Your bank membership must be approved before applying for a loan' });
            if (applicant.customerBankId && !applicant.customerBankId.equals(bank._id)) {
                return res.status(403).json({ message: 'You can only apply for a loan at the bank you registered with' });
            }
        } else {
            if (!canEmployeeApplyAt(applicant, bank._id, branch._id)) {
                return res.status(403).json({ message: 'You can only apply for a loan at your assigned bank while your employee account is active' });
            }
            if (applicant.branchId && !applicant.branchId.equals(branch._id)) return res.status(403).json({ message: 'You can only apply for a loan at your assigned sub-branch' });
        }
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
    const employee = await User.findById(req.user.id).select('bankId branchId staffRole');
    if (employee?.staffRole === 'bank_admin') return Boolean(employee.bankId?.equals(loan.bank));
    return Boolean(employee?.staffRole === 'branch_manager'
        && employee.bankId?.equals(loan.bank) && employee.branchId?.equals(loan.branchId));
}

function validateStaffRepaymentInput({ amount, paymentChannel, confirmed }) {
    if (!Number.isSafeInteger(amount) || amount <= 0) return 'Enter a positive whole-number RWF repayment';
    if (!STAFF_REPAYMENT_CHANNELS.has(paymentChannel)) return 'Choose a valid payment method';
    if (confirmed !== true) return 'Confirm that the customer payment has already been received';
    return null;
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
    const { amount, paymentChannel, confirmed } = req.body;
    const validationError = validateStaffRepaymentInput({ amount, paymentChannel, confirmed });
    if (validationError) return res.status(400).json({ message: validationError });

    try {
        const loan = await LoanApplication.findById(req.params.loanId);
        if (!loan) return res.status(404).json({ message: 'Loan application not found' });
        if (!await canManageLoan(req, loan)) return res.status(403).json({ message: 'You cannot record repayments for this branch' });
        if (loan.status !== 'approved') return res.status(409).json({ message: 'Repayments can only be recorded for approved loans' });

        const paidAt = new Date();
        const receiptNumber = `RCP-${crypto.randomUUID()}`;
        const interestDue = loan.unpaidInterest + calculateAccruedInterest(loan.outstandingPrincipal, loan.annualInterestRate, loan.lastPaymentAt || loan.approvedAt, paidAt);
        const allocation = allocateRepayment(amount, loan.outstandingPrincipal, interestDue);
        loan.repayments.push({
            amount,
            interestPortion: allocation.interestPortion,
            principalPortion: allocation.principalPortion,
            recordedBy: req.user.id,
            receiptNumber,
            paymentChannel,
            paymentMode: 'staff_recorded',
            paidAt
        });
        loan.interestIncome += allocation.interestPortion;
        loan.principalRecovered += allocation.principalPortion;
        loan.outstandingPrincipal = allocation.remainingPrincipal;
        loan.unpaidInterest = allocation.remainingInterest;
        loan.lastPaymentAt = paidAt;
        if (loan.outstandingPrincipal === 0) loan.status = 'repaid';
        await loan.save();
        return res.status(200).json({ message: 'Customer repayment recorded', receiptNumber, loan });
    } catch (error) {
        if (error.message === 'Repayment exceeds the current balance due') return res.status(400).json({ message: error.message });
        console.error('Loan repayment failed:', error.message);
        return res.status(500).json({ message: 'Unable to record repayment' });
    }
}

function paymentAttemptMatches(attempt, { loanId, amount, channel, accountId }) {
    return String(attempt.loan) === String(loanId)
        && attempt.amount === amount
        && attempt.channel === channel
        && String(attempt.accountId || '') === String(accountId || '');
}

function canRepayOwnLoan(role) {
    return role === 'user' || role === 'employee';
}

function respondWithPaymentAttempt(res, attempt, loan) {
    const succeeded = attempt.status === 'succeeded';
    const accountPayment = attempt.channel === 'bank_account';
    return res.status(succeeded ? 200 : 402).json({
        message: accountPayment
            ? 'Account repayment processed successfully'
            : succeeded ? 'Virtual repayment processed successfully' : 'Virtual payment was declined by the simulator',
        payment: {
            status: attempt.status,
            mode: accountPayment ? 'account_transfer' : 'simulation',
            amount: attempt.amount,
            currency: attempt.currency,
            channel: attempt.channel,
            reference: attempt.reference,
            receiptNumber: attempt.receiptNumber,
            processedAt: attempt.processedAt,
            ...(accountPayment ? { accountId: attempt.accountId } : {})
        },
        ...(loan ? { loan } : {})
    });
}

async function payLoanWithVirtualSimulator(req, res) {
    const { amount, channel, idempotencyKey, simulateFailure = false } = req.body;
    const allowedChannels = ['mtn_mobile_money', 'airtel_mobile_money', 'bank_transfer', 'virtual_account'];
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Enter a positive whole-number RWF repayment' });
    }
    if (!allowedChannels.includes(channel)) {
        return res.status(400).json({ message: 'Choose a supported virtual payment channel' });
    }
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(idempotencyKey || '')) {
        return res.status(400).json({ message: 'A valid payment request key is required' });
    }
    if (typeof simulateFailure !== 'boolean') {
        return res.status(400).json({ message: 'Simulation outcome must be a boolean' });
    }
    if (!canRepayOwnLoan(req.user.role)) {
        return res.status(403).json({ message: 'Only loan applicants can make repayments' });
    }

    const attemptQuery = { applicant: req.user.id, idempotencyKey };
    const attemptInput = { loanId: req.params.loanId, amount, channel };
    try {
        const previousAttempt = await LoanPaymentAttempt.findOne(attemptQuery);
        if (previousAttempt) {
            if (!paymentAttemptMatches(previousAttempt, attemptInput)) {
                return res.status(409).json({ message: 'This payment request key was already used for a different payment' });
            }
            const loan = await LoanApplication.findOne({ _id: previousAttempt.loan, applicant: req.user.id });
            return respondWithPaymentAttempt(res, previousAttempt, loan);
        }

        const loan = await LoanApplication.findOne({ _id: req.params.loanId, applicant: req.user.id });
        if (!loan) return res.status(404).json({ message: 'Loan application not found' });
        if (loan.status !== 'approved') {
            return res.status(409).json({ message: 'Only approved loans can receive repayments' });
        }

        const paidAt = new Date();
        const interestDue = loan.unpaidInterest + calculateAccruedInterest(
            loan.outstandingPrincipal,
            loan.annualInterestRate,
            loan.lastPaymentAt || loan.approvedAt,
            paidAt
        );
        allocateRepayment(amount, loan.outstandingPrincipal, interestDue);

        let simulatedPayment;
        try {
            simulatedPayment = await requestVirtualPayment({
                amount,
                currency: 'RWF',
                channel,
                idempotency_key: idempotencyKey,
                simulate_failure: simulateFailure
            });
        } catch (error) {
            return res.status(error.status || 503).json({ message: error.message });
        }

        if (simulatedPayment.status === 'failed') {
            let failedAttempt;
            try {
                [failedAttempt] = await LoanPaymentAttempt.create([{
                    applicant: req.user.id,
                    loan: loan._id,
                    idempotencyKey,
                    reference: simulatedPayment.reference,
                    receiptNumber: simulatedPayment.receipt_number,
                    amount,
                    currency: 'RWF',
                    channel,
                    status: 'failed',
                    processedAt: new Date(simulatedPayment.processed_at)
                }]);
            } catch (error) {
                if (error.code !== 11000) throw error;
                failedAttempt = await LoanPaymentAttempt.findOne(attemptQuery);
                if (!failedAttempt || !paymentAttemptMatches(failedAttempt, attemptInput)) {
                    return res.status(409).json({ message: 'This payment request key was already used for a different payment' });
                }
            }
            return respondWithPaymentAttempt(res, failedAttempt);
        }

        const session = await mongoose.startSession();
        let completedAttempt;
        let updatedLoan;
        try {
            await session.withTransaction(async () => {
                const existingAttempt = await LoanPaymentAttempt.findOne(attemptQuery).session(session);
                if (existingAttempt) {
                    if (!paymentAttemptMatches(existingAttempt, attemptInput)) {
                        throw Object.assign(new Error('This payment request key was already used for a different payment'), { status: 409 });
                    }
                    completedAttempt = existingAttempt;
                    updatedLoan = await LoanApplication.findOne({ _id: existingAttempt.loan, applicant: req.user.id }).session(session);
                    return;
                }

                const currentLoan = await LoanApplication.findOne({ _id: req.params.loanId, applicant: req.user.id }).session(session);
                if (!currentLoan) throw Object.assign(new Error('Loan application not found'), { status: 404 });
                if (currentLoan.status !== 'approved') {
                    throw Object.assign(new Error('Only approved loans can receive repayments'), { status: 409 });
                }

                const transactionTime = new Date();
                const accruedInterest = currentLoan.unpaidInterest + calculateAccruedInterest(
                    currentLoan.outstandingPrincipal,
                    currentLoan.annualInterestRate,
                    currentLoan.lastPaymentAt || currentLoan.approvedAt,
                    transactionTime
                );
                const allocation = allocateRepayment(amount, currentLoan.outstandingPrincipal, accruedInterest);
                [completedAttempt] = await LoanPaymentAttempt.create([{
                    applicant: req.user.id,
                    loan: currentLoan._id,
                    idempotencyKey,
                    reference: simulatedPayment.reference,
                    receiptNumber: simulatedPayment.receipt_number,
                    amount,
                    currency: 'RWF',
                    channel,
                    status: 'succeeded',
                    processedAt: transactionTime
                }], { session });

                currentLoan.repayments.push({
                    amount,
                    interestPortion: allocation.interestPortion,
                    principalPortion: allocation.principalPortion,
                    recordedBy: req.user.id,
                    paymentReference: simulatedPayment.reference,
                    receiptNumber: simulatedPayment.receipt_number,
                    paymentChannel: channel,
                    paymentMode: 'virtual_simulation',
                    paidAt: transactionTime
                });
                currentLoan.interestIncome += allocation.interestPortion;
                currentLoan.principalRecovered += allocation.principalPortion;
                currentLoan.outstandingPrincipal = allocation.remainingPrincipal;
                currentLoan.unpaidInterest = allocation.remainingInterest;
                currentLoan.lastPaymentAt = transactionTime;
                if (currentLoan.outstandingPrincipal === 0) currentLoan.status = 'repaid';
                await currentLoan.save({ session });
                updatedLoan = currentLoan;
            });
        } catch (error) {
            if (error.code === 11000) {
                completedAttempt = await LoanPaymentAttempt.findOne(attemptQuery);
                if (completedAttempt && paymentAttemptMatches(completedAttempt, attemptInput)) {
                    updatedLoan = await LoanApplication.findOne({ _id: completedAttempt.loan, applicant: req.user.id });
                } else {
                    return res.status(409).json({ message: 'This payment request key was already used for a different payment' });
                }
            } else if (error.status) {
                return res.status(error.status).json({ message: error.message });
            } else {
                throw error;
            }
        } finally {
            await session.endSession();
        }
        return respondWithPaymentAttempt(res, completedAttempt, updatedLoan);
    } catch (error) {
        if (error.message === 'Repayment exceeds the current balance due') {
            return res.status(400).json({ message: error.message });
        }
        console.error('Virtual loan payment failed:', error.message);
        return res.status(500).json({ message: 'Unable to process virtual loan repayment' });
    }
}

async function payLoanFromAccount(req, res) {
    const { amount, accountId, idempotencyKey } = req.body;
    if (!canRepayOwnLoan(req.user.role)) {
        return res.status(403).json({ message: 'Only loan applicants can repay their own loans from an account' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.loanId) || !mongoose.Types.ObjectId.isValid(accountId)) {
        return res.status(400).json({ message: 'Select a valid loan and bank account' });
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Enter a positive whole-number RWF repayment' });
    }
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(idempotencyKey || '')) {
        return res.status(400).json({ message: 'A valid payment request key is required' });
    }

    const attemptQuery = { applicant: req.user.id, idempotencyKey };
    const attemptInput = { loanId: req.params.loanId, amount, channel: 'bank_account', accountId };
    try {
        const previousAttempt = await LoanPaymentAttempt.findOne(attemptQuery);
        if (previousAttempt) {
            if (!paymentAttemptMatches(previousAttempt, attemptInput)) {
                return res.status(409).json({ message: 'This payment request key was already used for a different payment' });
            }
            const loan = await LoanApplication.findOne({ _id: previousAttempt.loan, applicant: req.user.id });
            return respondWithPaymentAttempt(res, previousAttempt, loan);
        }

        const session = await mongoose.startSession();
        let completedAttempt;
        let updatedLoan;
        try {
            await session.withTransaction(async () => {
                const existingAttempt = await LoanPaymentAttempt.findOne(attemptQuery).session(session);
                if (existingAttempt) {
                    if (!paymentAttemptMatches(existingAttempt, attemptInput)) {
                        throw Object.assign(new Error('This payment request key was already used for a different payment'), { status: 409 });
                    }
                    completedAttempt = existingAttempt;
                    updatedLoan = await LoanApplication.findOne({ _id: existingAttempt.loan, applicant: req.user.id }).session(session);
                    return;
                }

                const loan = await LoanApplication.findOne({ _id: req.params.loanId, applicant: req.user.id }).session(session);
                if (!loan) throw Object.assign(new Error('Loan application not found'), { status: 404 });
                if (loan.status !== 'approved') {
                    throw Object.assign(new Error('Only approved loans can receive repayments'), { status: 409 });
                }
                const account = await BankAccount.findOne({
                    _id: accountId,
                    userId: req.user.id,
                    bankId: loan.bank,
                    branchId: loan.branchId,
                    status: 'active'
                }).session(session);
                if (!account) {
                    throw Object.assign(new Error('Choose an active account owned by you at this loan bank and sub-branch'), { status: 400 });
                }
                if (account.balance < amount) {
                    throw Object.assign(new Error('The selected account does not have enough available balance'), { status: 409 });
                }

                const paidAt = new Date();
                const interestDue = loan.unpaidInterest + calculateAccruedInterest(
                    loan.outstandingPrincipal,
                    loan.annualInterestRate,
                    loan.lastPaymentAt || loan.approvedAt,
                    paidAt
                );
                const allocation = allocateRepayment(amount, loan.outstandingPrincipal, interestDue);
                const reference = `ACC-${crypto.randomUUID()}`;
                const receiptNumber = `RCP-${crypto.randomUUID()}`;
                const balanceAfter = account.balance - amount;

                account.balance = balanceAfter;
                account.transactions.push({
                    type: 'loan_payment',
                    amount,
                    balanceAfter,
                    description: `Loan repayment for application ${loan._id}`,
                    paymentProvider: 'internal_bank_account',
                    paymentReference: reference,
                    createdAt: paidAt
                });
                await account.save({ session });

                [completedAttempt] = await LoanPaymentAttempt.create([{
                    applicant: req.user.id,
                    loan: loan._id,
                    idempotencyKey,
                    accountId: account._id,
                    reference,
                    receiptNumber,
                    amount,
                    currency: 'RWF',
                    channel: 'bank_account',
                    status: 'succeeded',
                    processedAt: paidAt
                }], { session });

                loan.repayments.push({
                    amount,
                    interestPortion: allocation.interestPortion,
                    principalPortion: allocation.principalPortion,
                    recordedBy: req.user.id,
                    paymentReference: reference,
                    receiptNumber,
                    paymentChannel: 'bank_account',
                    paymentMode: 'account_transfer',
                    paidAt
                });
                loan.interestIncome += allocation.interestPortion;
                loan.principalRecovered += allocation.principalPortion;
                loan.outstandingPrincipal = allocation.remainingPrincipal;
                loan.unpaidInterest = allocation.remainingInterest;
                loan.lastPaymentAt = paidAt;
                if (loan.outstandingPrincipal === 0) loan.status = 'repaid';
                await loan.save({ session });
                updatedLoan = loan;
            });
        } catch (error) {
            if (error.code === 11000) {
                completedAttempt = await LoanPaymentAttempt.findOne(attemptQuery);
                if (completedAttempt && paymentAttemptMatches(completedAttempt, attemptInput)) {
                    updatedLoan = await LoanApplication.findOne({ _id: completedAttempt.loan, applicant: req.user.id });
                } else {
                    return res.status(409).json({ message: 'This payment request key was already used for a different payment' });
                }
            } else if (error.status) {
                return res.status(error.status).json({ message: error.message });
            } else {
                throw error;
            }
        } finally {
            await session.endSession();
        }

        return res.status(200).json({
            message: 'Loan repayment debited from your account successfully',
            payment: {
                status: completedAttempt.status,
                mode: 'account_transfer',
                amount: completedAttempt.amount,
                currency: completedAttempt.currency,
                channel: completedAttempt.channel,
                reference: completedAttempt.reference,
                receiptNumber: completedAttempt.receiptNumber,
                processedAt: completedAttempt.processedAt,
                accountId: completedAttempt.accountId
            },
            loan: updatedLoan
        });
    } catch (error) {
        if (error.message === 'Repayment exceeds the current balance due') {
            return res.status(400).json({ message: error.message });
        }
        console.error('Account loan repayment failed:', error.message);
        return res.status(500).json({ message: 'Unable to process account loan repayment' });
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

module.exports = {
    listLoans,
    createLoan,
    decideLoan,
    recordRepayment,
    payLoanWithVirtualSimulator,
    payLoanFromAccount,
    markLoanDefaulted,
    paymentAttemptMatches,
    canManageLoan,
    canRepayOwnLoan,
    validateStaffRepaymentInput,
    canApplyForLoan,
    canEmployeeApplyAt
};