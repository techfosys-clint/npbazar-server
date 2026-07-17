const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { getEffectivePrice } = require('../utils/pricing');

// Load the user's cart, populate products, and compute a live total from current
// prices (honoring per-variant prices when the selected option defines one).
const buildCartResponse = async (userId) => {
    const cart = await Cart.findOne({ user: userId }).populate(
        'items.product',
        'name slug price comparePrice thumbnail stock isActive variants'
    );
    if (!cart) return { items: [], subtotal: 0, count: 0 };

    // Drop items whose product was deleted/deactivated.
    const validItems = cart.items.filter((i) => i.product && i.product.isActive);
    const priced = validItems.map((i) => {
        const unitPrice = getEffectivePrice(i.product, i.variant);
        return {
            product: i.product,
            quantity: i.quantity,
            variant: i.variant,
            unitPrice,
            lineTotal: unitPrice * i.quantity,
        };
    });
    const subtotal = priced.reduce((sum, i) => sum + i.lineTotal, 0);
    const count = priced.reduce((sum, i) => sum + i.quantity, 0);

    return { items: priced, subtotal, count };
};

// GET /api/cart
exports.getCart = async (req, res) => {
    const cart = await buildCartResponse(req.user._id);
    res.json({ success: true, cart });
};

// POST /api/cart  body: { productId, quantity, variant }
exports.addItem = async (req, res) => {
    try {
        const { productId, quantity = 1, variant = {} } = req.body;
        if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({ success: false, message: 'Product not available' });
        }
        if (product.stock !== null && product.stock < quantity) {
            return res.status(400).json({ success: false, message: 'Not enough stock' });
        }

        let cart = await Cart.findOne({ user: req.user._id });
        if (!cart) cart = new Cart({ user: req.user._id, items: [] });

        // Merge with an existing line that has the same product + variant.
        const variantKey = JSON.stringify(variant);
        const existing = cart.items.find(
            (i) => i.product.toString() === productId && JSON.stringify(Object.fromEntries(i.variant || [])) === variantKey
        );
        if (existing) {
            existing.quantity += Number(quantity);
        } else {
            cart.items.push({ product: productId, quantity: Number(quantity), variant });
        }
        await cart.save();

        const result = await buildCartResponse(req.user._id);
        res.status(201).json({ success: true, cart: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/cart/item  body: { productId, quantity }  (absolute quantity; 0 removes)
exports.updateItem = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        if (!productId || quantity == null) {
            return res.status(400).json({ success: false, message: 'productId and quantity are required' });
        }

        const cart = await Cart.findOne({ user: req.user._id });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        if (Number(quantity) <= 0) {
            cart.items = cart.items.filter((i) => i.product.toString() !== productId);
        } else {
            const item = cart.items.find((i) => i.product.toString() === productId);
            if (!item) return res.status(404).json({ success: false, message: 'Item not in cart' });
            item.quantity = Number(quantity);
        }
        await cart.save();

        const result = await buildCartResponse(req.user._id);
        res.json({ success: true, cart: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/cart/item/:productId
exports.removeItem = async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });
    cart.items = cart.items.filter((i) => i.product.toString() !== req.params.productId);
    await cart.save();
    const result = await buildCartResponse(req.user._id);
    res.json({ success: true, cart: result });
};

// DELETE /api/cart
exports.clearCart = async (req, res) => {
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });
    res.json({ success: true, cart: { items: [], subtotal: 0, count: 0 } });
};

// ---------- Admin ----------

/**
 * GET /api/admin-carts  (admin, perm: carts)
 * All non-empty customer carts with live values — shows what customers are
 * about to buy. Supports ?search= (customer name/mobile) and pagination.
 */
exports.adminList = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);

        const carts = await Cart.find({ 'items.0': { $exists: true } })
            .populate('user', 'name mobile email')
            .populate('items.product', 'name slug price thumbnail stock isActive variants')
            .sort({ updatedAt: -1 });

        // Optional customer search (in-memory; cart counts stay small).
        const search = (req.query.search || '').toLowerCase();
        const filtered = search
            ? carts.filter(
                  (c) =>
                      c.user &&
                      (c.user.name?.toLowerCase().includes(search) || c.user.mobile?.includes(search))
              )
            : carts;

        const shaped = filtered.map((c) => {
            const validItems = c.items.filter((i) => i.product);
            const itemCount = validItems.reduce((s, i) => s + i.quantity, 0);
            const value = validItems.reduce(
                (s, i) => s + getEffectivePrice(i.product, i.variant) * i.quantity,
                0
            );
            return {
                _id: c._id,
                user: c.user,
                items: validItems.map((i) => ({
                    product: {
                        _id: i.product._id,
                        name: i.product.name,
                        slug: i.product.slug,
                        thumbnail: i.product.thumbnail,
                        price: i.product.price,
                    },
                    quantity: i.quantity,
                    variant: i.variant,
                    unitPrice: getEffectivePrice(i.product, i.variant),
                })),
                itemCount,
                value,
                updatedAt: c.updatedAt,
            };
        });

        const total = shaped.length;
        const paged = shaped.slice((page - 1) * limit, page * limit);

        // Headline totals across ALL non-empty carts.
        const totals = shaped.reduce(
            (acc, c) => ({ items: acc.items + c.itemCount, value: acc.value + c.value }),
            { items: 0, value: 0 }
        );

        res.json({
            success: true,
            carts: paged,
            totals: { carts: total, items: totals.items, value: totals.value },
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports.buildCartResponse = buildCartResponse;
