const mongoose = require('mongoose');
const { Schema } = mongoose;

const loanPaymentAttemptSchema = new Schema({
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    loan: { type: Schema.Types.ObjectId, ref: 'LoanApplication', required: true },
    idempotencyKey: { type: String, required: true },
    reference: { type: String, required: true },
    receiptNumber: { type: String },
    accountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, enum: ['RWF'], required: true },
    channel: {
        type: String,
        enum: ['mtn_mobile_money', 'airtel_mobile_money', 'bank_transfer', 'virtual_account', 'bank_account', 'midtrans_va'],
        required: true
    },
    status: { type: String, enum: ['pending', 'succeeded', 'failed', 'expired'], required: true },
    processedAt: { type: Date },
    providerAmount: { type: Number, min: 1, validate: Number.isSafeInteger },
    providerCurrency: { type: String, enum: ['IDR'] },
    providerBank: { type: String },
    providerPartnerServiceId: { type: String, select: false },
    providerCustomerNo: { type: String, select: false },
    providerVirtualAccountNo: { type: String },
    providerVirtualAccountName: { type: String },
    providerExpiresAt: { type: Date }
}, { timestamps: true });

loanPaymentAttemptSchema.index({ applicant: 1, idempotencyKey: 1 }, { unique: true });
loanPaymentAttemptSchema.index(
    { loan: 1 },
    { unique: true, partialFilterExpression: { channel: 'midtrans_va', status: 'pending' } }
);

module.exports = mongoose.model('LoanPaymentAttempt', loanPaymentAttemptSchema);
