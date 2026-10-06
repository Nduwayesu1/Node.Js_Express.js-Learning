const mongoose = require('mongoose');
const { Schema } = mongoose;

const payrollBatchSchema = new Schema({
    bank: {
        type: Schema.Types.ObjectId,
        ref: 'Bank',
        required: true
    },
    branchId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    bankName: {
        type: String,
        required: true
    },
    branchName: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
        validate: Number.isSafeInteger
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 1,
        validate: Number.isSafeInteger
    },
    currency: {
        type: String,
        enum: ['RWF'],
        default: 'RWF'
    },
    employees: [{
        employee: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: { type: String, required: true },
        email: { type: String, required: true }
    }],
    status: {
        type: String,
        enum: ['queued'],
        default: 'queued'
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

payrollBatchSchema.path('employees').validate(employees => employees.length > 0, 'Select at least one employee');

module.exports = mongoose.model('PayrollBatch', payrollBatchSchema);