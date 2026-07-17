const mongoose = require('mongoose');

// A per-area shipping rule. `city` is matched case-insensitively against the
// order's shipping address city at checkout. Areas not matching any zone
// fall back to the store-wide default in Settings (shippingCost / freeShippingThreshold).
const shippingZoneSchema = new mongoose.Schema(
    {
        name: { type: String, required: [true, 'Zone name is required'], trim: true }, // e.g. "Inside Dhaka"
        city: { type: String, required: [true, 'City/area is required'], trim: true }, // matched against shippingAddress.city
        shippingCost: { type: Number, required: true, min: 0, default: 0 },
        freeShippingThreshold: { type: Number, default: 0, min: 0 }, // 0 = disabled for this zone
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// One rule per city (case-insensitive) so lookups are unambiguous.
shippingZoneSchema.index({ city: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('ShippingZone', shippingZoneSchema);
