const mongoose = require('mongoose');
const { Schema } = mongoose;

const repaymentSchema = new Schema({
    amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    interestPortion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    principalPortion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paidAt: { type: Date, required: true, default: Date.now }
}, { _id: false });

const loanApplicationSchema = new Schema({
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicantName: { type: String, required: true },
    applicantEmail: { type: String, required: true },
    bank: { type: Schema.Types.ObjectId, ref: 'Bank', required: true, index: true },
    bankName: { type: String, required: true },
    branchId: { type: Schema.Types.ObjectId, required: true, index: true },
    branchName: { type: String, required: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    purpose: { type: String, required: true, trim: true },
    termMonths: { type: Number, required: true, min: 1, max: 360, validate: Number.isInteger },
    hasExternalLoans: { type: Boolean, default: false },
    externalLoanDetails: { type: String, default: 'None reported', trim: true },
    annualInterestRate: { type: Number, min: 0, max: 100 },
    monthlyPayment: { type: Number, min: 0, default: 0 },
    expectedInterest: { type: Number, min: 0, default: 0 },
    outstandingPrincipal: { type: Number, min: 0, default: 0 },
    unpaidInterest: { type: Number, min: 0, default: 0 },
    interestIncome: { type: Number, min: 0, default: 0 },
    principalRecovered: { type: Number, min: 0, default: 0 },
    loss: { type: Number, min: 0, default: 0 },
    repayments: { type: [repaymentSchema], default: [] },
    status: { type: String, enum: ['pending', 'approved', 'declined', 'repaid', 'defaulted'], default: 'pending', index: true },
    approvedAt: Date,
    lastPaymentAt: Date,
    defaultedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

loanApplicationSchema.index({ bank: 1, branchId: 1, status: 1 });

module.exports = mongoose.model('LoanApplication', loanApplicationSchema);