const BlogPost = require('../models/BlogPost');
const { slugify } = require('../utils/slugify');

/**
 * GET /api/blog-posts  (public: visible only; ?all=true admin includes hidden)
 * ?blog=<id> filters by blog section, ?search= full-text search, pagination.
 */
exports.list = async (req, res) => {
    const { blog, search, all } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(60, parseInt(req.query.limit) || 12);

    const filter = {};
    if (all !== 'true') filter.visibility = 'visible';
    if (blog) filter.blog = blog;
    if (search) {
        filter.$or = [
            { title: new RegExp(search, 'i') },
            { content: new RegExp(search, 'i') },
            { tags: new RegExp(search, 'i') },
        ];
    }

    const [posts, total] = await Promise.all([
        BlogPost.find(filter)
            .populate('blog', 'name slug')
            .sort({ publishedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        BlogPost.countDocuments(filter),
    ]);

    res.json({ success: true, posts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

// GET /api/blog-posts/:slug  (public)
exports.getBySlug = async (req, res) => {
    const post = await BlogPost.findOne({ slug: req.params.slug }).populate('blog', 'name slug');
    if (!post) return res.status(404).json({ success: false, message: 'Blog post not found' });
    res.json({ success: true, post });
};

// POST /api/blog-posts  (admin)
exports.create = async (req, res) => {
    try {
        const { title, content, blog } = req.body;
        if (!title || !content || !blog) {
            return res.status(400).json({ success: false, message: 'title, content and blog are required' });
        }
        const post = await BlogPost.create({
            ...req.body,
            slug: slugify(title),
            author: req.body.author || req.admin.fullName,
            createdByAdmin: req.admin._id,
        });
        res.status(201).json({ success: true, post });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'A post with this title already exists' });
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/blog-posts/:id  (admin)
exports.update = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.title) updates.slug = slugify(updates.title);
        const post = await BlogPost.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!post) return res.status(404).json({ success: false, message: 'Blog post not found' });
        res.json({ success: true, post });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/blog-posts/:id  (admin)
exports.remove = async (req, res) => {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Blog post not found' });
    res.json({ success: true, message: 'Blog post deleted' });
};
