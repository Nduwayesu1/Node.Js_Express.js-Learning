const crypto = require('crypto');
const connectDB = require('../config/database');
const Bank = require('../modle/Bank');

function isMissingIdentifier(value) {
    return typeof value !== 'string' || !value.trim() || ['undefined', 'null'].includes(value.trim().toLowerCase());
}

function generateAccountNumber(usedAccountNumbers) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const accountNumber = crypto.randomInt(100_000_000_000, 999_999_999_999).toString();
        if (!usedAccountNumbers.has(accountNumber)) {
            usedAccountNumbers.add(accountNumber);
            return accountNumber;
        }
    }
    throw new Error('Unable to generate a unique bank account number');
}

function generateBranchCode(accountNumber, index, usedBranchCodes) {
    let sequence = index + 1;
    let branchCode = `BR-${accountNumber.slice(-6)}-${String(sequence).padStart(3, '0')}`;
    while (usedBranchCodes.has(branchCode)) {
        sequence += 1;
        branchCode = `BR-${accountNumber.slice(-6)}-${String(sequence).padStart(3, '0')}`;
    }
    usedBranchCodes.add(branchCode);
    return branchCode;
}

async function main() {
    const applyChanges = process.argv.includes('--apply');
    await connectDB();

    try {
        const banks = await Bank.find().sort({ bankName: 1 });
        const usedAccountNumbers = new Set(banks.filter((bank) => !isMissingIdentifier(bank.accountNumber)).map((bank) => bank.accountNumber));
        const usedBranchCodes = new Set(banks.flatMap((bank) => bank.branches)
            .filter((branch) => !isMissingIdentifier(branch.branchCode))
            .map((branch) => branch.branchCode));
        const changes = [];

        for (const bank of banks) {
            const previousAccountNumber = bank.accountNumber || null;
            const accountNumberMissing = isMissingIdentifier(bank.accountNumber);
            const accountNumber = accountNumberMissing ? generateAccountNumber(usedAccountNumbers) : bank.accountNumber;
            const branchesToRegenerate = bank.branches
                .map((branch, index) => ({ branch, index }))
                .filter(({ branch }) => accountNumberMissing || isMissingIdentifier(branch.branchCode));

            if (!accountNumberMissing && !branchesToRegenerate.length) continue;

            for (const { branch } of branchesToRegenerate) {
                if (!isMissingIdentifier(branch.branchCode)) usedBranchCodes.delete(branch.branchCode);
            }

            const branchUpdates = branchesToRegenerate.map(({ branch, index }) => ({
                id: branch._id,
                name: branch.branchName,
                oldCode: branch.branchCode || null,
                branchCode: generateBranchCode(accountNumber, index, usedBranchCodes)
            }));

            if (applyChanges) {
                bank.accountNumber = accountNumber;
                for (const update of branchUpdates) {
                    const branch = bank.branches.id(update.id);
                    if (branch) branch.branchCode = update.branchCode;
                }
                await bank.save();
            }

            changes.push({ bank: bank.bankName, accountNumber: { from: previousAccountNumber, to: accountNumber }, branchCodes: branchUpdates });
        }

        console.log(JSON.stringify({ mode: applyChanges ? 'applied' : 'dry-run', banksUpdated: changes.length, changes }, null, 2));
        if (!applyChanges) console.log('No database changes made. Rerun with --apply to persist these identifiers.');
    } finally {
        await Bank.db.disconnect();
    }
}

main().catch((error) => {
    console.error('Bank identifier repair failed:', error.message);
    process.exitCode = 1;
});