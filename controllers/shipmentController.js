const Order = require('../models/Order');
const CourierAccount = require('../models/CourierAccount');
const { getAdapter } = require('../couriers');
const { decrypt } = require('../utils/crypto');
const { applyShipmentStatusUpdate } = require('../services/shipmentStatusService');

function webhookUrlFor(account) {
    const base = (process.env.SERVER_PUBLIC_URL || '').replace(/\/$/, '');
    return `${base}/api/courier-webhooks/${account.provider}/${account.webhookSecret}`;
}

// POST /api/admin-orders/:id/shipment  (admin)  body: { courierId? }
exports.createShipment = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (order.shipment?.consignmentId) {
            return res.status(409).json({ success: false, message: 'This order already has a shipment' });
        }

        const { courierId } = req.body;
        const account = courierId
            ? await CourierAccount.findOne({ _id: courierId, isActive: true })
            : await CourierAccount.findOne({ isDefault: true, isActive: true });

        if (!account) {
            return res.status(400).json({
                success: false,
                message: 'No courier configured — connect one in Courier Integrations first.',
            });
        }
        if (!account.credentialsEncrypted) {
            return res.status(400).json({ success: false, message: `${account.provider} is connected but has no credentials saved.` });
        }

        const adapter = getAdapter(account.provider);
        const credentials = decrypt(account.credentialsEncrypted);

        let result;
        try {
            result = await adapter.createShipment({
                credentials,
                environment: account.environment,
                order,
                webhookUrl: webhookUrlFor(account),
            });
        } catch (adapterErr) {
            // Leave the order untouched on adapter failure; surface the courier's
            // own error message verbatim so a real-provider mismatch is diagnosable.
            const message = adapterErr.response?.data?.message || adapterErr.message;
            return res.status(502).json({ success: false, message: `${account.provider} error: ${message}` });
        }

        order.shipment = {
            provider: account.provider,
            courierAccount: account._id,
            consignmentId: result.consignmentId,
            trackingCode: result.trackingCode,
            trackingUrl: result.trackingUrl,
            status: null, // set via applyShipmentStatusUpdate below so history records the first entry
            createdAt: new Date(),
            trackingHistory: [],
        };
        applyShipmentStatusUpdate(order, { status: result.status, raw: result.raw, note: 'Shipment created' });

        await order.save();
        res.status(201).json({ success: true, message: 'Shipment created', order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/admin-orders/:id/shipment/refresh  (admin)
exports.refreshShipmentStatus = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (!order.shipment?.consignmentId) {
            return res.status(400).json({ success: false, message: 'This order has no shipment yet' });
        }

        const account = await CourierAccount.findById(order.shipment.courierAccount);
        if (!account) {
            return res.status(400).json({ success: false, message: 'The courier account used for this shipment no longer exists' });
        }

        const adapter = getAdapter(order.shipment.provider);
        const credentials = decrypt(account.credentialsEncrypted);

        let result;
        try {
            result = await adapter.getStatus({
                credentials,
                environment: account.environment,
                consignmentId: order.shipment.consignmentId,
            });
        } catch (adapterErr) {
            const message = adapterErr.response?.data?.message || adapterErr.message;
            return res.status(502).json({ success: false, message: `${account.provider} error: ${message}` });
        }

        applyShipmentStatusUpdate(order, { status: result.status, raw: result.raw, note: 'Status refreshed' });
        await order.save();

        res.json({ success: true, message: 'Shipment status refreshed', order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
