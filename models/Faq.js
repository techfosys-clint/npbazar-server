const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema(
    {
        question: { type: String, required: [true, 'Question is required'], trim: true },
        answer: { type: String, required: [true, 'Answer is required'] },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Faq', faqSchema);
