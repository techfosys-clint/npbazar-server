const Coupon = require('../models/Coupon');
const Product = require('../models/Product');
const { evaluateCoupon } = require('../utils/discount');
const { getEffectivePrice } = require('./../utils/pricing');

// GET /api/coupons  (admin)
exports.list = async (req, res) => {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ success: true, coupons });
};

// POST /api/coupons  (admin)
exports.create = async (req, res) => {
    try {
        const { code, discountType, value } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'code is required' });
        if (['amount_off_order', 'amount_off_products'].includes(discountType) && value == null) {
            return res.status(400).json({ success: false, message: 'value is required for this discount type' });
        }
        const coupon = await Coupon.create({ ...req.body, code: code.toUpperCase() });
        res.status(201).json({ success: true, coupon });
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Coupon code already exists' });
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/coupons/:id  (admin)
exports.update = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (updates.code) updates.code = updates.code.toUpperCase();
        const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
        res.json({ success: true, coupon });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/coupons/:id  (admin)
exports.remove = async (req, res) => {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, message: 'Coupon deleted' });
};

/**
 * POST /api/coupons/validate  (user)
 * Body: { code, items: [{ productId, quantity, variant? }] }
 * Resolves live prices for the given items and evaluates the coupon against
 * them (handles all four discount types: order/product/BOGO/free-shipping).
 */
exports.validate = async (req, res) => {
    try {
        const { code, items: reqItems } = req.body;
        if (!code || !Array.isArray(reqItems) || reqItems.length === 0) {
            return res.status(400).json({ success: false, message: 'code and a non-empty items array are required' });
        }

        const coupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon code' });

        const products = await Product.find({ _id: { $in: reqItems.map((i) => i.productId) } });
        const byId = new Map(products.map((p) => [String(p._id), p]));

        const items = reqItems.map((i) => {
            const product = byId.get(String(i.productId));
            if (!product) throw new Error('A product in your cart no longer exists');
            const price = getEffectivePrice(product, i.variant || {});
            return { productId: i.productId, price, quantity: Number(i.quantity) || 1 };
        });
        const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

        const { discount, freeShipping } = await evaluateCoupon(coupon, items, subtotal);

        res.json({
            success: true,
            coupon: { code: coupon.code, discountType: coupon.discountType },
            discount,
            freeShipping,
            total: subtotal - discount,
        });
    } catch (err) {
        // evaluateCoupon throws user-facing reasons (expired, min order, no eligible items, etc.)
        res.status(400).json({ success: false, message: err.message });
    }
};
