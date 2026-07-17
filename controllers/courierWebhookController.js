const Order = require('../models/Order');
const CourierAccount = require('../models/CourierAccount');
const { getAdapter, PROVIDER_KEYS } = require('../couriers');
const { applyShipmentStatusUpdate } = require('../services/shipmentStatusService');

// POST /api/courier-webhooks/:provider/:token  (PUBLIC — no adminAuth)
// The URL-embedded token is the auth gate (see CourierAccount.webhookSecret) —
// no documented signature scheme was found for any of the 4 providers.
// Always responds 200, even on internal errors (logged server-side only),
// since courier gateways commonly auto-disable a webhook after repeated
// non-2xx responses and these payload assumptions are unverified.
exports.receive = async (req, res) => {
    try {
        const { provider, token } = req.params;
        if (!PROVIDER_KEYS.includes(provider)) return res.status(200).end();

        const account = await CourierAccount.findOne({ provider, webhookSecret: token });
        if (!account) return res.status(200).end();

        const adapter = getAdapter(provider);
        if (!adapter.verifyWebhook({ headers: req.headers, body: req.body, webhookSecret: account.webhookSecret })) {
            return res.status(200).end();
        }

        const { consignmentId, status, raw } = adapter.normalizeWebhookPayload(req.body);
        if (!consignmentId) return res.status(200).end();

        const order = await Order.findOne({ 'shipment.consignmentId': consignmentId });
        if (!order) return res.status(200).end();

        applyShipmentStatusUpdate(order, { status, raw, note: 'Updated via courier webhook' });
        await order.save();

        res.status(200).end();
    } catch (err) {
        console.error('Courier webhook error:', err.message);
        res.status(200).end();
    }
};
