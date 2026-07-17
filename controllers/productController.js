const Product = require('../models/Product');
const Collection = require('../models/Collection');
const Brand = require('../models/Brand');
const { slugify } = require('../utils/slugify');
const { generateSku } = require('../utils/sku');

// '' / undefined -> null (unlimited stock); everything else passes through untouched.
const normalizeStock = (stock) => (stock === '' || stock === undefined ? null : stock);

/**
 * GET /api/products  (public)
 * Query: search, collection(slug), brand(slug), minPrice, maxPrice, featured,
 *        sort(newest|price_asc|price_desc|popular|rating), page, limit, all(admin)
 */
exports.list = async (req, res) => {
    try {
        const { search, collection, brand, minPrice, maxPrice, featured, bestSelling, sort, all } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(60, parseInt(req.query.limit) || 12);

        const filter = {};
        if (all !== 'true') filter.isActive = true;
        if (featured === 'true') filter.isFeatured = true;
        if (bestSelling === 'true') filter.isBestSelling = true;
        if (search) {
            const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { name: new RegExp(safeSearch, 'i') },
                { sku: new RegExp(safeSearch, 'i') },
                { tags: new RegExp(safeSearch, 'i') },
            ];
        }

        if (collection) {
            const col = await Collection.findOne({ slug: collection }).select('_id');
            filter.collections = col ? col._id : null; // matches if the collections array contains this id
        }
        if (brand) {
            const b = await Brand.findOne({ slug: brand }).select('_id');
            filter.brand = b ? b._id : null;
        }
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }

        const sortMap = {
            newest: { createdAt: -1 },
            price_asc: { price: 1 },
            price_desc: { price: -1 },
            popular: { sold: -1 },
            rating: { rating: -1 },
        };
        const sortBy = sortMap[sort] || { createdAt: -1 };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate('collections', 'name slug')
                .populate('brand', 'name slug')
                .sort(sortBy)
                .skip((page - 1) * limit)
                .limit(limit),
            Product.countDocuments(filter),
        ]);

        res.json({
            success: true,
            products,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/products/:slug  (public)
exports.getBySlug = async (req, res) => {
    const product = await Product.findOne({ slug: req.params.slug })
        .populate('collections', 'name slug')
        .populate('brand', 'name slug');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
};

// POST /api/products  (admin)
exports.create = async (req, res) => {
    try {
        const { name, collections } = req.body;
        if (!name || !Array.isArray(collections) || collections.length === 0) {
            return res.status(400).json({ success: false, message: 'name and at least one collection are required' });
        }
        const payload = { ...req.body, slug: slugify(name), stock: normalizeStock(req.body.stock) };
        if (!payload.sku || !payload.sku.trim()) {
            payload.sku = await generateSku(name);
        }
        const product = await Product.create(payload);
        res.status(201).json({ success: true, product });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Product slug already exists' });
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/products/:id  (admin)
exports.update = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.name) updates.slug = slugify(updates.name);
        // Aggregates are maintained by the system, not client updates.
        delete updates.rating;
        delete updates.numReviews;
        if ('stock' in updates) updates.stock = normalizeStock(updates.stock);
        if ('sku' in updates && !updates.sku.trim()) {
            updates.sku = await generateSku(updates.name);
        }
        const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/products/:id  (admin)
exports.remove = async (req, res) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
};

// POST /api/products/bulk-delete (admin)
exports.bulkDelete = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No IDs provided' });
        }
        await Product.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, message: `${ids.length} products deleted` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/products/bulk-duplicate (admin)
exports.bulkDuplicate = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No IDs provided' });
        }
        
        const products = await Product.find({ _id: { $in: ids } });
        const newProducts = [];
        
        for (const p of products) {
            const productData = p.toObject();
            delete productData._id;
            delete productData.createdAt;
            delete productData.updatedAt;
            delete productData.sold;
            delete productData.rating;
            delete productData.numReviews;
            
            productData.name = `${productData.name} (Copy)`;
            productData.slug = slugify(productData.name) + '-' + Date.now();
            productData.sku = await generateSku(productData.name);
            
            newProducts.push(productData);
        }
        
        await Product.insertMany(newProducts);
        res.json({ success: true, message: `${newProducts.length} products duplicated` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/products/bulk-status (admin)
exports.bulkUpdateStatus = async (req, res) => {
    try {
        const { ids, isActive } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No IDs provided' });
        }
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ success: false, message: 'isActive boolean required' });
        }
        
        await Product.updateMany({ _id: { $in: ids } }, { $set: { isActive } });
        res.json({ success: true, message: `${ids.length} products updated` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
