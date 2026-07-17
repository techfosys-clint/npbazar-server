const mongoose = require('mongoose');
const { PAYMENT_PROVIDER_KEYS } = require('../payments');

// One connected account per payment gateway. `credentialsEncrypted` holds a
// single AES-256-GCM-encrypted JSON blob (see utils/crypto.js, same key
// already used for courier credentials) of whatever fields that gateway's
// adapter declares via `credentialFields`. Unlike CourierAccount, there is
// no `isDefault` — multiple gateways can be active at once and the customer
// picks one at checkout alongside COD.
const paymentGatewayAccountSchema = new mongoose.Schema(
    {
        provider: { type: String, enum: PAYMENT_PROVIDER_KEYS, required: true, unique: true },
        environment: { type: String, enum: ['sandbox', 'live'], default: 'sandbox' },
        credentialsEncrypted: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
        // Random token embedded in the callback/IPN URLs — one layer of
        // defense alongside each adapter's own verifyPayment/verifyIpnSignature.
        callbackSecret: { type: String, default: '' },
        lastVerifiedAt: { type: Date, default: null },
        lastVerifyMessage: { type: String, default: '' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('PaymentGatewayAccount', paymentGatewayAccountSchema);
