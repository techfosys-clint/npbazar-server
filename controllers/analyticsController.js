const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const PageView = require('../models/PageView');
const { resolveRange, fillDailySeries } = require('../utils/dateRange');

const dateBucket = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };

/**
 * POST /api/analytics/track  (public)
 * Called by the storefront on page load. Body: { sessionId, path?, referrer?, deviceType?, country? }
 */
exports.track = async (req, res) => {
    try {
        const { sessionId, path, referrer, deviceType, country } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });
        await PageView.create({ sessionId, path, referrer, deviceType, country });
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/analytics/summary?days=30  (admin, perm: reports)
exports.summary = async (req, res) => {
    const { since, until } = resolveRange(req);
    const inRange = { createdAt: { $gte: since, $lte: until } };
    const notCancelled = { ...inRange, orderStatus: { $ne: 'cancelled' } };

    const [salesAgg, ordersCount, fulfilledCount, refundedAgg, customerOrders] = await Promise.all([
        Order.aggregate([
            { $match: notCancelled },
            {
                $group: {
                    _id: null,
                    subtotal: { $sum: '$subtotal' },
                    discount: { $sum: '$discount' },
                    shipping: { $sum: '$shippingCost' },
                },
            },
        ]),
        Order.countDocuments(inRange),
        Order.countDocuments({ ...inRange, orderStatus: 'delivered' }),
        Order.aggregate([
            { $match: { ...inRange, paymentStatus: 'refunded' } },
            { $group: { _id: null, total: { $sum: '$total' } } },
        ]),
        Order.aggregate([
            { $match: { ...inRange, user: { $ne: null } } },
            { $group: { _id: '$user' } },
        ]),
    ]);

    const grossSales = salesAgg[0]?.subtotal || 0;
    const discounts = salesAgg[0]?.discount || 0;
    const shippingCharges = salesAgg[0]?.shipping || 0;
    const returns = refundedAgg[0]?.total || 0;
    const taxes = 0; // no tax system configured yet
    const returnFees = 0; // no return-fee tracking yet
    const netSales = Math.max(0, grossSales - discounts - returns);
    const totalSales = netSales + shippingCharges + taxes - returnFees;

    // Returning-customer rate: of the customers who ordered in this range, what
    // share of them have more than one order all-time (registered users only).
    const customerIds = customerOrders.map((c) => c._id);
    let returningCustomers = 0;
    if (customerIds.length) {
        const lifetimeCounts = await Order.aggregate([
            { $match: { user: { $in: customerIds } } },
            { $group: { _id: '$user', count: { $sum: 1 } } },
        ]);
        returningCustomers = lifetimeCounts.filter((c) => c.count > 1).length;
    }
    const returningCustomerRate = customerIds.length
        ? Math.round((returningCustomers / customerIds.length) * 1000) / 10
        : 0;

    res.json({
        success: true,
        summary: {
            grossSales,
            discounts,
            returns,
            netSales,
            shippingCharges,
            returnFees,
            taxes,
            totalSales,
            orders: ordersCount,
            ordersFulfilled: fulfilledCount,
            returningCustomerRate,
        },
    });
};

// GET /api/analytics/sales-over-time?days=30
exports.salesOverTime = async (req, res) => {
    const { since, until, days } = resolveRange(req);
    const rows = await Order.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until }, orderStatus: { $ne: 'cancelled' } } },
        { $group: { _id: dateBucket, sales: { $sum: '$total' }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
    ]);
    res.json({ success: true, data: fillDailySeries(rows, since, days, ['sales', 'orders']) });
};

// GET /api/analytics/aov-over-time?days=30
exports.aovOverTime = async (req, res) => {
    const { since, until, days } = resolveRange(req);
    const rows = await Order.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until }, orderStatus: { $ne: 'cancelled' } } },
        { $group: { _id: dateBucket, total: { $sum: '$total' }, orders: { $sum: 1 } } },
        { $project: { total: 1, orders: 1, aov: { $cond: [{ $gt: ['$orders', 0] }, { $divide: ['$total', '$orders'] }, 0] } } },
        { $sort: { _id: 1 } },
    ]);
    res.json({ success: true, data: fillDailySeries(rows, since, days, ['aov']) });
};

// GET /api/analytics/by-channel?days=30 — website vs. manually-created (admin/phone) orders
exports.byChannel = async (req, res) => {
    const { since, until } = resolveRange(req);
    const rows = await Order.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until }, orderStatus: { $ne: 'cancelled' } } },
        { $group: { _id: '$source', sales: { $sum: '$total' }, orders: { $sum: 1 } } },
    ]);
    res.json({
        success: true,
        data: rows.map((r) => ({ channel: r._id === 'admin' ? 'Manual / Phone orders' : 'Online Store', sales: r.sales, orders: r.orders })),
    });
};

// GET /api/analytics/by-product?days=30 — top products by sales in the period
exports.byProduct = async (req, res) => {
    const { since, until } = resolveRange(req);
    const rows = await Order.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until }, orderStatus: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.product',
                name: { $first: '$items.name' },
                thumbnail: { $first: '$items.thumbnail' },
                quantity: { $sum: '$items.quantity' },
                sales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
            },
        },
        { $sort: { sales: -1 } },
        { $limit: 10 },
    ]);
    res.json({ success: true, data: rows });
};

// GET /api/analytics/by-collection?days=30 — sales grouped by collection (a product may count in several)
exports.byCollection = async (req, res) => {
    const { since, until } = resolveRange(req);
    const rows = await Order.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until }, orderStatus: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        {
            $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'product',
            },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$product.collections', preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: '$product.collections',
                sales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                quantity: { $sum: '$items.quantity' },
            },
        },
        { $match: { _id: { $ne: null } } },
        {
            $lookup: {
                from: 'collections',
                localField: '_id',
                foreignField: '_id',
                as: 'collection',
            },
        },
        { $unwind: '$collection' },
        { $project: { name: '$collection.name', sales: 1, quantity: 1 } },
        { $sort: { sales: -1 } },
        { $limit: 10 },
    ]);
    res.json({ success: true, data: rows });
};

// GET /api/analytics/products-sell-through?days=30 — sold / (sold + stock) per product
exports.sellThrough = async (req, res) => {
    const products = await Product.find({ isActive: true })
        .select('name thumbnail sold stock')
        .sort({ sold: -1 })
        .limit(15);
    const data = products.map((p) => ({
        _id: p._id,
        name: p.name,
        thumbnail: p.thumbnail,
        sold: p.sold,
        stock: p.stock,
        // Not meaningful for unlimited-stock products (stock === null).
        sellThroughRate:
            p.stock === null ? null : p.sold + p.stock > 0 ? Math.round((p.sold / (p.sold + p.stock)) * 1000) / 10 : 0,
    }));
    res.json({ success: true, data });
};

// ---------- Traffic (requires the storefront to call POST /api/analytics/track) ----------

// GET /api/analytics/sessions-over-time?days=30
exports.sessionsOverTime = async (req, res) => {
    const { since, until, days } = resolveRange(req);
    const rows = await PageView.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until } } },
        { $group: { _id: { day: dateBucket, session: '$sessionId' } } },
        { $group: { _id: '$_id.day', sessions: { $sum: 1 } } },
        { $sort: { _id: 1 } },
    ]);
    res.json({ success: true, data: fillDailySeries(rows, since, days, ['sessions']) });
};

// GET /api/analytics/device-breakdown?days=30
exports.deviceBreakdown = async (req, res) => {
    const { since, until } = resolveRange(req);
    const rows = await PageView.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until } } },
        { $group: { _id: { device: '$deviceType', session: '$sessionId' } } },
        { $group: { _id: '$_id.device', sessions: { $sum: 1 } } },
        { $sort: { sessions: -1 } },
    ]);
    res.json({ success: true, data: rows.map((r) => ({ device: r._id, sessions: r.sessions })) });
};

// GET /api/analytics/referrer-breakdown?days=30
exports.referrerBreakdown = async (req, res) => {
    const { since, until } = resolveRange(req);
    const rows = await PageView.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until } } },
        {
            $group: {
                _id: { referrer: { $cond: [{ $eq: ['$referrer', ''] }, 'Direct', '$referrer'] }, session: '$sessionId' },
            },
        },
        { $group: { _id: '$_id.referrer', sessions: { $sum: 1 } } },
        { $sort: { sessions: -1 } },
        { $limit: 10 },
    ]);
    res.json({ success: true, data: rows.map((r) => ({ referrer: r._id, sessions: r.sessions })) });
};

// GET /api/analytics/landing-pages?days=30 — the first page seen per session
exports.landingPages = async (req, res) => {
    const { since, until } = resolveRange(req);
    const rows = await PageView.aggregate([
        { $match: { createdAt: { $gte: since, $lte: until } } },
        { $sort: { createdAt: 1 } },
        { $group: { _id: '$sessionId', path: { $first: '$path' } } },
        { $group: { _id: '$path', sessions: { $sum: 1 } } },
        { $sort: { sessions: -1 } },
        { $limit: 10 },
    ]);
    res.json({ success: true, data: rows.map((r) => ({ path: r._id, sessions: r.sessions })) });
};

/**
 * GET /api/analytics/funnel?days=30
 * Best-effort conversion funnel from the signals we actually have:
 * tracked sessions -> non-empty carts touched in the period -> completed orders.
 */
exports.funnel = async (req, res) => {
    const { since, until } = resolveRange(req);
    const inRange = { updatedAt: { $gte: since, $lte: until } };

    const [sessionIds, cartsWithItems, ordersCompleted] = await Promise.all([
        PageView.distinct('sessionId', { createdAt: { $gte: since, $lte: until } }),
        Cart.countDocuments({ ...inRange, 'items.0': { $exists: true } }),
        Order.countDocuments({ createdAt: { $gte: since, $lte: until }, orderStatus: { $ne: 'cancelled' } }),
    ]);

    const sessions = sessionIds.length;
    const pct = (n) => (sessions > 0 ? Math.round((n / sessions) * 1000) / 10 : 0);

    res.json({
        success: true,
        funnel: {
            sessions,
            addedToCart: cartsWithItems,
            completedCheckout: ordersCompleted,
            addedToCartRate: pct(cartsWithItems),
            conversionRate: pct(ordersCompleted),
        },
    });
};

// GET /api/analytics/conversion-over-time?days=30
exports.conversionOverTime = async (req, res) => {
    const { since, until, days } = resolveRange(req);
    const [sessionRows, orderRows] = await Promise.all([
        PageView.aggregate([
            { $match: { createdAt: { $gte: since, $lte: until } } },
            { $group: { _id: { day: dateBucket, session: '$sessionId' } } },
            { $group: { _id: '$_id.day', sessions: { $sum: 1 } } },
        ]),
        Order.aggregate([
            { $match: { createdAt: { $gte: since, $lte: until }, orderStatus: { $ne: 'cancelled' } } },
            { $group: { _id: dateBucket, orders: { $sum: 1 } } },
        ]),
    ]);

    const sessionMap = new Map(sessionRows.map((r) => [r._id, r.sessions]));
    const orderMap = new Map(orderRows.map((r) => [r._id, r.orders]));
    const allDates = new Set([...sessionMap.keys(), ...orderMap.keys()]);
    const rows = Array.from(allDates).map((date) => {
        const sessions = sessionMap.get(date) || 0;
        const orders = orderMap.get(date) || 0;
        return { _id: date, rate: sessions > 0 ? Math.round((orders / sessions) * 1000) / 10 : 0 };
    });
    res.json({ success: true, data: fillDailySeries(rows, since, days, ['rate']) });
};
