// NEEDS VERIFICATION — built from RedX's public Open API docs, not tested
// against a real account. RedX requires a `delivery_area_id` chosen from
// their own predefined area list (not a free-text city/address) — this
// adapter does a best-effort name match against `GET /areas` using the
// order's city/area text, which is fragile and the most likely thing to
// need correcting once tested against a real sandbox account.

const axios = require('axios');

const BASE_URL = {
    sandbox: 'https://openapi.redx.com.bd/v1.0.0-beta',
    live: 'https://openapi.redx.com.bd/v1.0.0-beta',
};

// RedX's own parcel status strings -> this app's normalized STATUS_VALUES.
const STATUS_MAP = {
    'pickup-pending': 'pending',
    'pickup-cancel': 'cancelled',
    picked: 'picked_up',
    'in-transit': 'in_transit',
    'delivery-pending': 'out_for_delivery',
    delivered: 'delivered',
    'partial-delivered': 'delivered',
    returned: 'returned',
    'return-pending': 'in_transit',
    hold: 'in_transit',
};

function headers(credentials) {
    return {
        'API-ACCESS-TOKEN': `Bearer ${credentials.api_token}`,
        'Content-Type': 'application/json',
    };
}

async function findAreaId(base, credentials, cityOrArea) {
    if (!cityOrArea) return null;
    const res = await axios.get(`${base}/areas`, { headers: headers(credentials) });
    const areas = res.data?.areas || res.data?.body || [];
    const needle = cityOrArea.toLowerCase();
    const match = areas.find((a) => (a.name || '').toLowerCase().includes(needle));
    return match ? match.id : null;
}

module.exports = {
    key: 'redx',
    label: 'RedX',
    credentialFields: [{ key: 'api_token', label: 'API Access Token', secret: true }],

    baseUrl(environment) {
        return BASE_URL[environment] || BASE_URL.live;
    },

    async testConnection(credentials, environment) {
        try {
            await axios.get(`${this.baseUrl(environment)}/areas`, { headers: headers(credentials) });
            return { ok: true, message: 'Connected.' };
        } catch (err) {
            return { ok: false, message: err.response?.data?.message || err.message };
        }
    },

    async createShipment({ credentials, environment, order }) {
        const base = this.baseUrl(environment);
        const address = order.shippingAddress || {};
        const areaId = await findAreaId(base, credentials, address.area || address.city);
        if (!areaId) {
            throw new Error(
                `Could not resolve a RedX delivery area for "${address.area || address.city || ''}" — RedX requires a predefined area, not free-text. Verify area matching before using this in production.`
            );
        }

        const body = {
            customer_name: address.fullName || '',
            customer_phone: address.phone || '',
            delivery_area: address.area || address.city || '',
            delivery_area_id: areaId,
            customer_address: [address.addressLine, address.area, address.city].filter(Boolean).join(', '),
            merchant_invoice_id: order.orderNumber,
            cash_collection_amount: order.paymentMethod === 'cod' ? order.total : 0,
            parcel_weight: 500,
            value: order.total,
            instruction: `Ecomus order ${order.orderNumber}`,
        };

        const res = await axios.post(`${base}/parcel`, body, { headers: headers(credentials) });
        const trackingId = res.data?.tracking_id;
        if (!trackingId) throw new Error(res.data?.message_en || res.data?.message || 'RedX did not return a tracking_id');

        return {
            consignmentId: String(trackingId),
            trackingCode: String(trackingId),
            trackingUrl: '',
            status: 'pending',
            raw: res.data,
        };
    },

    async getStatus({ credentials, environment, consignmentId }) {
        const res = await axios.get(`${this.baseUrl(environment)}/parcel/track/${consignmentId}`, {
            headers: headers(credentials),
        });
        const status = res.data?.parcel?.status || res.data?.status;
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
            status: module.exports.mapStatus(body.status),
            raw: body,
        };
    },

    mapStatus(providerStatus) {
        return STATUS_MAP[providerStatus] || 'pending';
    },
};
