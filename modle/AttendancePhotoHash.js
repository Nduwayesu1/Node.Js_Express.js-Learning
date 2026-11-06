const mongoose = require('mongoose');
const { Schema } = mongoose;

const attendancePhotoHashSchema = new Schema({
    sha256: { type: String, required: true, unique: true, match: /^[a-f0-9]{64}$/ },
    employee: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('AttendancePhotoHash', attendancePhotoHashSchema);
