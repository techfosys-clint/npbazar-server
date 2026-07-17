const crypto = require('crypto');
const PaymentGatewayAccount = require('../models/PaymentGatewayAccount');
const { adapters, getAdapter, PAYMENT_PROVIDER_KEYS } = require('../payments');
const { encrypt, decrypt } = require('../utils/crypto');

function ipnUrlFor(account) {
    const base = (process.env.SERVER_PUBLIC_URL || '').replace(/\/$/, '');
    return `${base}/api/payments/ipn/${account.provider}/${account.callbackSecret}`;
}

// Never send credentialsEncrypted (or decrypted credentials) to the client.
function toPublicAccount(account) {
    return {
        _id: account._id,
        provider: account.provider,
        environment: account.environment,
        isActive: account.isActive,
        hasCredentials: !!account.credentialsEncrypted,
        ipnUrl: ipnUrlFor(account),
        lastVerifiedAt: account.lastVerifiedAt,
        lastVerifyMessage: account.lastVerifyMessage,
        createdAt: account.createdAt,
    };
}

// GET /api/payment-gateways/active  (public) — for the checkout page to render as options.
exports.listActive = async (req, res) => {
    const accounts = await PaymentGatewayAccount.find({ isActive: true, credentialsEncrypted: { $ne: '' } });
    const active = accounts.map((a) => ({ key: a.provider, label: adapters[a.provider]?.label || a.provider }));
    res.json({ success: true, gateways: active });
};

// GET /api/payment-gateways/providers  (admin) — static adapter metadata for the connect form.
exports.listProviders = async (req, res) => {
    const providers = PAYMENT_PROVIDER_KEYS.map((key) => ({
        key,
        label: adapters[key].label,
        credentialFields: adapters[key].credentialFields,
    }));
    res.json({ success: true, providers });
};

// GET /api/payment-gateways/accounts  (admin)
exports.listAccounts = async (req, res) => {
    const accounts = await PaymentGatewayAccount.find().sort({ provider: 1 });
    res.json({ success: true, accounts: accounts.map(toPublicAccount) });
};

// POST /api/payment-gateways/accounts  (admin)  body: { provider, environment, credentials }
exports.connectAccount = async (req, res) => {
    try {
        const { provider, environment, credentials } = req.body;
        if (!PAYMENT_PROVIDER_KEYS.includes(provider)) {
            return res.status(400).json({ success: false, message: `provider must be one of: ${PAYMENT_PROVIDER_KEYS.join(', ')}` });
        }
        if (!credentials || typeof credentials !== 'object') {
            return res.status(400).json({ success: false, message: 'credentials object is required' });
        }

        let account = await PaymentGatewayAccount.findOne({ provider });
        if (!account) account = new PaymentGatewayAccount({ provider });

        account.environment = environment === 'live' ? 'live' : 'sandbox';
        account.credentialsEncrypted = encrypt(credentials);
        if (!account.callbackSecret) account.callbackSecret = crypto.randomBytes(24).toString('hex');
        account.isActive = true;

        await account.save();
        res.status(201).json({ success: true, account: toPublicAccount(account) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/payment-gateways/accounts/:id  (admin)  body: { environment?, credentials?, isActive? }
// `credentials`, if present, is a FULL REPLACE — not merged with existing values.
exports.updateAccount = async (req, res) => {
    try {
        const account = await PaymentGatewayAccount.findById(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: 'Payment gateway account not found' });

        const { environment, credentials, isActive } = req.body;
        if (environment) account.environment = environment === 'live' ? 'live' : 'sandbox';
        if (credentials && typeof credentials === 'object') account.credentialsEncrypted = encrypt(credentials);
        if (typeof isActive === 'boolean') account.isActive = isActive;

        await account.save();
        res.json({ success: true, account: toPublicAccount(account) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/payment-gateways/accounts/:id/test  (admin)
exports.testConnection = async (req, res) => {
    try {
        const account = await PaymentGatewayAccount.findById(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: 'Payment gateway account not found' });
        if (!account.credentialsEncrypted) {
            return res.status(400).json({ success: false, message: 'No credentials saved for this account' });
        }

        const adapter = getAdapter(account.provider);
        const credentials = decrypt(account.credentialsEncrypted);
        const result = await adapter.testConnection(credentials, account.environment);

        account.lastVerifiedAt = new Date();
        account.lastVerifyMessage = result.message;
        await account.save();

        res.json({ success: result.ok, message: result.message });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/payment-gateways/accounts/:id  (admin) — disconnects.
exports.removeAccount = async (req, res) => {
    const account = await PaymentGatewayAccount.findByIdAndDelete(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Payment gateway account not found' });
    res.json({ success: true, message: 'Payment gateway disconnected' });
};
