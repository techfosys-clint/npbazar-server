const Brand = require('../models/Brand');
const { slugify } = require('../utils/slugify');

// GET /api/brands  (public); ?all=true includes inactive (admin)
exports.list = async (req, res) => {
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const brands = await Brand.find(filter).sort({ name: 1 });
    res.json({ success: true, brands });
};

// GET /api/brands/:slug  (public)
exports.getBySlug = async (req, res) => {
    const brand = await Brand.findOne({ slug: req.params.slug });
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, brand });
};

// POST /api/brands  (admin)
exports.create = async (req, res) => {
    try {
        const { name, logo, description, isActive } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'name is required' });
        const brand = await Brand.create({ name, slug: slugify(name), logo, description, isActive });
        res.status(201).json({ success: true, brand });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Brand already exists' });
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/brands/:id  (admin)
exports.update = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.name) updates.slug = slugify(updates.name);
        const brand = await Brand.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
        res.json({ success: true, brand });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/brands/:id  (admin)
exports.remove = async (req, res) => {
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, message: 'Brand deleted' });
};
