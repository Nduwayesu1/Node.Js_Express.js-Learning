const mongoose = require('mongoose');
const { Schema } = mongoose;

const guestFeedbackSchema = new Schema({
    category: {
        type: String,
        enum: ['general', 'dashboard', 'loan-process', 'payments', 'accessibility'],
        required: true
    },
    rating: { type: Number, min: 1, max: 5, required: true, validate: Number.isInteger },
    message: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    reviewedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('GuestFeedback', guestFeedbackSchema);
