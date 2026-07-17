const mongoose = require('mongoose');

// Four Shopify-style discount shapes:
//  - amount_off_order    : % or ৳ off the whole order subtotal
//  - amount_off_products : % or ৳ off only the items that match appliesTo
//  - buy_x_get_y         : buy N qualifying items, get M items discounted/free
//  - free_shipping       : shipping cost becomes 0
const DISCOUNT_TYPES = ['amount_off_order', 'amount_off_products', 'buy_x_get_y', 'free_shipping'];
const APPLIES_TO = ['all', 'products', 'collections'];

const couponSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, unique: true, uppercase: true, trim: true },
        discountType: { type: String, enum: DISCOUNT_TYPES, default: 'amount_off_order' },

        // --- amount_off_order / amount_off_products ---
        valueType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
        value: { type: Number, default: 0, min: 0 },
        maxDiscount: { type: Number, default: 0, min: 0 }, // cap for percentage discounts (0 = no cap)

        // Which products the discount can apply to (amount_off_products) or
        // count towards the "buy" side of buy_x_get_y.
        appliesTo: { type: String, enum: APPLIES_TO, default: 'all' },
        productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        collectionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],

        // --- buy_x_get_y ---
        buyQuantity: { type: Number, default: 1, min: 1 },
        getQuantity: { type: Number, default: 1, min: 1 },
        getDiscountType: { type: String, enum: ['percentage', 'free'], default: 'free' },
        getDiscountValue: { type: Number, default: 100, min: 0, max: 100 }, // % off the "get" items
        // Optional separate pool for the "get" side; defaults to the same pool as "buy" when empty.
        getProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        getCollectionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],

        minOrder: { type: Number, default: 0 }, // minimum cart subtotal to qualify
        usageLimit: { type: Number, default: 0 }, // total redemptions allowed (0 = unlimited)
        usedCount: { type: Number, default: 0 },
        expiresAt: { type: Date, default: null },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

couponSchema.methods.checkBasicEligibility = function (subtotal) {
    if (!this.isActive) throw new Error('Coupon is not active');
    if (this.expiresAt && this.expiresAt < new Date()) throw new Error('Coupon has expired');
    if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) throw new Error('Coupon usage limit reached');
    if (subtotal < this.minOrder) throw new Error(`Minimum order of ${this.minOrder} required for this coupon`);
};

module.exports = mongoose.model('Coupon', couponSchema);
module.exports.DISCOUNT_TYPES = DISCOUNT_TYPES;
module.exports.APPLIES_TO = APPLIES_TO;
