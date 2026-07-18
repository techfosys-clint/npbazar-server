const mongoose = require('mongoose');

// Single-document store configuration.
const settingsSchema = new mongoose.Schema(
    {
        storeName: { type: String, default: 'Ecomus' },
        logo: { type: String, default: '' },
        favicon: { type: String, default: '' },
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        address: { type: String, default: '' },
        currency: { type: String, default: 'BDT' },
        currencySymbol: { type: String, default: '৳' },
        // Storefront theme colors — all admin-editable hex strings.
        buttonColor: { type: String, default: '#f97316' }, // Add to Cart / CTA buttons
        primaryColor: { type: String, default: '#df0000' }, // prices, badges, links, hover accents
        navbarColor: { type: String, default: '#0b2221' }, // dark navbar / utility bar background
        backgroundColor: { type: String, default: '#fbf9f5' }, // page background
        shippingCost: { type: Number, default: 0 },
        freeShippingThreshold: { type: Number, default: 0 }, // free shipping above this subtotal (0 = disabled)
        socialLinks: {
            facebook: { type: String, default: '' },
            instagram: { type: String, default: '' },
            youtube: { type: String, default: '' },
            twitter: { type: String, default: '' },
        },
        // Third-party tracking/verification codes, rendered by the storefront
        // root layout — lets the merchant wire up analytics without code changes.
        trackingCodes: {
            ga4MeasurementId: { type: String, default: '' },
            gtmContainerId: { type: String, default: '' },
            metaPixelId: { type: String, default: '' },
            searchConsoleVerification: { type: String, default: '' },
            bingVerification: { type: String, default: '' },
            customHeadCode: { type: String, default: '' },
        },
        aboutUs: { type: String, default: '' },
        contactUs: { type: String, default: '' },
        privacyPolicy: { type: String, default: '' },
        refundPolicy: { type: String, default: '' },
    },
    { timestamps: true }
);

// Convenience: always return (creating if needed) the single settings doc.
settingsSchema.statics.getSingleton = async function () {
    let doc = await this.findOne();
    if (!doc) doc = await this.create({});
    return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
