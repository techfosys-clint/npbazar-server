const ShippingZone = require('../models/ShippingZone');

// GET /api/shipping-zones  (public: only active, used by checkout preview)
// ?all=true (admin) includes inactive
exports.list = async (req, res) => {
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const zones = await ShippingZone.find(filter).sort({ city: 1 });
    res.json({ success: true, zones });
};

// POST /api/shipping-zones  (admin)
exports.create = async (req, res) => {
    try {
        const { name, city, shippingCost, freeShippingThreshold, isActive } = req.body;
        if (!name || !city || shippingCost == null) {
            return res.status(400).json({ success: false, message: 'name, city and shippingCost are required' });
        }
        const zone = await ShippingZone.create({ name, city, shippingCost, freeShippingThreshold, isActive });
        res.status(201).json({ success: true, zone });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'A shipping zone for this area already exists' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/shipping-zones/:id  (admin)
exports.update = async (req, res) => {
    try {
        const zone = await ShippingZone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!zone) return res.status(404).json({ success: false, message: 'Shipping zone not found' });
        res.json({ success: true, zone });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'A shipping zone for this area already exists' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/shipping-zones/:id  (admin)
exports.remove = async (req, res) => {
    const zone = await ShippingZone.findByIdAndDelete(req.params.id);
    if (!zone) return res.status(404).json({ success: false, message: 'Shipping zone not found' });
    res.json({ success: true, message: 'Shipping zone deleted' });
};
