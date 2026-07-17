const mongoose = require('mongoose');

// One storefront page visit. The (future) storefront calls POST /api/analytics/track
// on page load with a persistent sessionId (e.g. stored in a cookie/localStorage)
// so visits from the same visitor within a session collapse into one "session"
// for the Sessions/Conversion metrics.
const pageViewSchema = new mongoose.Schema(
    {
        sessionId: { type: String, required: true, index: true },
        path: { type: String, default: '/' },
        referrer: { type: String, default: '' },
        deviceType: { type: String, enum: ['desktop', 'mobile', 'tablet'], default: 'desktop' },
        country: { type: String, default: '' },
    },
    { timestamps: true }
);

pageViewSchema.index({ createdAt: 1 });

module.exports = mongoose.model('PageView', pageViewSchema);
