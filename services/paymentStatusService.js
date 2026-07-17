const Product = require('../models/Product');
const Coupon = require('../models/Coupon');

// Reverses the exact commit done at order creation (see orderController.js
// create/guestCreate: `$inc: { sold: qty, stock: -qty }` per item, plus
// `Coupon.usedCount += 1`) — called when an online payment ends up
// failed/cancelled so an abandoned payment doesn't leak reserved stock or
// coupon uses. COD never needs this since it only ever succeeds immediately.
async function restoreStockAndCoupon(order) {
    await Promise.all(
        order.items.map(async (i) => {
            const product = await Product.findById(i.product);
            if (!product) return;
            const inc = { sold: -i.quantity };
            if (product.stock !== null) inc.stock = i.quantity; // unlimited stock was never decremented
            await Product.updateOne({ _id: i.product }, { $inc: inc });
        })
    );
    if (order.couponCode) {
        await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: -1 } });
    }
}

// Shared by the payment callback and IPN handlers so "apply a verified
// payment status to an order" logic lives in one place. Mirrors the
// push+save pattern in shipmentStatusService.applyShipmentStatusUpdate.
async function applyPaymentStatusUpdate(order, { status, raw, note }) {
    if (!order.payment || !status || status === order.payment.status) return order;

    const previousStatus = order.payment.status;
    order.payment.status = status;
    order.payment.history.push({ status, note: note || '', raw });

    if (status === 'paid') {
        order.payment.paidAt = new Date();
        order.paymentStatus = 'paid';
        if (order.orderStatus === 'pending') {
            order.orderStatus = 'processing';
            order.statusHistory.push({ status: 'processing', note: note || 'Payment confirmed' });
        }
    } else if (status === 'failed' || status === 'cancelled') {
        order.paymentStatus = 'failed';
        // Restore stock/coupon exactly once, even if both the callback and
        // the IPN separately report the same failure.
        if (previousStatus !== 'failed' && previousStatus !== 'cancelled') {
            await restoreStockAndCoupon(order);
        }
    }

    return order;
}

module.exports = { applyPaymentStatusUpdate, restoreStockAndCoupon };
