const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentAttemptSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'BankAccount', required: true, index: true },
    provider: { type: String, enum: ['paypack'], default: 'paypack', required: true },
    providerRef: { type: String, unique: true, sparse: true },
    idempotencyKey: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    status: { type: String, enum: ['initiating', 'pending', 'successful', 'failed'], default: 'initiating', index: true },
    failureMessage: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('PaymentAttempt', paymentAttemptSchema);