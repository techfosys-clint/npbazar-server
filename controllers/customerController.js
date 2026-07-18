const User = require('../models/User');
const Order = require('../models/Order');

// RFC 4180: wrap in quotes (and escape internal quotes) whenever a value
// contains a comma, quote, or newline.
const csvCell = (value) => {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
};

// GET /api/customers  (admin)  ?search=&page=&limit=
exports.list = async (req, res) => {
    const { search } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    const filter = {};
    if (search) {
        filter.$or = [
            { name: new RegExp(search, 'i') },
            { mobile: new RegExp(search, 'i') },
            { email: new RegExp(search, 'i') },
        ];
    }

    const [customers, total] = await Promise.all([
        User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        User.countDocuments(filter),
    ]);

    res.json({ success: true, customers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

// GET /api/customers/export  (admin) — CSV of ALL customers (not paginated)
exports.exportCsv = async (req, res) => {
    const [customers, orderStats] = await Promise.all([
        User.find().sort({ createdAt: -1 }),
        Order.aggregate([
            { $match: { user: { $ne: null }, orderStatus: { $ne: 'cancelled' } } },
            { $group: { _id: '$user', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } },
        ]),
    ]);
    const statsByUser = new Map(orderStats.map((s) => [String(s._id), s]));

    const header = ['Name', 'Mobile', 'Email', 'Address', 'Orders', 'Total Spent', 'Joined'];
    const rows = customers.map((c) => {
        const stats = statsByUser.get(String(c._id));
        return [
            c.name,
            c.mobile || '',
            c.email || '',
            c.address || '',
            stats?.orderCount || 0,
            stats?.totalSpent || 0,
            c.createdAt.toISOString().slice(0, 10),
        ];
    });

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + csv); // BOM so Excel opens UTF-8 (Bangla names etc.) correctly
};

// GET /api/customers/:id  (admin) — profile + order summary
exports.detail = async (req, res) => {
    const customer = await User.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const orders = await Order.find({ user: customer._id }).sort({ createdAt: -1 });
    const totalSpent = orders
        .filter((o) => o.orderStatus !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0);

    res.json({ success: true, customer, orders, stats: { orderCount: orders.length, totalSpent } });
};

// DELETE /api/customers/:id (admin) - delete customer
exports.deleteCustomer = async (req, res) => {
    try {
        const customer = await User.findById(req.params.id);
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
