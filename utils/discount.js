const Product = require('../models/Product');
const Collection = require('../models/Collection');
const { buildSmartFilter } = require('./collectionQuery');

/**
 * Resolve every product id belonging to the given collections (manual +
 * smart), as a Set of string ids, for use in coupon "applies to" checks.
 */
const resolveCollectionProductIds = async (collectionIds = []) => {
    if (!collectionIds.length) return new Set();
    const collections = await Collection.find({ _id: { $in: collectionIds } });
    const ids = new Set();

    await Promise.all(
        collections.map(async (col) => {
            let products;
            if (col.type === 'smart') {
                products = await Product.find(buildSmartFilter(col.conditions, col.matchType)).select('_id');
            } else {
                products = await Product.find({ collections: col._id }).select('_id');
            }
            products.forEach((p) => ids.add(String(p._id)));
        })
    );
    return ids;
};

/**
 * Filter cart line items down to the ones eligible under a coupon's
 * appliesTo / productIds / collectionIds targeting.
 * @param {Array<{productId:string, price:number, quantity:number}>} items
 */
const filterEligibleItems = (items, appliesTo, productIdSet, collectionProductIdSet) => {
    if (appliesTo === 'all') return items;
    if (appliesTo === 'products') return items.filter((i) => productIdSet.has(String(i.productId)));
    if (appliesTo === 'collections') return items.filter((i) => collectionProductIdSet.has(String(i.productId)));
    return [];
};

/**
 * Evaluate a coupon against a cart and return the discount + whether
 * shipping becomes free. Throws a user-facing Error when the coupon does
 * not apply (expired, minimum order not met, no eligible items, etc.).
 *
 * @param {import('../models/Coupon')} coupon
 * @param {Array<{productId:string, price:number, quantity:number}>} items - resolved unit prices
 * @param {number} subtotal
 */
const evaluateCoupon = async (coupon, items, subtotal) => {
    coupon.checkBasicEligibility(subtotal);

    if (coupon.discountType === 'free_shipping') {
        return { discount: 0, freeShipping: true };
    }

    if (coupon.discountType === 'amount_off_order') {
        let discount = coupon.valueType === 'percentage' ? (subtotal * coupon.value) / 100 : coupon.value;
        if (coupon.valueType === 'percentage' && coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
        return { discount: Math.min(discount, subtotal), freeShipping: false };
    }

    const productIdSet = new Set((coupon.productIds || []).map(String));

    if (coupon.discountType === 'amount_off_products') {
        const collectionProductIdSet = await resolveCollectionProductIds(coupon.collectionIds);
        const eligible = filterEligibleItems(items, coupon.appliesTo, productIdSet, collectionProductIdSet);
        const eligibleSubtotal = eligible.reduce((s, i) => s + i.price * i.quantity, 0);
        if (eligibleSubtotal <= 0) throw new Error('No items in your cart qualify for this coupon');

        let discount =
            coupon.valueType === 'percentage' ? (eligibleSubtotal * coupon.value) / 100 : Math.min(coupon.value, eligibleSubtotal);
        if (coupon.valueType === 'percentage' && coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
        return { discount: Math.min(discount, eligibleSubtotal), freeShipping: false };
    }

    if (coupon.discountType === 'buy_x_get_y') {
        const buyCollectionIds = await resolveCollectionProductIds(coupon.collectionIds);
        const buyPool = filterEligibleItems(items, coupon.appliesTo, productIdSet, buyCollectionIds);
        const buyQtyTotal = buyPool.reduce((s, i) => s + i.quantity, 0);
        const sets = Math.floor(buyQtyTotal / coupon.buyQuantity);
        if (sets <= 0) {
            throw new Error(`Add ${coupon.buyQuantity} qualifying item(s) to your cart to unlock this offer`);
        }

        // "Get" pool defaults to the same eligible products as "buy" when not set separately.
        const hasGetTargets = (coupon.getProductIds || []).length > 0 || (coupon.getCollectionIds || []).length > 0;
        let getPool = buyPool;
        if (hasGetTargets) {
            const getProductIdSet = new Set((coupon.getProductIds || []).map(String));
            const getCollectionProductIdSet = await resolveCollectionProductIds(coupon.getCollectionIds);
            getPool = items.filter(
                (i) => getProductIdSet.has(String(i.productId)) || getCollectionProductIdSet.has(String(i.productId))
            );
        }

        // Flatten to individual units, cheapest first, so the discount favors the customer.
        const units = [];
        getPool.forEach((i) => {
            for (let k = 0; k < i.quantity; k++) units.push(i.price);
        });
        units.sort((a, b) => a - b);

        const unitsToDiscount = Math.min(sets * coupon.getQuantity, units.length);
        const discountRate = coupon.getDiscountType === 'free' ? 1 : coupon.getDiscountValue / 100;
        const discount = units.slice(0, unitsToDiscount).reduce((s, price) => s + price * discountRate, 0);

        return { discount: Math.min(discount, subtotal), freeShipping: false };
    }

    throw new Error('Unsupported coupon type');
};

module.exports = { evaluateCoupon, resolveCollectionProductIds };
