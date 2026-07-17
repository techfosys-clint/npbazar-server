const Banner = require('../models/Banner');
const { PLACEMENTS } = require('../models/Banner');

/**
 * GET /api/banners  (public — storefront)
 * ?placement=hero_slider|hero_side|home_bottom filters; only active banners.
 * ?all=true (admin list) includes inactive.
 */
exports.list = async (req, res) => {
    const { placement, all } = req.query;
    const filter = {};
    if (all !== 'true') filter.isActive = true;
    if (placement) filter.placement = placement;

    const banners = await Banner.find(filter).sort({ placement: 1, order: 1, createdAt: -1 });
    res.json({ success: true, banners });
};

// POST /api/banners  (admin)
exports.create = async (req, res) => {
    try {
        const { placement, image, mobileImage, link, title, order, isActive } = req.body;
        if (!placement || !PLACEMENTS.includes(placement)) {
            return res.status(400).json({ success: false, message: `placement must be one of: ${PLACEMENTS.join(', ')}` });
        }
        if (!image) return res.status(400).json({ success: false, message: 'image is required' });

        const banner = await Banner.create({ placement, image, mobileImage, link, title, order, isActive });
        res.status(201).json({ success: true, banner });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/banners/:id  (admin)
exports.update = async (req, res) => {
    try {
        if (req.body.placement && !PLACEMENTS.includes(req.body.placement)) {
            return res.status(400).json({ success: false, message: `placement must be one of: ${PLACEMENTS.join(', ')}` });
        }
        const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
        res.json({ success: true, banner });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/banners/:id  (admin)
exports.remove = async (req, res) => {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
    res.json({ success: true, message: 'Banner deleted' });
};
