const mongoose = require('mongoose');
const { Schema } = mongoose;

const transactionSchema = new Schema(
    {
        type: {
            type: String,
            enum: ['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'loan_payment', 'loan_disbursement', 'manual_adjustment'],
            required: true
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        balanceAfter: {
            type: Number,
            required: true,
            default: 0
        },
        description: {
            type: String,
            trim: true,
            default: 'Bank transaction'
        },
        relatedAccountId: {
            type: Schema.Types.ObjectId,
            ref: 'BankAccount'
        },
        paymentProvider: {
            type: String,
            trim: true
        },
        paymentReference: {
            type: String,
            trim: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    { _id: true }
);

const bankAccountSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        bankId: {
            type: Schema.Types.ObjectId,
            ref: 'Bank',
            required: true
        },
        branchId: {
            type: Schema.Types.ObjectId,
            required: true
        },
        accountNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            match: /^\d{12}$/
        },
        accountName: {
            type: String,
            required: true,
            trim: true
        },
        identityDocumentType: {
            type: String,
            enum: ['national_id', 'passport']
        },
        identityDocumentPublicId: {
            type: String,
            select: false
        },
        identityDocumentFormat: {
            type: String,
            enum: ['jpg', 'png', 'pdf'],
            select: false
        },
        identityDocumentUploadedAt: {
            type: Date,
            select: false
        },
        identityDocumentViewedAt: {
            type: Date,
            select: false
        },
        identityDocumentViewedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            select: false
        },
        identityDocumentReviewedAt: {
            type: Date,
            select: false
        },
        identityDocumentReviewedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            select: false
        },
        balance: {
            type: Number,
            default: 0,
            min: 0
        },
        status: {
            type: String,
            enum: ['pending', 'active', 'inactive'],
            default: 'active'
        },
        pendingPaymentId: {
            type: Schema.Types.ObjectId,
            ref: 'PaymentAttempt'
        },
        transactions: {
            type: [transactionSchema],
            default: []
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('BankAccount', bankAccountSchema);
