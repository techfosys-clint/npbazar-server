const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Recompute a product's rating + review count from approved reviews.
const recomputeProductRating = async (productId) => {
    const stats = await Review.aggregate([
        { $match: { product: productId, isApproved: true } },
        { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const { avg = 0, count = 0 } = stats[0] || {};
    await Product.updateOne({ _id: productId }, { rating: Math.round(avg * 10) / 10, numReviews: count });
};

// GET /api/products/:productId/reviews  (public) — approved reviews only
exports.listForProduct = async (req, res) => {
    const reviews = await Review.find({ product: req.params.productId, isApproved: true })
        .populate('user', 'name')
        .sort({ createdAt: -1 });
    res.json({ success: true, reviews });
};

// POST /api/products/:productId/reviews  (user)  body: { rating, comment }
exports.create = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        if (!rating) return res.status(400).json({ success: false, message: 'rating is required' });

        const product = await Product.findById(req.params.productId).select('_id');
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        // Only allow reviews from users who purchased the product.
        const purchased = await Order.exists({
            user: req.user._id,
            'items.product': product._id,
            orderStatus: { $ne: 'cancelled' },
        });
        if (!purchased) {
            return res.status(403).json({ success: false, message: 'You can only review products you have purchased' });
        }

        const review = await Review.create({
            product: product._id,
            user: req.user._id,
            rating,
            comment,
        });
        await recomputeProductRating(product._id);

        res.status(201).json({ success: true, review });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'You have already reviewed this product' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// ---------- Admin ----------

// GET /api/admin-reviews  (admin)  ?approved=true|false
exports.adminList = async (req, res) => {
    const filter = {};
    if (req.query.approved != null) filter.isApproved = req.query.approved === 'true';
    const reviews = await Review.find(filter)
        .populate('user', 'name mobile')
        .populate('product', 'name slug')
        .sort({ createdAt: -1 });
    res.json({ success: true, reviews });
};

// PATCH /api/admin-reviews/:id  (admin)  body: { isApproved }
exports.adminUpdate = async (req, res) => {
    const review = await Review.findByIdAndUpdate(
        req.params.id,
        { isApproved: req.body.isApproved },
        { new: true }
    );
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    await recomputeProductRating(review.product);
    res.json({ success: true, review });
};

// DELETE /api/admin-reviews/:id  (admin)
exports.adminRemove = async (req, res) => {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    await recomputeProductRating(review.product);
    res.json({ success: true, message: 'Review deleted' });
};
