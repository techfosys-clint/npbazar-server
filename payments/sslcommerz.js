// NEEDS VERIFICATION — built from SSLCommerz's public API docs, not tested
// against a real merchant account. This is the HIGHEST-confidence adapter of
// the four (SSLCommerz's session-init + validator-API flow is extremely
// widely used and stable), and is the reference the other adapters are
// modeled against.
//
// Security model: SSLCommerz does NOT sign IPN/callback payloads with an
// HMAC — their documented verification mechanism IS the validator API call
// itself (GET .../validator/api/validationserverAPI.php?val_id=...). So
// `verifyIpnSignature` here only checks that the required fields are present
// (a shape check) — the REAL verification happens in `verifyPayment`, which
// the payment controller always calls before trusting any status. Never
// apply a paid status from the IPN/callback body alone.

const axios = require('axios');

const BASE_URL = {
    sandbox: 'https://sandbox.sslcommerz.com',
    live: 'https://securepay.sslcommerz.com',
};

const STATUS_MAP = {
    VALID: 'paid',
    VALIDATED: 'paid',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    UNATTEMPTED: 'pending',
    EXPIRED: 'failed',
};

module.exports = {
    key: 'sslcommerz',
    label: 'SSLCommerz',
    credentialFields: [
        { key: 'store_id', label: 'Store ID', secret: false },
        { key: 'store_passwd', label: 'Store Password', secret: true },
    ],

    baseUrl(environment) {
        return BASE_URL[environment] || BASE_URL.live;
    },

    async testConnection(credentials, environment) {
        try {
            // No dedicated "ping" endpoint — a session-init call with a
            // trivial amount is SSLCommerz's own recommended connectivity check.
            const res = await axios.post(
                `${this.baseUrl(environment)}/gwprocess/v4/api.php`,
                new URLSearchParams({
                    store_id: credentials.store_id,
                    store_passwd: credentials.store_passwd,
                    total_amount: '10',
                    currency: 'BDT',
                    tran_id: `TEST-${Date.now()}`,
                    success_url: 'https://example.com/success',
                    fail_url: 'https://example.com/fail',
                    cancel_url: 'https://example.com/cancel',
                    cus_name: 'Test', cus_email: 'test@example.com', cus_add1: 'Test', cus_city: 'Dhaka',
                    cus_country: 'Bangladesh', cus_phone: '01700000000',
                    shipping_method: 'NO', product_name: 'Test', product_category: 'Test', product_profile: 'general',
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            const ok = res.data?.status === 'SUCCESS';
            return { ok, message: ok ? 'Connected.' : res.data?.failedreason || 'Credentials rejected' };
        } catch (err) {
            return { ok: false, message: err.response?.data?.failedreason || err.message };
        }
    },

    async initiatePayment({ credentials, environment, order, callbackUrls }) {
        const base = this.baseUrl(environment);
        const address = order.shippingAddress || {};

        const body = new URLSearchParams({
            store_id: credentials.store_id,
            store_passwd: credentials.store_passwd,
            total_amount: String(order.total),
            currency: 'BDT',
            tran_id: order.orderNumber,
            success_url: callbackUrls.success,
            fail_url: callbackUrls.fail,
            cancel_url: callbackUrls.cancel,
            ipn_url: callbackUrls.ipn,
            cus_name: address.fullName || '',
            cus_email: order.customerEmail || 'no-reply@example.com',
            cus_add1: address.addressLine || '',
            cus_city: address.city || '',
            cus_country: 'Bangladesh',
            cus_phone: address.phone || '',
            shipping_method: 'NO',
            product_name: `Order ${order.orderNumber}`,
            product_category: 'General',
            product_profile: 'general',
        });

        const res = await axios.post(`${base}/gwprocess/v4/api.php`, body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (res.data?.status !== 'SUCCESS' || !res.data?.GatewayPageURL) {
            throw new Error(res.data?.failedreason || 'SSLCommerz did not return a payment URL');
        }

        return { redirectUrl: res.data.GatewayPageURL, gatewayTransactionId: res.data.sessionkey || '', raw: res.data };
    },

    async verifyPayment({ credentials, environment, params }) {
        const valId = params.val_id;
        if (!valId) return { status: 'failed', amount: 0, raw: { message: 'No val_id provided' } };

        const res = await axios.get(`${this.baseUrl(environment)}/validator/api/validationserverAPI.php`, {
            params: { val_id: valId, store_id: credentials.store_id, store_passwd: credentials.store_passwd, format: 'json' },
        });
        const status = module.exports.mapStatus(res.data?.status);
        return { status, amount: Number(res.data?.amount) || 0, raw: res.data };
    },

    verifyIpnSignature({ body }) {
        // No HMAC scheme documented — shape check only. Real verification
        // happens via verifyPayment's validator-API call (see file header).
        return !!(body?.tran_id && body?.val_id);
    },

    mapStatus(providerStatus) {
        return STATUS_MAP[providerStatus] || 'pending';
    },
};
