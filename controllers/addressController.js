const Address = require('../models/Address');

// GET /api/addresses
exports.list = async (req, res) => {
    const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
    res.json({ success: true, addresses });
};

// POST /api/addresses
exports.create = async (req, res) => {
    try {
        const { fullName, phone, addressLine, area, city, postalCode, isDefault } = req.body;
        if (!fullName || !phone || !addressLine || !city) {
            return res.status(400).json({ success: false, message: 'fullName, phone, addressLine and city are required' });
        }
        // If this is set default, unset the previous default.
        if (isDefault) await Address.updateMany({ user: req.user._id }, { isDefault: false });

        const count = await Address.countDocuments({ user: req.user._id });
        const address = await Address.create({
            user: req.user._id,
            fullName,
            phone,
            addressLine,
            area,
            city,
            postalCode,
            isDefault: isDefault || count === 0, // first address is default
        });
        res.status(201).json({ success: true, address });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/addresses/:id
exports.update = async (req, res) => {
    try {
        const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
        if (!address) return res.status(404).json({ success: false, message: 'Address not found' });

        if (req.body.isDefault) await Address.updateMany({ user: req.user._id }, { isDefault: false });
        Object.assign(address, req.body);
        await address.save();
        res.json({ success: true, address });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/addresses/:id
exports.remove = async (req, res) => {
    const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, message: 'Address deleted' });
};
