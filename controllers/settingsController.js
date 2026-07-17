const Settings = require('../models/Settings');

// GET /api/settings  (public) — storefront config
exports.get = async (req, res) => {
    const settings = await Settings.getSingleton();
    res.json({ success: true, settings });
};

// PATCH /api/settings  (admin)
exports.update = async (req, res) => {
    try {
        const settings = await Settings.getSingleton();
        Object.assign(settings, req.body);
        await settings.save();
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
