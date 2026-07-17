const Product = require('../models/Product');
const InventoryLog = require('../models/InventoryLog');
const Order = require('../models/Order');

/**
 * GET /api/inventory  (admin, perm: inventory)
 * Every product with stock, buying cost, sale price, margin and stock value,
 * plus catalog-wide totals. ?search= filters by name/sku.
 */
exports.list = async (req, res) => {
    try {
        const search = (req.query.search || '').toLowerCase();
        const products = await Product.find()
            .select('name slug sku thumbnail stock costPrice price sold isActive')
            .sort({ name: 1 });

        const filtered = search
            ? products.filter(
                  (p) => p.name.toLowerCase().includes(search) || (p.sku || '').toLowerCase().includes(search)
              )
            : products;

        const items = filtered.map((p) => {
            const profitPerUnit = p.price - (p.costPrice || 0);
            return {
                _id: p._id,
                name: p.name,
                slug: p.slug,
                sku: p.sku,
                thumbnail: p.thumbnail,
                stock: p.stock,
                sold: p.sold || 0,
                costPrice: p.costPrice || 0,
                price: p.price,
                profitPerUnit,
                marginPercent: p.price > 0 ? Math.round((profitPerUnit / p.price) * 1000) / 10 : 0,
                stockValue: p.stock * (p.costPrice || 0),
                retailValue: p.stock * p.price,
                isActive: p.isActive,
            };
        });

        const totals = items.reduce(
            (acc, i) => ({
                units: acc.units + i.stock,
                stockValue: acc.stockValue + i.stockValue,
                retailValue: acc.retailValue + i.retailValue,
                potentialProfit: acc.potentialProfit + (i.retailValue - i.stockValue),
            }),
            { units: 0, stockValue: 0, retailValue: 0, potentialProfit: 0 }
        );

        res.json({ success: true, items, totals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/inventory/stock-in  (admin, perm: inventory)
 * Record a purchase: adds stock and updates the product's cost price as a
 * weighted average of existing stock + the new batch.
 * Body: { productId, quantity, unitCost, note? }
 */
exports.stockIn = async (req, res) => {
    try {
        const { productId, quantity, unitCost, note = '' } = req.body;
        const qty = Number(quantity);
        const cost = Number(unitCost);
        if (!productId || !qty || qty <= 0 || Number.isNaN(cost) || cost < 0) {
            return res.status(400).json({ success: false, message: 'productId, positive quantity and unitCost are required' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        // Weighted-average buying cost across old stock and the new batch.
        const oldStock = product.stock || 0;
        const oldCost = product.costPrice || 0;
        const newStock = oldStock + qty;
        product.costPrice = Math.round(((oldStock * oldCost + qty * cost) / newStock) * 100) / 100;
        product.stock = newStock;
        await product.save();

        const log = await InventoryLog.create({
            product: product._id,
            type: 'stock_in',
            quantity: qty,
            unitCost: cost,
            stockAfter: product.stock,
            note,
            admin: req.admin._id,
        });

        res.status(201).json({
            success: true,
            message: `Added ${qty} units. New stock: ${product.stock}, avg cost: ৳${product.costPrice}`,
            product: { _id: product._id, stock: product.stock, costPrice: product.costPrice },
            log,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/inventory/adjust  (admin, perm: inventory)
 * Manual correction (damage, count fix, returns...). Quantity may be negative.
 * Body: { productId, quantity, note? }
 */
exports.adjust = async (req, res) => {
    try {
        const { productId, quantity, note = '' } = req.body;
        const qty = Number(quantity);
        if (!productId || !qty) {
            return res.status(400).json({ success: false, message: 'productId and a non-zero quantity are required' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        // Adjusting an unlimited-stock product starts tracking it from 0, same as stock-in.
        const currentStock = product.stock || 0;
        if (currentStock + qty < 0) {
            return res.status(400).json({ success: false, message: `Cannot remove ${-qty} units — only ${currentStock} in stock` });
        }
        product.stock = currentStock + qty;
        await product.save();

        const log = await InventoryLog.create({
            product: product._id,
            type: 'adjustment',
            quantity: qty,
            stockAfter: product.stock,
            note,
            admin: req.admin._id,
        });

        res.status(201).json({
            success: true,
            message: `Stock adjusted by ${qty > 0 ? '+' : ''}${qty}. New stock: ${product.stock}`,
            product: { _id: product._id, stock: product.stock },
            log,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/inventory/logs  (admin, perm: inventory)
 * Recent stock movements. ?product=<id> filters, ?limit= caps (default 30).
 */
exports.logs = async (req, res) => {
    const filter = {};
    if (req.query.product) filter.product = req.query.product;
    const limit = Math.min(100, parseInt(req.query.limit) || 30);

    const logs = await InventoryLog.find(filter)
        .populate('product', 'name slug thumbnail')
        .populate('admin', 'fullName')
        .sort({ createdAt: -1 })
        .limit(limit);

    res.json({ success: true, logs });
};

/**
 * GET /api/inventory/profit-report?days=30  (admin, perm: inventory)
 * Revenue vs. buying cost from non-cancelled orders in the period.
 */
exports.profitReport = async (req, res) => {
    const days = Math.min(365, parseInt(req.query.days) || 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await Order.aggregate([
        { $match: { createdAt: { $gte: since }, orderStatus: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                cost: { $sum: { $multiply: [{ $ifNull: ['$items.costPrice', 0] }, '$items.quantity'] } },
            },
        },
        { $addFields: { profit: { $subtract: ['$revenue', '$cost'] } } },
        { $sort: { _id: 1 } },
    ]);

    const totals = rows.reduce(
        (acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, profit: acc.profit + r.profit }),
        { revenue: 0, cost: 0, profit: 0 }
    );

    res.json({ success: true, data: rows, totals });
};
