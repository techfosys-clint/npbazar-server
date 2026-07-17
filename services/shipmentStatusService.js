// Shared by the manual "Refresh Status" endpoint and the courier webhook
// receiver so the "apply a status change to an order" logic lives in one
// place. Mirrors the push+save pattern already used in
// orderController.adminUpdateStatus for order.statusHistory.

function applyShipmentStatusUpdate(order, { status, raw, note }) {
    if (!order.shipment) return order;

    if (status && status !== order.shipment.status) {
        order.shipment.status = status;
        order.shipment.trackingHistory.push({ status, note: note || '', raw });

        if (status === 'delivered') {
            order.orderStatus = 'delivered';
            order.statusHistory.push({ status: 'delivered', note: note || 'Delivered by courier' });
            if (order.paymentMethod === 'cod') order.paymentStatus = 'paid';
        } else if (status === 'cancelled' || status === 'returned') {
            order.statusHistory.push({ status, note: note || `Courier reported: ${status}` });
        } else if (['pending', 'processing'].includes(order.orderStatus)) {
            // First real courier movement — bump the order out of pending/processing.
            order.orderStatus = 'shipped';
            order.statusHistory.push({ status: 'shipped', note: 'Shipment in progress with courier' });
        }
    }

    order.shipment.lastSyncedAt = new Date();
    return order;
}

module.exports = { applyShipmentStatusUpdate };
