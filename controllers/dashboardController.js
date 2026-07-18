const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Review = require('../models/Review');

// GET /api/dashboard/stats  (admin) — headline metrics for the dashboard
exports.stats = async (req, res) => {
    const notCancelled = { orderStatus: { $ne: 'cancelled' } };
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
        totalOrders,
        pendingOrders,
        todayOrders,
        totalProducts,
        activeProducts,
        featuredProducts,
        bestSellingProducts,
        lowStock,
        outOfStock,
        totalCustomers,
        pendingReviews,
        revenueAgg,
        todayRevenueAgg,
        cartAgg,
        profitAgg,
    ] = await Promise.all([
        Order.countDocuments(),
        Order.countDocuments({ orderStatus: 'pending' }),
        Order.countDocuments({ createdAt: { $gte: startOfToday } }),
        Product.countDocuments(),
        Product.countDocuments({ isActive: true }),
        Product.countDocuments({ isFeatured: true }),
        Product.countDocuments({ isBestSelling: true }),
        Product.countDocuments({ stock: { $lte: 5, $gt: 0 } }),
        Product.countDocuments({ stock: 0 }),
        User.countDocuments(),
        Review.countDocuments({ isApproved: false }),
        Order.aggregate([{ $match: notCancelled }, { $group: { _id: null, total: { $sum: '$total' } } }]),
        Order.aggregate([
            { $match: { ...notCancelled, createdAt: { $gte: startOfToday } } },
            { $group: { _id: null, total: { $sum: '$total' } } },
        ]),
        // Active (non-empty) carts + total items sitting in them.
        Cart.aggregate([
            { $match: { 'items.0': { $exists: true } } },
            { $project: { count: { $sum: '$items.quantity' } } },
            { $group: { _id: null, carts: { $sum: 1 }, items: { $sum: '$count' } } },
        ]),
        // Gross profit = (sale price - buying cost) × qty across non-cancelled orders.
        Order.aggregate([
            { $match: notCancelled },
            { $unwind: '$items' },
            {
                $group: {
                    _id: null,
                    profit: {
                        $sum: {
                            $multiply: [
                                { $subtract: ['$items.price', { $ifNull: ['$items.costPrice', 0] }] },
                                '$items.quantity',
                            ],
                        },
                    },
                },
            },
        ]),
    ]);

    res.json({
        success: true,
        stats: {
            totalOrders,
            pendingOrders,
            todayOrders,
            totalProducts,
            activeProducts,
            featuredProducts,
            bestSellingProducts,
            lowStock,
            outOfStock,
            totalCustomers,
            verifiedCustomers,
            pendingReviews,
            totalRevenue: revenueAgg[0]?.total || 0,
            todayRevenue: todayRevenueAgg[0]?.total || 0,
            totalProfit: profitAgg[0]?.profit || 0,
            activeCarts: cartAgg[0]?.carts || 0,
            cartItems: cartAgg[0]?.items || 0,
        },
    });
};

// GET /api/dashboard/order-status  (admin) — order count per status (for breakdown UI)
exports.orderStatusBreakdown = async (req, res) => {
    const data = await Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]);
    const breakdown = {};
    for (const row of data) breakdown[row._id] = row.count;
    res.json({ success: true, breakdown });
};

// GET /api/dashboard/sales?days=7  (admin) — daily revenue for a chart
exports.salesChart = async (req, res) => {
    const days = Math.min(90, parseInt(req.query.days) || 7);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await Order.aggregate([
        { $match: { createdAt: { $gte: since }, orderStatus: { $ne: 'cancelled' } } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                revenue: { $sum: '$total' },
                orders: { $sum: 1 },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    res.json({ success: true, data });
};

// GET /api/dashboard/top-products  (admin) — best sellers by actual sales
exports.topProducts = async (req, res) => {
    const products = await Product.find()
        .sort({ sold: -1 })
        .limit(10)
        .select('name slug sold price thumbnail stock isBestSelling');
    res.json({ success: true, products });
};

// GET /api/dashboard/low-stock  (admin) — products that need restocking
exports.lowStock = async (req, res) => {
    const products = await Product.find({ stock: { $lte: 5 } })
        .sort({ stock: 1 })
        .limit(15)
        .select('name slug price thumbnail stock sold');
    res.json({ success: true, products });
};
