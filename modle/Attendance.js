const mongoose = require('mongoose');
const { Schema } = mongoose;

const attendanceSchema = new Schema({
    employee: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bankId: { type: Schema.Types.ObjectId, ref: 'Bank', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, required: true, index: true },
    branchName: { type: String, required: true },
    dayKey: { type: String, required: true },
    checkInAt: { type: Date, required: true, default: Date.now },
    checkOutAt: { type: Date },
    status: { type: String, enum: ['present'], required: true, default: 'present' },
    photoConsentAt: { type: Date, required: true },
    photoPublicId: { type: String, select: false },
    photoCiphertext: { type: Buffer, select: false },
    photoIv: { type: Buffer, select: false },
    photoAuthTag: { type: Buffer, select: false }
}, { timestamps: true });

attendanceSchema.index({ employee: 1, dayKey: 1 }, { unique: true });
attendanceSchema.index({ bankId: 1, checkInAt: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
