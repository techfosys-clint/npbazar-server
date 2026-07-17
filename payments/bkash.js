// NEEDS VERIFICATION — built from bKash's public Tokenized Checkout (PGW)
// API docs, not tested against a real merchant account. Moderate confidence:
// the OAuth-style token-grant + create/execute flow is documented but has
// changed shape across API versions.
//
// Known gap to review before production: bKash's real flow requires calling
// POST /tokenized/checkout/execute exactly ONCE after the customer approves
// payment (this is what actually captures the money) — it is a mutating,
// non-idempotent call. To keep this adapter's `verifyPayment` safe to call
// from both the callback AND the IPN path (as the shared registry contract
// requires), it calls the read-only "query payment status" endpoint instead
// of execute. This means the actual `execute` call needs to happen exactly
// once, most naturally inside the callback handler before verification —
// flagged here rather than silently guessed at, since getting this wrong
// either double-charges or never captures the payment.

const axios = require('axios');

const BASE_URL = {
    sandbox: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
    live: 'https://tokenized.pay.bka.sh/v1.2.0-beta',
};

const STATUS_MAP = {
    Completed: 'paid',
    Initiated: 'pending',
    'Config for the merchant is missing': 'failed',
    Failed: 'failed',
    Cancelled: 'cancelled',
};

async function grantToken(base, credentials) {
    const res = await axios.post(
        `${base}/tokenized/checkout/token/grant`,
        { app_key: credentials.app_key, app_secret: credentials.app_secret },
        { headers: { username: credentials.username, password: credentials.password, 'Content-Type': 'application/json' } }
    );
    if (!res.data?.id_token) throw new Error(res.data?.msg || 'bKash did not return an id_token');
    return res.data.id_token;
}

function authHeaders(token, credentials) {
    return { Authorization: token, 'X-App-Key': credentials.app_key, 'Content-Type': 'application/json' };
}

module.exports = {
    key: 'bkash',
    label: 'bKash',
    credentialFields: [
        { key: 'app_key', label: 'App Key', secret: false },
        { key: 'app_secret', label: 'App Secret', secret: true },
        { key: 'username', label: 'Username', secret: false },
        { key: 'password', label: 'Password', secret: true },
    ],

    baseUrl(environment) {
        return BASE_URL[environment] || BASE_URL.live;
    },

    async testConnection(credentials, environment) {
        try {
            await grantToken(this.baseUrl(environment), credentials);
            return { ok: true, message: 'Connected.' };
        } catch (err) {
            return { ok: false, message: err.response?.data?.msg || err.message };
        }
    },

    async initiatePayment({ credentials, environment, order, callbackUrls }) {
        const base = this.baseUrl(environment);
        const token = await grantToken(base, credentials);

        const res = await axios.post(
            `${base}/tokenized/checkout/create`,
            {
                mode: '0011',
                payerReference: order.shippingAddress?.phone || order.orderNumber,
                callbackURL: callbackUrls.success, // bKash uses a single callback URL with a status query param
                amount: String(order.total),
                currency: 'BDT',
                intent: 'sale',
                merchantInvoiceNumber: order.orderNumber,
            },
            { headers: authHeaders(token, credentials) }
        );
        if (!res.data?.bkashURL || !res.data?.paymentID) {
            throw new Error(res.data?.statusMessage || 'bKash did not return a payment URL');
        }

        return { redirectUrl: res.data.bkashURL, gatewayTransactionId: res.data.paymentID, raw: res.data };
    },

    async verifyPayment({ credentials, environment, params }) {
        const paymentID = params.paymentID;
        if (!paymentID) return { status: 'failed', amount: 0, raw: { message: 'No paymentID provided' } };

        const base = this.baseUrl(environment);
        const token = await grantToken(base, credentials);
        const res = await axios.post(
            `${base}/tokenized/checkout/payment/status`,
            { paymentID },
            { headers: authHeaders(token, credentials) }
        );
        return { status: module.exports.mapStatus(res.data?.transactionStatus), amount: Number(res.data?.amount) || 0, raw: res.data };
    },

    verifyIpnSignature({ body }) {
        // No documented HMAC scheme for the callback — shape check only.
        // Real verification happens via verifyPayment's status-query call.
        return !!body?.paymentID;
    },

    mapStatus(providerStatus) {
        return STATUS_MAP[providerStatus] || 'pending';
    },
};
