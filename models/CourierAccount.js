const mongoose = require('mongoose');
const { PROVIDER_KEYS } = require('../couriers');

// One connected account per courier provider. `credentialsEncrypted` holds a
// single AES-256-GCM-encrypted JSON blob (see utils/crypto.js) of whatever
// fields that provider's adapter declares via `credentialFields` — field
// shapes differ per provider, so this stays a flexible encrypted string
// rather than per-field columns.
const courierAccountSchema = new mongoose.Schema(
    {
        provider: { type: String, enum: PROVIDER_KEYS, required: true, unique: true },
        environment: { type: String, enum: ['sandbox', 'live'], default: 'sandbox' },
        credentialsEncrypted: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
        isDefault: { type: Boolean, default: false },
        // Random token embedded in the webhook URL shown to the merchant —
        // the actual auth gate for the public webhook receiver, since no
        // documented signature scheme was found for any of the 4 providers.
        webhookSecret: { type: String, default: '' },
        lastVerifiedAt: { type: Date, default: null },
        lastVerifyMessage: { type: String, default: '' },
    },
    { timestamps: true }
);

// DB-enforced single default across all providers.
courierAccountSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

module.exports = mongoose.model('CourierAccount', courierAccountSchema);
