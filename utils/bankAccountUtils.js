function generateAccountNumber(usedNumbers = new Set()) {
    let accountNumber = '';
    do {
        accountNumber = Array.from({ length: 12 }, () => String(Math.floor(Math.random() * 10))).join('');
    } while (usedNumbers.has(accountNumber) || accountNumber.length !== 12);

    usedNumbers.add(accountNumber);
    return accountNumber;
}

function maskAccountNumber(accountNumber) {
    const value = String(accountNumber || '');
    if (!/^\d{12}$/.test(value)) throw new Error('A valid 12-digit account number is required.');
    return `${value.slice(0, 3)}******${value.slice(-3)}`;
}

function applyTransfer({ fromBalance, toBalance, amount, fromAccountNumber, toAccountNumber, descriptor }) {
    const transferAmount = Number(amount);
    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
        throw new Error('Transfer amount must be greater than zero.');
    }
    if (fromBalance < transferAmount) {
        throw new Error('Insufficient funds');
    }

    const updatedFromBalance = fromBalance - transferAmount;
    const updatedToBalance = toBalance + transferAmount;

    return {
        fromBalance: updatedFromBalance,
        toBalance: updatedToBalance,
        entries: [
            {
                accountNumber: fromAccountNumber,
                type: 'transfer_out',
                amount: transferAmount,
                balanceAfter: updatedFromBalance,
                description: descriptor || 'Bank transfer'
            },
            {
                accountNumber: toAccountNumber,
                type: 'transfer_in',
                amount: transferAmount,
                balanceAfter: updatedToBalance,
                description: descriptor || 'Bank transfer'
            }
        ]
    };
}

module.exports = {
    generateAccountNumber,
    maskAccountNumber,
    applyTransfer
};
