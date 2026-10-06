function getSystemAnnualInterestRate() {
    const configuredRate = process.env.SYSTEM_ANNUAL_INTEREST_RATE;
    if (configuredRate === undefined || configuredRate.trim() === '') return 12;

    const annualRate = Number(configuredRate);
    if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) {
        throw new Error('SYSTEM_ANNUAL_INTEREST_RATE must be between 0 and 100');
    }
    return annualRate;
}

function calculateLoanTerms(principal, annualRate, termMonths) {
    if (!Number.isSafeInteger(principal) || principal <= 0) throw new Error('Principal must be a positive whole RWF amount');
    if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) throw new Error('Annual interest rate must be between 0 and 100');
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 360) throw new Error('Loan term must be between 1 and 360 months');

    const monthlyRate = annualRate / 1200;
    const rawPayment = monthlyRate === 0
        ? principal / termMonths
        : principal * monthlyRate * ((1 + monthlyRate) ** termMonths) / (((1 + monthlyRate) ** termMonths) - 1);
    const monthlyPayment = Math.round(rawPayment);
    const expectedInterest = Math.max(0, Math.round(rawPayment * termMonths - principal));
    return { monthlyPayment, expectedInterest };
}

function calculateAccruedInterest(principal, annualRate, fromDate, toDate) {
    const elapsedDays = Math.max(0, (new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000);
    return Math.round(principal * (annualRate / 100) * (elapsedDays / 365.25));
}

function allocateRepayment(amount, outstandingPrincipal, interestDue) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Repayment must be a positive whole RWF amount');
    if (amount > outstandingPrincipal + interestDue) throw new Error('Repayment exceeds the current balance due');

    const interestPortion = Math.min(amount, interestDue);
    const principalPortion = amount - interestPortion;
    return {
        interestPortion,
        principalPortion,
        remainingInterest: interestDue - interestPortion,
        remainingPrincipal: outstandingPrincipal - principalPortion
    };
}

function applyLoanDisbursement(balance, amount) {
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Account balance must be a non-negative whole RWF amount');
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Loan amount must be a positive whole RWF amount');

    const balanceAfter = balance + amount;
    if (!Number.isSafeInteger(balanceAfter)) throw new Error('Loan disbursement exceeds the safe account balance');
    return { balanceAfter };
}

module.exports = { getSystemAnnualInterestRate, calculateLoanTerms, calculateAccruedInterest, allocateRepayment, applyLoanDisbursement };