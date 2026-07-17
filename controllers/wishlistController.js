const Wishlist = require('../models/Wishlist');

// GET /api/wishlist
exports.getWishlist = async (req, res) => {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).populate(
        'products',
        'name slug price comparePrice thumbnail rating stock isActive'
    );
    res.json({ success: true, products: wishlist ? wishlist.products : [] });
};

// POST /api/wishlist  body: { productId }
exports.addItem = async (req, res) => {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

    const wishlist = await Wishlist.findOneAndUpdate(
        { user: req.user._id },
        { $addToSet: { products: productId } },
        { new: true, upsert: true }
    ).populate('products', 'name slug price comparePrice thumbnail rating stock isActive');

    res.status(201).json({ success: true, products: wishlist.products });
};

// DELETE /api/wishlist/:productId
exports.removeItem = async (req, res) => {
    const wishlist = await Wishlist.findOneAndUpdate(
        { user: req.user._id },
        { $pull: { products: req.params.productId } },
        { new: true }
    ).populate('products', 'name slug price comparePrice thumbnail rating stock isActive');

    res.json({ success: true, products: wishlist ? wishlist.products : [] });
};
