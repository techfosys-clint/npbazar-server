const ShippingZone = require('../models/ShippingZone');
const Settings = require('../models/Settings');

/**
 * Resolve the shipping cost for a subtotal + destination city.
 * Looks for an active zone matching the city (case-insensitive); falls back
 * to the store-wide default in Settings when no zone matches.
 * @param {string} city
 * @param {number} subtotal
 */
const resolveShippingCost = async (city, subtotal) => {
    let zone = null;
    if (city) {
        zone = await ShippingZone.findOne({ city, isActive: true }).collation({ locale: 'en', strength: 2 });
    }

    if (zone) {
        if (zone.freeShippingThreshold > 0 && subtotal >= zone.freeShippingThreshold) return 0;
        return zone.shippingCost;
    }

    const settings = await Settings.getSingleton();
    if (settings.freeShippingThreshold > 0 && subtotal >= settings.freeShippingThreshold) return 0;
    return settings.shippingCost || 0;
};

module.exports = { resolveShippingCost };
