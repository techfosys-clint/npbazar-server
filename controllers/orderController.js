const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const { getEffectivePrice } = require('../utils/pricing');
const { resolveShippingCost } = require('../utils/shipping');
const { evaluateCoupon } = require('../utils/discount');
const { generateInvoicePdf, invoiceEmailHtml } = require('../utils/invoice');
const { sendEmail } = require('../utils/sendEmail');
const Settings = require('../models/Settings');
const { normalizeMobile } = require('../utils/mobile');
const { isPhoneVerifiedWithToken } = require('./phoneVerificationController');
const { initiatePaymentForOrder, assertGatewayAvailable } = require('./paymentController');
const { restoreStockAndCoupon } = require('../services/paymentStatusService');

const genOrderNumber = () =>
    'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

// Best-effort order confirmation email — never let a mail failure break checkout.
const sendOrderConfirmationEmail = async (order, to) => {
    if (!to) return;
    try {
        const settings = await Settings.getSingleton();
        await sendEmail({
            to,
            subject: `Order Confirmed — ${order.orderNumber}`,
            html: invoiceEmailHtml(order, settings),
        });
    } catch (err) {
        console.error('Order confirmation email failed:', err.message);
    }
};

/**
 * POST /api/orders  (user) — checkout
 * Body: { addressId? , shippingAddress? , couponCode? , paymentMethod }
 * Uses the user's current cart as the source of items.
 */
exports.create = async (req, res) => {
    try {
        const { shippingAddress, couponCode, paymentMethod = 'cod', paymentGateway, phoneVerificationToken } = req.body;
        if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.addressLine) {
            return res.status(400).json({ success: false, message: 'A valid shippingAddress is required' });
        }
        if (paymentMethod === 'online') {
            await assertGatewayAvailable(paymentGateway); // throws a clear message if unset/inactive/misconfigured
        }

        // Checkout phone must be verified — skip only if it's the account's
        // own already-verified number; a different number always needs a
        // fresh OTP verification, same as guest checkout.
        const checkoutPhone = normalizeMobile(shippingAddress.phone);
        const isOwnVerifiedNumber = req.user.isPhoneVerified && checkoutPhone === normalizeMobile(req.user.mobile);
        if (!isOwnVerifiedNumber && !(await isPhoneVerifiedWithToken(checkoutPhone, phoneVerificationToken))) {
            return res.status(403).json({
                success: false,
                message: 'Please verify this phone number before placing the order.',
                requiresPhoneVerification: true,
            });
        }

        const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        // Validate stock and build order line items (snapshotting current price).
        // stock === null means unlimited — never checked, never decremented.
        const items = [];
        let subtotal = 0;
        const stockByProduct = new Map();
        for (const item of cart.items) {
            const product = item.product;
            if (!product || !product.isActive) {
                return res.status(400).json({ success: false, message: 'A product in your cart is no longer available' });
            }
            if (product.stock !== null && product.stock < item.quantity) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
            }
            stockByProduct.set(String(product._id), product.stock);
            // Per-variant price when the selected option defines one; default price otherwise.
            const unitPrice = getEffectivePrice(product, item.variant);
            subtotal += unitPrice * item.quantity;
            items.push({
                product: product._id,
                name: product.name,
                thumbnail: product.thumbnail,
                price: unitPrice,
                costPrice: product.costPrice || 0, // snapshot buying cost for profit reports
                quantity: item.quantity,
                variant: item.variant,
            });
        }

        // Apply coupon (if any) — handles order/product/BOGO/free-shipping types.
        let discount = 0;
        let freeShipping = false;
        let appliedCoupon = null;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
            if (!coupon) return res.status(400).json({ success: false, message: 'Invalid coupon code' });
            const evalItems = items.map((i) => ({ productId: i.product, price: i.price, quantity: i.quantity }));
            const result = await evaluateCoupon(coupon, evalItems, subtotal); // throws if invalid
            discount = result.discount;
            freeShipping = result.freeShipping;
            appliedCoupon = coupon;
        }

        // Shipping: area-specific zone if one matches the city, else the store-wide default.
        const shippingCost = freeShipping ? 0 : await resolveShippingCost(shippingAddress.city, subtotal);

        const total = Math.max(0, subtotal - discount) + shippingCost;

        const order = await Order.create({
            orderNumber: genOrderNumber(),
            user: req.user._id,
            customerEmail: req.user.email || '',
            items,
            shippingAddress,
            subtotal,
            discount,
            couponCode: appliedCoupon ? appliedCoupon.code : '',
            couponDiscountType: appliedCoupon ? appliedCoupon.discountType : '',
            shippingCost,
            total,
            paymentMethod,
            statusHistory: [{ status: 'pending', note: 'Order placed' }],
        });

        // Commit side effects: decrement stock (unless unlimited) / bump sold, coupon usage, clear cart.
        await Promise.all(
            items.map((i) => {
                const inc = { sold: i.quantity };
                if (stockByProduct.get(String(i.product)) !== null) inc.stock = -i.quantity;
                return Product.updateOne({ _id: i.product }, { $inc: inc });
            })
        );
        if (appliedCoupon) await Coupon.updateOne({ _id: appliedCoupon._id }, { $inc: { usedCount: 1 } });
        cart.items = [];
        await cart.save();

        let paymentRedirectUrl = null;
        if (paymentMethod === 'online') {
            try {
                paymentRedirectUrl = await initiatePaymentForOrder(order, paymentGateway);
                await order.save();
            } catch (initErr) {
                // Never leave a reserved-but-unpayable order behind — restore
                // stock/coupon and remove it, then surface a clear error.
                await restoreStockAndCoupon(order);
                await Order.deleteOne({ _id: order._id });
                return res.status(502).json({ success: false, message: `Could not start payment: ${initErr.message}` });
            }
        }

        sendOrderConfirmationEmail(order, order.customerEmail);

        res.status(201).json({ success: true, message: 'Order placed', order, paymentRedirectUrl });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/orders/guest  (public) — one-click checkout without an account.
 * Body: { items: [{ productId, quantity }], shippingAddress, paymentMethod? }
 * Prices always come from the database (never the client); stock rules match
 * the logged-in checkout (null = unlimited, never decremented).
 */
exports.guestCreate = async (req, res) => {
    try {
        const { items: reqItems, shippingAddress, paymentMethod = 'cod', paymentGateway, couponCode, phoneVerificationToken } = req.body;
        if (!Array.isArray(reqItems) || reqItems.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one item is required' });
        }
        if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.addressLine) {
            return res.status(400).json({ success: false, message: 'A valid shippingAddress is required' });
        }
        if (paymentMethod === 'online') {
            await assertGatewayAvailable(paymentGateway);
        }

        // Guests always need a freshly OTP-verified phone — there's no
        // account to trust the number against.
        const checkoutPhone = normalizeMobile(shippingAddress.phone);
        if (!(await isPhoneVerifiedWithToken(checkoutPhone, phoneVerificationToken))) {
            return res.status(403).json({
                success: false,
                message: 'Please verify this phone number before placing the order.',
                requiresPhoneVerification: true,
            });
        }

        const items = [];
        let subtotal = 0;
        const stockByProduct = new Map();
        for (const line of reqItems) {
            const product = await Product.findById(line.productId);
            if (!product || !product.isActive) {
                return res.status(400).json({ success: false, message: 'A product in your order is no longer available' });
            }
            const qty = Math.max(1, Number(line.quantity) || 1);
            if (product.stock !== null && product.stock < qty) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
            }
            stockByProduct.set(String(product._id), product.stock);
            const unitPrice = getEffectivePrice(product, line.variant || {});
            subtotal += unitPrice * qty;
            items.push({
                product: product._id,
                name: product.name,
                thumbnail: product.thumbnail,
                price: unitPrice,
                costPrice: product.costPrice || 0,
                quantity: qty,
                variant: line.variant || {},
            });
        }

        // Apply coupon (if any) — same evaluation logged-in checkout uses.
        let discount = 0;
        let freeShipping = false;
        let appliedCoupon = null;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
            if (!coupon) return res.status(400).json({ success: false, message: 'Invalid coupon code' });
            const evalItems = items.map((i) => ({ productId: i.product, price: i.price, quantity: i.quantity }));
            const result = await evaluateCoupon(coupon, evalItems, subtotal); // throws if invalid
            discount = result.discount;
            freeShipping = result.freeShipping;
            appliedCoupon = coupon;
        }

        const shippingCost = freeShipping ? 0 : await resolveShippingCost(shippingAddress.city, subtotal);
        const total = Math.max(0, subtotal - discount) + shippingCost;

        const order = await Order.create({
            orderNumber: genOrderNumber(),
            user: null,
            customerEmail: shippingAddress.email || '',
            items,
            shippingAddress,
            subtotal,
            discount,
            couponCode: appliedCoupon ? appliedCoupon.code : '',
            couponDiscountType: appliedCoupon ? appliedCoupon.discountType : '',
            shippingCost,
            total,
            paymentMethod,
            statusHistory: [{ status: 'pending', note: 'Guest order placed' }],
        });

        // Decrement stock (unless unlimited) / bump sold counters.
        await Promise.all(
            items.map((i) => {
                const inc = { sold: i.quantity };
                if (stockByProduct.get(String(i.product)) !== null) inc.stock = -i.quantity;
                return Product.updateOne({ _id: i.product }, { $inc: inc });
            })
        );
        if (appliedCoupon) await Coupon.updateOne({ _id: appliedCoupon._id }, { $inc: { usedCount: 1 } });

        let paymentRedirectUrl = null;
        if (paymentMethod === 'online') {
            try {
                paymentRedirectUrl = await initiatePaymentForOrder(order, paymentGateway);
                await order.save();
            } catch (initErr) {
                await restoreStockAndCoupon(order);
                await Order.deleteOne({ _id: order._id });
                return res.status(502).json({ success: false, message: `Could not start payment: ${initErr.message}` });
            }
        }

        sendOrderConfirmationEmail(order, order.customerEmail);

        res.status(201).json({ success: true, message: 'Order placed', order, paymentRedirectUrl });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/orders/track?orderNumber=ORD-...&phone=01...  (public)
 * Guest-friendly tracking: the phone must match the one the order was placed
 * with, so order numbers alone can't leak someone else's order details.
 */
exports.track = async (req, res) => {
    const { orderNumber } = req.query;
    if (!orderNumber) {
        return res.status(400).json({ success: false, message: 'orderNumber is required' });
    }
    const order = await Order.findOne({ orderNumber: String(orderNumber).trim().toUpperCase() });
    if (!order) {
        return res.status(404).json({ success: false, message: 'No order found with that number' });
    }
    res.json({
        success: true,
        order: {
            orderNumber: order.orderNumber,
            orderStatus: order.orderStatus,
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod,
            statusHistory: order.statusHistory,
            items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, thumbnail: i.thumbnail })),
            subtotal: order.subtotal,
            shippingCost: order.shippingCost,
            discount: order.discount,
            total: order.total,
            createdAt: order.createdAt,
        },
    });
};

// Orders placed as a guest have user:null and are never otherwise linked to
// an account. Match them onto the logged-in user by phone (last 10 digits,
// so "+880...", "880..." and "01..." all match) so order history isn't lost
// just because someone checked out before creating an account.
const myOrdersFilter = (user) => {
    const or = [{ user: user._id }];
    const last10 = String(user.mobile || '').replace(/\D/g, '').slice(-10);
    if (last10) or.push({ user: null, 'shippingAddress.phone': new RegExp(last10 + '$') });
    return { $or: or };
};

// GET /api/orders/my  (user)
exports.myOrders = async (req, res) => {
    const orders = await Order.find(myOrdersFilter(req.user)).sort({ createdAt: -1 });
    res.json({ success: true, orders });
};

// GET /api/orders/my/:id  (user)
exports.myOrderDetail = async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, ...myOrdersFilter(req.user) });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
};

// POST /api/orders/my/:id/cancel  (user) — only while still pending/processing
exports.cancelMyOrder = async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['pending', 'processing'].includes(order.orderStatus)) {
        return res.status(400).json({ success: false, message: 'This order can no longer be cancelled' });
    }
    order.orderStatus = 'cancelled';
    order.statusHistory.push({ status: 'cancelled', note: 'Cancelled by customer' });
    // Restore stock (unless the product is unlimited, which never had it decremented).
    const products = await Product.find({ _id: { $in: order.items.map((i) => i.product) } }).select('stock');
    const stockByProduct = new Map(products.map((p) => [String(p._id), p.stock]));
    await Promise.all(
        order.items.map((i) => {
            const inc = { sold: -i.quantity };
            if (stockByProduct.get(String(i.product)) !== null) inc.stock = i.quantity;
            return Product.updateOne({ _id: i.product }, { $inc: inc });
        })
    );
    await order.save();
    res.json({ success: true, message: 'Order cancelled', order });
};

// ---------- Admin ----------

/**
 * POST /api/admin-orders  (admin) — manually create an order (phone/walk-in sale)
 * Body: {
 *   userId?,                                  // link a registered customer (optional)
 *   customerEmail?,                           // needed to send an invoice for guest orders
 *   items: [{ productId, quantity, variant?, price? }],  // price overrides the product price
 *   shippingAddress: { fullName, phone, addressLine, area?, city?, postalCode? },
 *   shippingCost?,                            // manual override; omitted = zone/default lookup
 *   discount?, couponCode?,
 *   paymentMethod?, paymentStatus?, orderStatus?, note?
 * }
 */
exports.adminCreate = async (req, res) => {
    try {
        const {
            userId,
            customerEmail = '',
            items: reqItems,
            shippingAddress,
            shippingCost: shippingOverride,
            discount = 0,
            couponCode = '',
            paymentMethod = 'cod',
            paymentStatus = 'pending',
            orderStatus = 'pending',
            note = '',
        } = req.body;

        if (!Array.isArray(reqItems) || reqItems.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one item is required' });
        }
        if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.phone) {
            return res.status(400).json({ success: false, message: 'Customer name and phone are required' });
        }

        // Build line items from live products (allowing a manual price override per line).
        const items = [];
        let subtotal = 0;
        const stockByProduct = new Map();
        for (const line of reqItems) {
            const product = await Product.findById(line.productId);
            if (!product) {
                return res.status(400).json({ success: false, message: 'A selected product no longer exists' });
            }
            const qty = Math.max(1, Number(line.quantity) || 1);
            if (product.stock !== null && product.stock < qty) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name} (${product.stock} left)` });
            }
            stockByProduct.set(String(product._id), product.stock);
            const unitPrice =
                line.price != null && line.price !== '' ? Number(line.price) : getEffectivePrice(product, line.variant || {});
            subtotal += unitPrice * qty;
            items.push({
                product: product._id,
                name: product.name,
                thumbnail: product.thumbnail,
                price: unitPrice,
                costPrice: product.costPrice || 0,
                quantity: qty,
                variant: line.variant || {},
            });
        }

        const shippingCost =
            shippingOverride != null && shippingOverride !== ''
                ? Number(shippingOverride)
                : await resolveShippingCost(shippingAddress.city, subtotal);

        const discountAmt = Math.min(Number(discount) || 0, subtotal);
        const total = Math.max(0, subtotal - discountAmt) + shippingCost;

        const order = await Order.create({
            orderNumber: genOrderNumber(),
            user: userId || null,
            customerEmail,
            items,
            shippingAddress,
            subtotal,
            discount: discountAmt,
            couponCode,
            shippingCost,
            total,
            paymentMethod,
            paymentStatus,
            orderStatus,
            source: 'admin',
            createdByAdmin: req.admin._id,
            statusHistory: [{ status: orderStatus, note: note || `Created manually by ${req.admin.fullName}` }],
        });

        // Deduct stock (unless unlimited) / bump sold counters.
        await Promise.all(
            items.map((i) => {
                const inc = { sold: i.quantity };
                if (stockByProduct.get(String(i.product)) !== null) inc.stock = -i.quantity;
                return Product.updateOne({ _id: i.product }, { $inc: inc });
            })
        );

        res.status(201).json({ success: true, message: 'Order created', order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// GET /api/admin-orders  (admin) — list/filter all orders
exports.adminList = async (req, res) => {
    const { status, paymentStatus, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    const filter = {};
    if (status) filter.orderStatus = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (search) {
        // Matches order number, guest shipping details, or a registered
        // customer's name/mobile — not just the order number.
        const matchingUsers = await User.find({
            $or: [{ name: new RegExp(search, 'i') }, { mobile: new RegExp(search, 'i') }],
        }).select('_id');
        filter.$or = [
            { orderNumber: new RegExp(search, 'i') },
            { customerEmail: new RegExp(search, 'i') },
            { 'shippingAddress.fullName': new RegExp(search, 'i') },
            { 'shippingAddress.phone': new RegExp(search, 'i') },
            { user: { $in: matchingUsers.map((u) => u._id) } },
        ];
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate('user', 'name mobile email')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Order.countDocuments(filter),
    ]);

    res.json({ success: true, orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

// GET /api/admin-orders/:id  (admin)
exports.adminDetail = async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name mobile email');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
};

// PATCH /api/admin-orders/:id/status  (admin)  body: { orderStatus?, paymentStatus?, note? }
exports.adminUpdateStatus = async (req, res) => {
    try {
        const { orderStatus, paymentStatus, note } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (orderStatus) {
            order.orderStatus = orderStatus;
            order.statusHistory.push({ status: orderStatus, note: note || '' });
            // Auto-mark COD as paid on delivery.
            if (orderStatus === 'delivered' && order.paymentMethod === 'cod') order.paymentStatus = 'paid';
        }
        if (paymentStatus) order.paymentStatus = paymentStatus;

        await order.save();
        res.json({ success: true, message: 'Order updated', order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/admin-orders/:id/invoice  (admin) — download the invoice as a PDF
exports.adminInvoicePdf = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('user', 'name mobile email');
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const pdf = await generateInvoicePdf(order);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="invoice-${order.orderNumber}.pdf"`,
        });
        res.send(pdf);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/admin-orders/:id/send-invoice  (admin)
 * Body: { email? } — overrides the order's stored customer email for this send.
 */
exports.adminSendInvoice = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('user', 'name mobile email');
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const to = req.body.email || order.customerEmail || order.user?.email;
        if (!to) {
            return res.status(400).json({ success: false, message: 'No email address on file for this order — provide one to send to.' });
        }

        const settings = await Settings.getSingleton();
        const pdf = await generateInvoicePdf(order);

        await sendEmail({
            to,
            subject: `Invoice for order ${order.orderNumber}`,
            html: invoiceEmailHtml(order, settings),
            attachments: [{ filename: `invoice-${order.orderNumber}.pdf`, content: pdf, contentType: 'application/pdf' }],
        });

        order.invoiceSentAt = new Date();
        if (!order.customerEmail) order.customerEmail = to;
        await order.save();

        res.json({ success: true, message: `Invoice sent to ${to}`, invoiceSentAt: order.invoiceSentAt });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
