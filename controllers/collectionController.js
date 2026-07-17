const Collection = require('../models/Collection');
const Product = require('../models/Product');
const { slugify } = require('../utils/slugify');
const { buildSmartFilter } = require('../utils/collectionQuery');

// Resolve the products belonging to a collection (manual: tagged; smart: by conditions).
const resolveProducts = (collection, extraFilter = {}) => {
    const filter =
        collection.type === 'smart'
            ? { ...buildSmartFilter(collection.conditions, collection.matchType), ...extraFilter }
            : { collections: collection._id, ...extraFilter };
    return Product.find(filter).select('name slug thumbnail price stock isActive');
};

// GET /api/collections  (public: active only; ?all=true admin includes inactive)
exports.list = async (req, res) => {
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const search = req.query.search;
    if (search) filter.name = new RegExp(search, 'i');

    const collections = await Collection.find(filter).populate('parent', 'name slug').sort({ order: 1, name: 1 });
    const withCounts = await Promise.all(
        collections.map(async (c) => ({
            ...c.toObject(),
            productCount: await Product.countDocuments(
                c.type === 'smart' ? buildSmartFilter(c.conditions, c.matchType) : { collections: c._id }
            ),
        }))
    );
    res.json({ success: true, collections: withCounts });
};

// GET /api/collections/:slug  (public) — collection + its resolved products
exports.getBySlug = async (req, res) => {
    const collection = await Collection.findOne({ slug: req.params.slug }).populate('parent', 'name slug');
    if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
    const products = await resolveProducts(collection, { isActive: true });
    res.json({ success: true, collection, products });
};

// POST /api/collections  (admin)
exports.create = async (req, res) => {
    try {
        const { name, description, image, parent, order, type, matchType, conditions, seoTitle, seoDescription, isActive } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'name is required' });

        const collection = await Collection.create({
            name,
            slug: slugify(name),
            description,
            image,
            parent: parent || null,
            order,
            type,
            matchType,
            conditions,
            seoTitle,
            seoDescription,
            isActive,
        });
        res.status(201).json({ success: true, collection });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'A collection with this name already exists' });
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/collections/:id  (admin)
exports.update = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.name) updates.slug = slugify(updates.name);
        if ('parent' in updates) updates.parent = updates.parent || null;
        const collection = await Collection.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
        res.json({ success: true, collection });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/collections/:id  (admin)
exports.remove = async (req, res) => {
    const collection = await Collection.findByIdAndDelete(req.params.id);
    if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
    // Clean up references so products/sub-collections don't point at a deleted collection.
    await Product.updateMany({ collections: collection._id }, { $pull: { collections: collection._id } });
    await Collection.updateMany({ parent: collection._id }, { parent: null });
    res.json({ success: true, message: 'Collection deleted' });
};

// GET /api/collections/:id/products  (admin) — current products in a manual collection, or matches for a smart one
exports.products = async (req, res) => {
    const collection = await Collection.findById(req.params.id);
    if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
    const products = await resolveProducts(collection);
    res.json({ success: true, products });
};

// POST /api/collections/:id/products  (admin, manual only)  body: { productId }
exports.addProduct = async (req, res) => {
    const collection = await Collection.findById(req.params.id);
    if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
    if (collection.type !== 'manual') {
        return res.status(400).json({ success: false, message: 'Products are added automatically to smart collections' });
    }
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

    await Product.updateOne({ _id: productId }, { $addToSet: { collections: collection._id } });
    res.status(201).json({ success: true, message: 'Product added to collection' });
};

// DELETE /api/collections/:id/products/:productId  (admin, manual only)
exports.removeProduct = async (req, res) => {
    const collection = await Collection.findById(req.params.id);
    if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });

    await Product.updateOne({ _id: req.params.productId }, { $pull: { collections: collection._id } });
    res.json({ success: true, message: 'Product removed from collection' });
};
