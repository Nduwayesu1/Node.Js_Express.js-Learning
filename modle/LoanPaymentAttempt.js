const mongoose = require('mongoose');
const { Schema } = mongoose;

const loanPaymentAttemptSchema = new Schema({
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    loan: { type: Schema.Types.ObjectId, ref: 'LoanApplication', required: true },
    idempotencyKey: { type: String, required: true },
    reference: { type: String, required: true },
    receiptNumber: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, enum: ['RWF'], required: true },
    channel: {
        type: String,
        enum: ['mtn_mobile_money', 'airtel_mobile_money', 'bank_transfer', 'virtual_account', 'bank_account'],
        required: true
    },
    status: { type: String, enum: ['succeeded', 'failed'], required: true },
    processedAt: { type: Date, required: true }
}, { timestamps: true });

loanPaymentAttemptSchema.index({ applicant: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model('LoanPaymentAttempt', loanPaymentAttemptSchema);
