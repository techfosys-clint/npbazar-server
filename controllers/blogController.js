const Blog = require('../models/Blog');
const { slugify } = require('../utils/slugify');

// GET /api/blogs  (public + admin) — the blog "sections" (e.g. News)
exports.list = async (req, res) => {
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const blogs = await Blog.find(filter).sort({ name: 1 });
    res.json({ success: true, blogs });
};

// POST /api/blogs  (admin)
exports.create = async (req, res) => {
    try {
        const { name, isActive } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'name is required' });
        const blog = await Blog.create({ name, slug: slugify(name), isActive });
        res.status(201).json({ success: true, blog });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'A blog with this name already exists' });
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/blogs/:id  (admin)
exports.update = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.name) updates.slug = slugify(updates.name);
        const blog = await Blog.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
        res.json({ success: true, blog });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/blogs/:id  (admin)
exports.remove = async (req, res) => {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    res.json({ success: true, message: 'Blog deleted' });
};
