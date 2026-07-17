const crypto = require('crypto');
const CourierAccount = require('../models/CourierAccount');
const { adapters, getAdapter, PROVIDER_KEYS } = require('../couriers');
const { encrypt, decrypt } = require('../utils/crypto');

function webhookUrlFor(account) {
    const base = (process.env.SERVER_PUBLIC_URL || '').replace(/\/$/, '');
    return `${base}/api/courier-webhooks/${account.provider}/${account.webhookSecret}`;
}

// Never send credentialsEncrypted (or decrypted credentials) to the client.
function toPublicAccount(account) {
    return {
        _id: account._id,
        provider: account.provider,
        environment: account.environment,
        isActive: account.isActive,
        isDefault: account.isDefault,
        hasCredentials: !!account.credentialsEncrypted,
        webhookUrl: webhookUrlFor(account),
        lastVerifiedAt: account.lastVerifiedAt,
        lastVerifyMessage: account.lastVerifyMessage,
        createdAt: account.createdAt,
    };
}

// GET /api/courier/providers  (admin) — static adapter metadata for the connect form.
exports.listProviders = async (req, res) => {
    const providers = PROVIDER_KEYS.map((key) => ({
        key,
        label: adapters[key].label,
        credentialFields: adapters[key].credentialFields,
    }));
    res.json({ success: true, providers });
};

// GET /api/courier/accounts  (admin)
exports.listAccounts = async (req, res) => {
    const accounts = await CourierAccount.find().sort({ provider: 1 });
    res.json({ success: true, accounts: accounts.map(toPublicAccount) });
};

// POST /api/courier/accounts  (admin)  body: { provider, environment, credentials }
exports.connectAccount = async (req, res) => {
    try {
        const { provider, environment, credentials } = req.body;
        if (!PROVIDER_KEYS.includes(provider)) {
            return res.status(400).json({ success: false, message: `provider must be one of: ${PROVIDER_KEYS.join(', ')}` });
        }
        if (!credentials || typeof credentials !== 'object') {
            return res.status(400).json({ success: false, message: 'credentials object is required' });
        }

        let account = await CourierAccount.findOne({ provider });
        if (!account) account = new CourierAccount({ provider });

        account.environment = environment === 'live' ? 'live' : 'sandbox';
        account.credentialsEncrypted = encrypt(credentials);
        if (!account.webhookSecret) account.webhookSecret = crypto.randomBytes(24).toString('hex');
        account.isActive = true;

        await account.save();
        res.status(201).json({ success: true, account: toPublicAccount(account) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// PATCH /api/courier/accounts/:id  (admin)  body: { environment?, credentials?, isActive? }
// `credentials`, if present, is a FULL REPLACE — not merged with existing values.
exports.updateAccount = async (req, res) => {
    try {
        const account = await CourierAccount.findById(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: 'Courier account not found' });

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

// POST /api/courier/accounts/:id/test  (admin)
exports.testConnection = async (req, res) => {
    try {
        const account = await CourierAccount.findById(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: 'Courier account not found' });
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

// PATCH /api/courier/accounts/:id/default  (admin)
exports.setDefault = async (req, res) => {
    try {
        const account = await CourierAccount.findById(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: 'Courier account not found' });

        await CourierAccount.updateMany({ _id: { $ne: account._id } }, { isDefault: false });
        account.isDefault = true;
        await account.save();

        res.json({ success: true, account: toPublicAccount(account) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/courier/accounts/:id  (admin) — disconnects; does not auto-promote another default.
exports.removeAccount = async (req, res) => {
    const account = await CourierAccount.findByIdAndDelete(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Courier account not found' });
    res.json({ success: true, message: 'Courier account disconnected' });
};
