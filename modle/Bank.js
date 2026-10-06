const mongoose = require('mongoose');
const { Schema } = mongoose;

const branchSchema = new Schema({
    branchName: { type: String, required: true, trim: true },
    branchCode: { type: String, required: true, trim: true, uppercase: true },
    branchManager: { type: String, required: true, trim: true },
    location: {
        province: { type: String, required: true, trim: true },
        district: { type: String, required: true, trim: true },
        sector: { type: String, required: true, trim: true },
        cell: { type: String, required: true, trim: true },
        village: { type: String, required: true, trim: true }
    }
});

const bankSchema = new Schema(
    {
        bankName: { type: String, required: true, trim: true },
        accountNumber: { type: String, required: true, trim: true, unique: true },
        leadership: {
            generalManager: { type: String, required: true, trim: true },
            hrManager: { type: String, required: true, trim: true },
            financeManager: {
                name: { type: String, required: true, trim: true },
                email: { type: String, required: true, trim: true, lowercase: true }
            },
            accountsManager: { type: String, required: true, trim: true }
        },
        branches: { type: [branchSchema], default: [] },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }
    },
    { timestamps: true }
);

bankSchema.index({ bankName: 1 });
bankSchema.index({ 'branches.branchCode': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Bank', bankSchema);
