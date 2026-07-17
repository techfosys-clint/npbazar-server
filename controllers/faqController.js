const Faq = require('../models/Faq');

// GET /api/faqs  (public) — active FAQs in order; ?all=true (admin) includes inactive
exports.list = async (req, res) => {
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const faqs = await Faq.find(filter).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, faqs });
};

// POST /api/faqs  (admin)
exports.create = async (req, res) => {
    try {
        const { question, answer, order, isActive } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ success: false, message: 'question and answer are required' });
        }
        const faq = await Faq.create({ question, answer, order, isActive });
        res.status(201).json({ success: true, faq });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/faqs/:id  (admin)
exports.update = async (req, res) => {
    try {
        const faq = await Faq.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
        res.json({ success: true, faq });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/faqs/:id  (admin)
exports.remove = async (req, res) => {
    const faq = await Faq.findByIdAndDelete(req.params.id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
    res.json({ success: true, message: 'FAQ deleted' });
};
