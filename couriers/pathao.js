// NEEDS VERIFICATION — highest-risk of the four adapters. Built from Pathao
// Courier's public API docs, not tested against a real account. Pathao uses
// OAuth2 password-grant auth (client_id/client_secret/username/password ->
// short-lived access_token) rather than the other providers' static API-key
// headers, and also requires a numeric `store_id` + Pathao's own city/zone/area
// IDs (not free-text address) for order creation — the city/zone/area mapping
// below is a placeholder and near-certain to need real lookups against
// Pathao's `/aut/api/v1/city-list` etc. endpoints once real credentials exist.
//
// Deliberate simplification: this adapter re-authenticates on every call
// instead of caching/refreshing the access token, trading a small amount of
// extra latency for not needing a token-persistence path on top of an
// already-unverified integration. Revisit once this is confirmed working.

const axios = require('axios');

const BASE_URL = {
    sandbox: 'https://courier-api-sandbox.pathao.com',
    live: 'https://api-hermes.pathao.com',
};

// Pathao's own order_status strings -> this app's normalized STATUS_VALUES.
const STATUS_MAP = {
    Pending: 'pending',
    'Pickup Requested': 'pending',
    'Assigned for Pickup': 'picked_up',
    Picked: 'picked_up',
    'In Transit': 'in_transit',
    'Received at Distribution Hub': 'in_transit',
    'Assigned for Delivery': 'out_for_delivery',
    Delivered: 'delivered',
    'Partial Delivery': 'delivered',
    Return: 'returned',
    Cancelled: 'cancelled',
};

async function getAccessToken(base, credentials) {
    const res = await axios.post(`${base}/aut/api/v1/issue-token`, {
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        username: credentials.username,
        password: credentials.password,
        grant_type: 'password',
    });
    if (!res.data?.access_token) throw new Error('Pathao did not return an access_token');
    return res.data.access_token;
}

async function authHeaders(base, credentials) {
    const token = await getAccessToken(base, credentials);
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

module.exports = {
    key: 'pathao',
    label: 'Pathao Courier',
    credentialFields: [
        { key: 'client_id', label: 'Client ID', secret: false },
        { key: 'client_secret', label: 'Client Secret', secret: true },
        { key: 'username', label: 'Username (phone/email)', secret: false },
        { key: 'password', label: 'Password', secret: true },
        { key: 'store_id', label: 'Store ID', secret: false },
    ],

    baseUrl(environment) {
        return BASE_URL[environment] || BASE_URL.live;
    },

    async testConnection(credentials, environment) {
        try {
            const base = this.baseUrl(environment);
            const headers = await authHeaders(base, credentials);
            await axios.get(`${base}/aut/api/v1/stores`, { headers });
            return { ok: true, message: 'Connected.' };
        } catch (err) {
            return { ok: false, message: err.response?.data?.message || err.message };
        }
    },

    async createShipment({ credentials, environment, order }) {
        const base = this.baseUrl(environment);
        const headers = await authHeaders(base, credentials);
        const address = order.shippingAddress || {};

        const body = {
            store_id: Number(credentials.store_id),
            merchant_order_id: order.orderNumber,
            recipient_name: address.fullName || '',
            recipient_phone: address.phone || '',
            recipient_address: [address.addressLine, address.area, address.city].filter(Boolean).join(', '),
            delivery_type: 48, // normal delivery
            item_type: 2, // parcel
            special_instruction: `Ecomus order ${order.orderNumber}`,
            item_quantity: order.items?.length || 1,
            item_weight: 0.5,
            amount_to_collect: order.paymentMethod === 'cod' ? order.total : 0,
            item_description: (order.items || []).map((i) => i.name).join(', ').slice(0, 200),
        };

        const res = await axios.post(`${base}/aut/api/v1/orders`, body, { headers });
        const data = res.data?.data;
        if (!data?.consignment_id) throw new Error(res.data?.message || 'Pathao did not return a consignment_id');

        return {
            consignmentId: String(data.consignment_id),
            trackingCode: String(data.consignment_id),
            trackingUrl: '',
            status: module.exports.mapStatus(data.order_status),
            raw: res.data,
        };
    },

    async getStatus({ credentials, environment, consignmentId }) {
        const base = this.baseUrl(environment);
        const headers = await authHeaders(base, credentials);
        const res = await axios.get(`${base}/aut/api/v1/orders/${consignmentId}/info`, { headers });
        const status = res.data?.data?.order_status;
        return { status: module.exports.mapStatus(status), raw: res.data };
    },

    verifyWebhook() {
        // No documented signature scheme found — the webhook URL's embedded
        // secret token is the actual gate (checked before this is called).
        return true;
    },

    normalizeWebhookPayload(body) {
        return {
            consignmentId: String(body.consignment_id || ''),
            status: module.exports.mapStatus(body.order_status || body.status),
            raw: body,
        };
    },

    mapStatus(providerStatus) {
        return STATUS_MAP[providerStatus] || 'pending';
    },
};
