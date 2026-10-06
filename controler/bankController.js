const crypto = require('crypto');
const mongoose = require('mongoose');
const Bank = require('../modle/Bank');
const BankAccount = require('../modle/BankAccount');
const PaymentAttempt = require('../modle/PaymentAttempt');
const User = require('../modle/User');
const { generateAccountNumber, maskAccountNumber, applyTransfer } = require('../utils/bankAccountUtils');
const { isPaypackConfigured, normalizeRwandaPhoneNumber, initiatePaypackCashin, verifyPaypackSignature } = require('../config/paypack');

function isMissingAccountNumber(value) {
    return typeof value !== 'string' || !value.trim() || ['undefined', 'null'].includes(value.trim().toLowerCase());
}

async function canManageBankAccount(user, account) {
    if (user.role === 'admin') return true;
    if (user.role !== 'employee') return false;
    const manager = await User.findById(user.id).select('role bankId branchId').lean();
    return manager?.role === 'employee'
        && String(manager.bankId || '') === String(account.bankId)
        && (!manager.branchId || String(manager.branchId) === String(account.branchId));
}

async function listBanks(_req, res) {
    try {
        const banks = await Bank.find().sort({ bankName: 1 });
        for (const bank of banks) {
            if (!isMissingAccountNumber(bank.accountNumber)) continue;
            for (let attempt = 0; attempt < 5; attempt += 1) {
                const accountNumber = crypto.randomInt(100_000_000_000, 999_999_999_999).toString();
                try {
                    const result = await Bank.updateOne(
                        { _id: bank._id, $or: [{ accountNumber: { $exists: false } }, { accountNumber: null }, { accountNumber: '' }, { accountNumber: 'undefined' }, { accountNumber: 'null' }] },
                        { $set: { accountNumber } }
                    );
                    if (result.modifiedCount) {
                        bank.accountNumber = accountNumber;
                        break;
                    }
                    const updatedBank = await Bank.findById(bank._id).select('accountNumber');
                    bank.accountNumber = updatedBank?.accountNumber;
                    break;
                } catch (error) {
                    if (error.code !== 11000 || attempt === 4) throw error;
                }
            }
            if (!bank.accountNumber) throw new Error(`Unable to assign an account number to bank ${bank._id}`);
        }
        return res.status(200).json({ banks });
    } catch (error) {
        console.error('Bank list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load banks' });
    }
}

async function listAvailableBanks(req, res) {
    if (req.user.role !== 'user') return res.status(403).json({ message: 'Customer access is required' });
    try {
        const banks = await Bank.find()
            .select('bankName branches._id branches.branchName branches.branchCode branches.location')
            .sort({ bankName: 1 });
        return res.status(200).json({ banks });
    } catch (error) {
        console.error('Available bank list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load available banks' });
    }
}

async function createBank(req, res) {
    const { bankName, leadership } = req.body;
    const requiredValues = [bankName, leadership?.generalManager, leadership?.hrManager, leadership?.financeManager?.name, leadership?.financeManager?.email, leadership?.accountsManager];
    if (!requiredValues.every(value => typeof value === 'string' && value.trim())) {
        return res.status(400).json({ message: 'Bank name and leadership details are required' });
    }

    try {
        let bank;
        for (let attempt = 0; attempt < 5 && !bank; attempt += 1) {
            const accountNumber = crypto.randomInt(100_000_000_000, 999_999_999_999).toString();
            if (await Bank.exists({ accountNumber })) continue;
            try {
                bank = await Bank.create({
                    bankName: bankName.trim(),
                    accountNumber,
                    leadership: {
                        generalManager: leadership.generalManager.trim(),
                        hrManager: leadership.hrManager.trim(),
                        financeManager: {
                            name: leadership.financeManager.name.trim(),
                            email: leadership.financeManager.email.trim().toLowerCase()
                        },
                        accountsManager: leadership.accountsManager.trim()
                    },
                    branches: [],
                    createdBy: req.user.id
                });
            } catch (error) {
                if (error.code !== 11000 || attempt === 4) throw error;
            }
        }
        if (!bank) return res.status(503).json({ message: 'Unable to allocate a unique bank account number. Please retry.' });
        return res.status(201).json({ message: 'Bank created successfully', bank });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'A unique bank account number could not be allocated' });
        console.error('Bank creation failed:', error.message);
        return res.status(500).json({ message: 'Unable to create bank' });
    }
}

function generateBranchCode(bank, index) {
    const usedCodes = new Set((bank.branches || []).map((branch) => branch.branchCode).filter(Boolean));
    const suffix = String(bank.accountNumber || '000000').slice(-6);
    let sequence = (index ?? (bank.branches?.length ?? 0)) + 1;
    let code = `BR-${suffix}-${String(sequence).padStart(3, '0')}`;
    while (usedCodes.has(code)) {
        sequence += 1;
        code = `BR-${suffix}-${String(sequence).padStart(3, '0')}`;
    }
    return code;
}

async function addBranch(req, res) {
    const { branchName, branchManager, location } = req.body;
    const locationFields = ['province', 'district', 'sector', 'cell', 'village'];
    const requiredValues = [branchName, branchManager, ...locationFields.map(field => location?.[field])];
    if (!requiredValues.every(value => typeof value === 'string' && value.trim())) {
        return res.status(400).json({ message: 'Branch name, manager, and complete branch location are required' });
    }

    try {
        const bank = await Bank.findById(req.params.bankId);
        if (!bank) return res.status(404).json({ message: 'Bank not found' });

        const generatedCode = generateBranchCode(bank, bank.branches.length);
        const duplicateCode = await Bank.exists({ _id: { $ne: bank._id }, 'branches.branchCode': generatedCode });
        if (duplicateCode) return res.status(409).json({ message: 'That branch code already exists' });

        const branch = {
            branchName: branchName.trim(),
            branchCode: generatedCode,
            branchManager: branchManager.trim(),
            location: Object.fromEntries(locationFields.map(field => [field, location[field].trim()]))
        };

        bank.branches.push(branch);
        await bank.save();

        return res.status(201).json({ message: 'Branch added successfully', bank });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'That branch code already exists' });
        console.error('Branch creation failed:', error.message);
        return res.status(500).json({ message: 'Unable to create branch' });
    }
}

async function createBankAccount(req, res) {
    const { bankId, branchId, accountName } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bankId) || !mongoose.Types.ObjectId.isValid(branchId)) {
        return res.status(400).json({ message: 'A valid bank and branch are required.' });
    }

    const trimmedName = typeof accountName === 'string' ? accountName.trim() : '';
    if (!trimmedName) {
        return res.status(400).json({ message: 'A bank account name is required.' });
    }

    try {
        const bank = await Bank.findById(bankId).lean();
        if (!bank) return res.status(404).json({ message: 'Bank not found.' });

        const branch = bank.branches.find((item) => String(item._id) === String(branchId));
        if (!branch) return res.status(400).json({ message: 'The selected branch does not belong to this bank.' });

        const usedNumbers = new Set((await BankAccount.find({}, 'accountNumber').lean()).map((entry) => entry.accountNumber));
        const accountNumber = generateAccountNumber(usedNumbers);

        const account = await BankAccount.create({
            userId: req.user.id,
            bankId,
            branchId,
            accountNumber,
            accountName: trimmedName,
            status: 'active',
            balance: 0,
            transactions: []
        });

        await User.findByIdAndUpdate(req.user.id, { bankAccountId: account._id });

        return res.status(201).json({ message: 'Bank account created successfully.', account });
    } catch (error) {
        console.error('Bank account creation failed:', error.message);
        return res.status(500).json({ message: 'Unable to create bank account.' });
    }
}

async function listBankAccounts(req, res) {
    const { bankId } = req.query;
    if (bankId && !mongoose.Types.ObjectId.isValid(bankId)) {
        return res.status(400).json({ message: 'A valid bank is required.' });
    }
    try {
        const filter = bankId ? { bankId } : {};
        if (req.user.role === 'employee') {
            const manager = await User.findById(req.user.id).select('role bankId branchId').lean();
            if (manager?.role !== 'employee' || !manager.bankId || (bankId && String(bankId) !== String(manager.bankId))) {
                return res.status(403).json({ message: 'You can only view accounts assigned to your bank.' });
            }
            filter.bankId = manager.bankId;
            if (manager.branchId) filter.branchId = manager.branchId;
        } else if (req.user.role === 'user') {
            filter.userId = req.user.id;
        } else if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'You do not have access to bank accounts.' });
        }

        const accounts = await BankAccount.find(filter)
            .populate('userId', 'name email')
            .populate('bankId', 'bankName accountNumber')
            .sort({ createdAt: -1 });

        return res.status(200).json({ accounts });
    } catch (error) {
        console.error('Bank account list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load bank accounts.' });
    }
}

async function listBankAccountsForUser(req, res) {
    try {
        const accounts = await BankAccount.find({ userId: req.user.id })
            .populate('bankId', 'bankName accountNumber')
            .sort({ createdAt: -1 });

        return res.status(200).json({ accounts });
    } catch (error) {
        console.error('User bank account list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load your bank accounts.' });
    }
}

async function getBankAccountTransactions(req, res) {
    try {
        const account = await BankAccount.findById(req.params.accountId);
        if (!account) return res.status(404).json({ message: 'Bank account not found.' });

        if (String(account.userId) !== String(req.user.id) && !await canManageBankAccount(req.user, account)) {
            return res.status(403).json({ message: 'You do not have access to this account.' });
        }

        return res.status(200).json({ account, transactions: account.transactions || [] });
    } catch (error) {
        console.error('Bank account transaction fetch failed:', error.message);
        return res.status(500).json({ message: 'Unable to load account transactions.' });
    }
}

async function lookupTransferRecipient(req, res) {
    const accountNumber = String(req.params.accountNumber || '');
    if (!/^\d{12}$/.test(accountNumber)) {
        return res.status(400).json({ message: 'Enter a valid 12-digit recipient account number.' });
    }

    try {
        const account = await BankAccount.findOne({ accountNumber, status: 'active' }).select('accountNumber userId').lean();
        if (!account) return res.status(404).json({ message: 'An active recipient account was not found.' });

        const recipient = await User.findById(account.userId).select('name').lean();
        if (!recipient?.name) return res.status(404).json({ message: 'An active recipient account was not found.' });

        return res.status(200).json({
            recipient: {
                name: recipient.name,
                accountNumber: maskAccountNumber(account.accountNumber)
            }
        });
    } catch (error) {
        console.error('Transfer recipient lookup failed:', error.message);
        return res.status(500).json({ message: 'Unable to verify the recipient account.' });
    }
}

async function clearPendingPayment(accountId, paymentId) {
    await BankAccount.updateOne(
        { _id: accountId, pendingPaymentId: paymentId },
        { $unset: { pendingPaymentId: 1 } }
    );
}

async function depositToBankAccount(req, res) {
    const { amount, phoneNumber } = req.body;
    const depositAmount = Number(amount);

    if (!mongoose.Types.ObjectId.isValid(req.params.accountId)) {
        return res.status(400).json({ message: 'A valid bank account is required.' });
    }
    if (!Number.isSafeInteger(depositAmount) || depositAmount <= 0) {
        return res.status(400).json({ message: 'Deposit amount must be a positive whole number of RWF.' });
    }
    if (!isPaypackConfigured()) {
        return res.status(503).json({ message: 'Paypack is not configured. Set its client ID, client secret, and webhook secret on the backend.' });
    }

    let normalizedPhoneNumber;
    try {
        normalizedPhoneNumber = normalizeRwandaPhoneNumber(phoneNumber);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }

    try {
        const account = await BankAccount.findById(req.params.accountId);
        if (!account) return res.status(404).json({ message: 'Bank account not found.' });
        if (String(account.userId) !== String(req.user.id)) {
            return res.status(403).json({ message: 'You can only deposit into your own account.' });
        }
        if (account.status !== 'active') {
            return res.status(400).json({ message: 'Deposits require an active bank account.' });
        }

        const paymentId = new mongoose.Types.ObjectId();
        const idempotencyKey = crypto.randomBytes(16).toString('hex');
        const reservedAccount = await BankAccount.findOneAndUpdate({
            _id: account._id,
            userId: req.user.id,
            status: 'active',
            $or: [{ pendingPaymentId: { $exists: false } }, { pendingPaymentId: null }]
        }, { $set: { pendingPaymentId: paymentId } }, { new: true }).select('_id');
        if (!reservedAccount) return res.status(409).json({ message: 'This account already has a pending mobile-money payment.' });

        let payment;
        try {
            payment = await PaymentAttempt.create({
                _id: paymentId,
                userId: req.user.id,
                accountId: account._id,
                idempotencyKey,
                phoneNumber: normalizedPhoneNumber,
                amount: depositAmount,
                status: 'initiating'
            });
        } catch (error) {
            await clearPendingPayment(account._id, paymentId);
            throw error;
        }

        try {
            const providerPayment = await initiatePaypackCashin({
                amount: depositAmount,
                number: normalizedPhoneNumber,
                idempotencyKey: payment.idempotencyKey
            });
            if (providerPayment.ref) payment.providerRef = String(providerPayment.ref);
            if (!providerPayment.ref || providerPayment.kind !== 'CASHIN' || Number(providerPayment.amount) !== depositAmount) {
                throw Object.assign(new Error('Paypack returned an unexpected cash-in response.'), { uncertain: true });
            }
            payment.status = providerPayment.status === 'failed' ? 'failed' : 'pending';
            await payment.save();
            if (payment.status === 'failed') await clearPendingPayment(account._id, payment._id);
            return res.status(202).json({
                message: payment.status === 'failed' ? 'Paypack could not start this payment.' : 'Payment request sent. Approve it on your mobile money phone.',
                payment: {
                    id: payment._id,
                    providerRef: payment.providerRef,
                    amount: payment.amount,
                    status: payment.status
                }
            });
        } catch (error) {
            const outcomeUncertain = error.uncertain || !Number.isInteger(error.status) || error.status >= 500;
            payment.status = outcomeUncertain ? 'pending' : 'failed';
            payment.failureMessage = error.message.slice(0, 240);
            await payment.save();
            if (!outcomeUncertain) await clearPendingPayment(account._id, payment._id);
            return res.status(error.status === 503 ? 503 : 502).json({
                message: error.status === 503
                    ? error.message
                    : outcomeUncertain
                        ? 'Paypack did not confirm whether it received the request. The account is locked against another payment until this one is reconciled.'
                        : 'Paypack rejected the payment request. No account balance was changed.'
            });
        }
    } catch (error) {
        console.error('Paypack deposit initiation failed:', error.message);
        return res.status(500).json({ message: 'Unable to start the deposit payment.' });
    }
}

async function paypackWebhook(req, res) {
    if (req.method === 'HEAD') return res.status(200).end();
    if (!isPaypackConfigured() || !verifyPaypackSignature(req.rawBody, req.get('X-Paypack-Signature'))) {
        return res.status(401).json({ message: 'Invalid Paypack webhook signature.' });
    }

    const event = req.body;
    const details = event?.data;
    if (event?.kind !== 'transaction:processed' || !details?.ref) {
        return res.status(202).json({ message: 'Event ignored.' });
    }

    try {
        const payment = await PaymentAttempt.findOne({ providerRef: String(details.ref) });
        if (!payment) return res.status(404).json({ message: 'Payment reference not found.' });
        if (details.kind !== 'CASHIN'
            || Number(details.amount) !== payment.amount
            || normalizeRwandaPhoneNumber(details.client) !== payment.phoneNumber) {
            return res.status(400).json({ message: 'Paypack event does not match the pending payment.' });
        }

        const providerStatus = String(details.status || '').toLowerCase();
        if (providerStatus === 'failed') {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    const currentPayment = await PaymentAttempt.findById(payment._id).session(session);
                    if (currentPayment.status === 'successful') return;
                    currentPayment.status = 'failed';
                    currentPayment.failureMessage = 'Paypack reported that the mobile-money payment failed.';
                    await currentPayment.save({ session });
                    await BankAccount.updateOne(
                        { _id: currentPayment.accountId, pendingPaymentId: currentPayment._id },
                        { $unset: { pendingPaymentId: 1 } },
                        { session }
                    );
                });
            } finally {
                await session.endSession();
            }
            return res.status(200).json({ message: 'Payment marked failed.' });
        }
        if (!['success', 'successful'].includes(providerStatus)) {
            return res.status(202).json({ message: 'Payment is still processing.' });
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const currentPayment = await PaymentAttempt.findById(payment._id).session(session);
                if (currentPayment.status === 'successful') return;
                const account = await BankAccount.findById(currentPayment.accountId).session(session);
                if (!account) throw new Error('Bank account for payment was not found.');
                const balanceAfter = account.balance + currentPayment.amount;
                if (!Number.isSafeInteger(balanceAfter)) throw new Error('Payment would exceed the safe account balance.');

                account.balance = balanceAfter;
                account.transactions.push({
                    type: 'deposit',
                    amount: currentPayment.amount,
                    balanceAfter,
                    description: `Paypack mobile-money deposit (${currentPayment.providerRef})`,
                    paymentProvider: 'paypack',
                    paymentReference: currentPayment.providerRef
                });
                currentPayment.status = 'successful';
                currentPayment.failureMessage = undefined;
                account.pendingPaymentId = undefined;
                await account.save({ session });
                await currentPayment.save({ session });
            });
        } finally {
            await session.endSession();
        }
        return res.status(200).json({ message: 'Payment confirmed and account credited.' });
    } catch (error) {
        if (error.message.startsWith('Enter a valid Rwanda mobile number')) {
            return res.status(400).json({ message: 'Paypack event contains an invalid mobile number.' });
        }
        console.error('Paypack webhook processing failed:', error.message);
        return res.status(500).json({ message: 'Unable to process Paypack payment confirmation.' });
    }
}

async function transferBetweenAccounts(req, res) {
    const { fromAccountId, toAccountNumber, amount, description } = req.body;
    const transferAmount = Number(amount);

    if (!mongoose.Types.ObjectId.isValid(fromAccountId) || !/^\d{12}$/.test(String(toAccountNumber || ''))) {
        return res.status(400).json({ message: 'A valid source account and 12-digit destination account number are required.' });
    }

    if (!Number.isSafeInteger(transferAmount) || transferAmount <= 0) {
        return res.status(400).json({ message: 'Transfer amount must be a positive whole number of RWF.' });
    }

    const session = await mongoose.startSession();
    try {
        let transferResult;
        await session.withTransaction(async () => {
            const fromAccount = await BankAccount.findById(fromAccountId).session(session);
            const toAccount = await BankAccount.findOne({ accountNumber: toAccountNumber }).session(session);

            if (!fromAccount || !toAccount) throw new Error('BANK_ACCOUNT_NOT_FOUND');
            if (String(fromAccount.userId) !== String(req.user.id)) throw new Error('SOURCE_ACCOUNT_NOT_OWNED');
            if (String(fromAccount._id) === String(toAccount._id)) throw new Error('SAME_ACCOUNT');
            if (fromAccount.status !== 'active' || toAccount.status !== 'active') throw new Error('ACCOUNT_INACTIVE');

            const transferDescription = typeof description === 'string' && description.trim()
                ? description.trim().slice(0, 120)
                : 'Bank transfer';
            const balances = applyTransfer({
                fromBalance: fromAccount.balance,
                toBalance: toAccount.balance,
                amount: transferAmount,
                fromAccountNumber: fromAccount.accountNumber,
                toAccountNumber: toAccount.accountNumber,
                descriptor: transferDescription
            });

            fromAccount.balance = balances.fromBalance;
            toAccount.balance = balances.toBalance;
            fromAccount.transactions.push({ ...balances.entries[0], relatedAccountId: toAccount._id });
            toAccount.transactions.push({ ...balances.entries[1], relatedAccountId: fromAccount._id });
            await fromAccount.save({ session });
            await toAccount.save({ session });
            transferResult = { fromAccount, toAccount, transferDescription };
        });

        return res.status(200).json({
            message: 'Transfer complete.',
            fromAccount: transferResult.fromAccount,
            toAccount: transferResult.toAccount,
            transfer: {
                amount: transferAmount,
                description: transferResult.transferDescription
            }
        });
    } catch (error) {
        const statusCodes = {
            BANK_ACCOUNT_NOT_FOUND: 404,
            SOURCE_ACCOUNT_NOT_OWNED: 403,
            SAME_ACCOUNT: 400,
            ACCOUNT_INACTIVE: 400,
            'Insufficient funds': 400
        };
        if (statusCodes[error.message]) return res.status(statusCodes[error.message]).json({ message: error.message === 'Insufficient funds' ? error.message : error.message.replaceAll('_', ' ').toLowerCase() });
        console.error('Bank transfer failed:', error.message);
        return res.status(500).json({ message: 'Unable to complete transfer.' });
    } finally {
        await session.endSession();
    }
}

async function updateBankAccountStatus(req, res) {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Account status must be active or inactive.' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.accountId)) {
        return res.status(400).json({ message: 'A valid bank account is required.' });
    }

    try {
        const account = await BankAccount.findById(req.params.accountId);
        if (!account) return res.status(404).json({ message: 'Bank account not found.' });
        if (!await canManageBankAccount(req.user, account)) {
            return res.status(403).json({ message: 'Only an administrator or the account bank manager can change this status.' });
        }
        account.status = status;
        await account.save();
        return res.status(200).json({ message: `Bank account ${status}.`, account });
    } catch (error) {
        console.error('Bank account status update failed:', error.message);
        return res.status(500).json({ message: 'Unable to update bank account status.' });
    }
}

module.exports = {
    listBanks,
    listAvailableBanks,
    createBank,
    addBranch,
    createBankAccount,
    listBankAccounts,
    listBankAccountsForUser,
    getBankAccountTransactions,
    lookupTransferRecipient,
    depositToBankAccount,
    paypackWebhook,
    transferBetweenAccounts,
    updateBankAccountStatus
};
