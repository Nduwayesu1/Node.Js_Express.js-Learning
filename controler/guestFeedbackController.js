const mongoose = require('mongoose');
const GuestFeedback = require('../modle/GuestFeedback');

async function submitGuestFeedback(req, res) {
    const category = typeof req.body.category === 'string' ? req.body.category : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const rating = Number(req.body.rating);
    const allowedCategories = ['general', 'dashboard', 'loan-process', 'payments', 'accessibility'];

    if (!allowedCategories.includes(category)) {
        return res.status(400).json({ message: 'Choose a valid feedback category' });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }
    if (message.length < 10 || message.length > 2000) {
        return res.status(400).json({ message: 'Feedback must be between 10 and 2000 characters' });
    }

    try {
        const feedback = await GuestFeedback.create({ category, rating, message });
        return res.status(201).json({ message: 'Thank you. Your anonymous feedback was submitted.', feedback: { _id: feedback._id } });
    } catch (error) {
        console.error('Guest feedback submission failed:', error.message);
        return res.status(500).json({ message: 'Unable to save feedback right now' });
    }
}

async function listGuestFeedback(_req, res) {
    try {
        const feedback = await GuestFeedback.find().sort({ createdAt: -1 }).limit(200).lean();
        return res.status(200).json({ feedback });
    } catch (error) {
        console.error('Guest feedback lookup failed:', error.message);
        return res.status(500).json({ message: 'Unable to load guest feedback' });
    }
}

async function markGuestFeedbackReviewed(req, res) {
    if (!mongoose.Types.ObjectId.isValid(req.params.feedbackId)) {
        return res.status(400).json({ message: 'A valid feedback record is required' });
    }
    try {
        const feedback = await GuestFeedback.findByIdAndUpdate(
            req.params.feedbackId,
            { reviewedAt: new Date() },
            { new: true, runValidators: true }
        );
        if (!feedback) return res.status(404).json({ message: 'Feedback record not found' });
        return res.status(200).json({ message: 'Feedback marked as reviewed', feedback });
    } catch (error) {
        console.error('Guest feedback review update failed:', error.message);
        return res.status(500).json({ message: 'Unable to update feedback status' });
    }
}

module.exports = { submitGuestFeedback, listGuestFeedback, markGuestFeedbackReviewed };
