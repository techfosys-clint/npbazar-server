const mongoose = require('mongoose');

// Home page banner placements:
//  - hero_slider : big left carousel in the hero section (multiple slides)
//  - hero_side   : advertisement banner on the right of the hero grid
//  - home_bottom : banner strip below (nicher section)
const PLACEMENTS = ['hero_slider', 'hero_side', 'home_bottom'];

const bannerSchema = new mongoose.Schema(
    {
        placement: { type: String, enum: PLACEMENTS, required: true },
        image: { type: String, required: [true, 'Image is required'] },
        // Optional alternate image shown on small screens instead of `image`.
        mobileImage: { type: String, default: '' },
        // Where a click on the banner navigates to (product/category/any URL).
        link: { type: String, default: '' },
        title: { type: String, default: '', trim: true },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Banner', bannerSchema);
module.exports.PLACEMENTS = PLACEMENTS;
