// NEEDS VERIFICATION — lowest confidence of the four adapters. Paperfly's
// merchant API is far less publicly documented than Pathao/RedX/Steadfast, so
// the endpoint paths and payload shape below are a best-effort placeholder
// based on Paperfly's general merchant-portal integration pattern (merchant
// ID + API key, order-booking endpoint, tracking-by-ID endpoint), NOT a
// confirmed API contract. Treat every field name and path here as a guess
// to be corrected once you have real Paperfly merchant API documentation or
// sandbox access — this file will need the most rework of the four.

const axios = require('axios');

const BASE_URL = {
    sandbox: 'https://api.paperfly.com.bd/sandbox',
    live: 'https://api.paperfly.com.bd',
};

// Best-effort guess at Paperfly's status vocabulary -> this app's normalized STATUS_VALUES.
const STATUS_MAP = {
    booked: 'pending',
    picked: 'picked_up',
    'in transit': 'in_transit',
    'out for delivery': 'out_for_delivery',
    delivered: 'delivered',
    returned: 'returned',
    cancelled: 'cancelled',
};

function headers(credentials) {
    return {
        Authorization: `Bearer ${credentials.api_key}`,
        'X-Merchant-Id': credentials.merchant_id,
        'Content-Type': 'application/json',
    };
}

module.exports = {
    key: 'paperfly',
    label: 'Paperfly',
    credentialFields: [
        { key: 'merchant_id', label: 'Merchant ID', secret: false },
        { key: 'api_key', label: 'API Key', secret: true },
    ],

    baseUrl(environment) {
        return BASE_URL[environment] || BASE_URL.live;
    },

    async testConnection(credentials, environment) {
        try {
            await axios.get(`${this.baseUrl(environment)}/merchant/profile`, { headers: headers(credentials) });
            return { ok: true, message: 'Connected.' };
        } catch (err) {
            return { ok: false, message: err.response?.data?.message || err.message };
        }
    },

    async createShipment({ credentials, environment, order }) {
        const base = this.baseUrl(environment);
        const address = order.shippingAddress || {};

        const body = {
            merchant_order_id: order.orderNumber,
            recipient_name: address.fullName || '',
            recipient_phone: address.phone || '',
            recipient_address: [address.addressLine, address.area, address.city].filter(Boolean).join(', '),
            collect_amount: order.paymentMethod === 'cod' ? order.total : 0,
            remarks: `Ecomus order ${order.orderNumber}`,
        };

        const res = await axios.post(`${base}/order/book`, body, { headers: headers(credentials) });
        const trackingId = res.data?.tracking_id || res.data?.consignment_id;
        if (!trackingId) throw new Error(res.data?.message || 'Paperfly did not return a tracking ID');

        return {
            consignmentId: String(trackingId),
            trackingCode: String(trackingId),
            trackingUrl: '',
            status: 'pending',
            raw: res.data,
        };
    },

    async getStatus({ credentials, environment, consignmentId }) {
        const res = await axios.get(`${this.baseUrl(environment)}/order/track/${consignmentId}`, {
            headers: headers(credentials),
        });
        const status = (res.data?.status || '').toLowerCase();
        return { status: module.exports.mapStatus(status), raw: res.data };
    },

    verifyWebhook() {
        // No documented signature scheme found — the webhook URL's embedded
        // secret token is the actual gate (checked before this is called).
        return true;
    },

    normalizeWebhookPayload(body) {
        return {
            consignmentId: String(body.tracking_id || body.consignment_id || ''),
            status: module.exports.mapStatus((body.status || '').toLowerCase()),
            raw: body,
        };
    },

    mapStatus(providerStatus) {
        return STATUS_MAP[providerStatus] || 'pending';
    },
};
