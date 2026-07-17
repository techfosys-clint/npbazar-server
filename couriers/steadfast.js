// NEEDS VERIFICATION — endpoint paths, field names, and response shapes are
// built from Steadfast's public API docs and NOT tested against a real
// account; verify with a real API key before relying on this in production.
//
// The base host below (portal.packzy.com) IS confirmed correct — Steadfast
// Courier was formerly branded "Packzy" and its API is still served from
// that legacy domain (verified via DNS resolution during testing; the
// steadfast.com.bd domain resolves for their marketing site but has no API).
//
// Steadfast does not appear to offer a separate sandbox host in its public
// docs — merchants typically get a single API key pair for their real account.
// The `environment` toggle here is kept for UI consistency with the other
// providers, but for Steadfast it currently has no effect on `baseUrl()`.
// Revisit once real docs/account access confirm otherwise.

const axios = require('axios');

const BASE_URL = 'https://portal.packzy.com/api/v1';

// Steadfast's own `delivery_status` strings -> this app's normalized STATUS_VALUES.
const STATUS_MAP = {
    pending: 'pending',
    in_review: 'pending',
    delivered_approval_pending: 'delivered',
    partial_delivered_approval_pending: 'delivered',
    cancelled_approval_pending: 'cancelled',
    unknown_approval_pending: 'in_transit',
    delivered: 'delivered',
    partial_delivered: 'delivered',
    cancelled: 'cancelled',
};

function headers(credentials) {
    return {
        'Api-Key': credentials.api_key,
        'Secret-Key': credentials.secret_key,
        'Content-Type': 'application/json',
    };
}

module.exports = {
    key: 'steadfast',
    label: 'Steadfast Courier',
    credentialFields: [
        { key: 'api_key', label: 'API Key', secret: true },
        { key: 'secret_key', label: 'Secret Key', secret: true },
    ],

    baseUrl() {
        return BASE_URL;
    },

    async testConnection(credentials) {
        try {
            const res = await axios.get(`${BASE_URL}/get_balance`, { headers: headers(credentials) });
            return { ok: true, message: `Connected. Balance: ${res.data?.current_balance ?? 'unknown'}` };
        } catch (err) {
            return { ok: false, message: err.response?.data?.message || err.message };
        }
    },

    async createShipment({ credentials, order }) {
        const address = order.shippingAddress || {};
        const body = {
            invoice: order.orderNumber,
            recipient_name: address.fullName || '',
            recipient_phone: address.phone || '',
            recipient_address: [address.addressLine, address.area, address.city].filter(Boolean).join(', '),
            cod_amount: order.paymentMethod === 'cod' ? order.total : 0,
            note: `Ecomus order ${order.orderNumber}`,
        };

        const res = await axios.post(`${BASE_URL}/create_order`, body, { headers: headers(credentials) });
        const c = res.data?.consignment;
        if (!c) throw new Error(res.data?.message || 'Steadfast did not return a consignment');

        return {
            consignmentId: String(c.consignment_id),
            trackingCode: c.tracking_code || String(c.consignment_id),
            trackingUrl: '',
            status: module.exports.mapStatus(c.status),
            raw: res.data,
        };
    },

    async getStatus({ credentials, consignmentId }) {
        const res = await axios.get(`${BASE_URL}/status_by_cid/${consignmentId}`, { headers: headers(credentials) });
        return { status: module.exports.mapStatus(res.data?.delivery_status), raw: res.data };
    },

    verifyWebhook() {
        // No documented signature scheme found — the webhook URL's embedded
        // secret token is the actual gate (checked before this is called).
        return true;
    },

    normalizeWebhookPayload(body) {
        return {
            consignmentId: String(body.consignment_id || body.cid || ''),
            status: module.exports.mapStatus(body.delivery_status || body.status),
            raw: body,
        };
    },

    mapStatus(providerStatus) {
        return STATUS_MAP[providerStatus] || 'pending';
    },
};
