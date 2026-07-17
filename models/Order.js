const mongoose = require('mongoose');
const { PROVIDER_KEYS, STATUS_VALUES } = require('../couriers');
const { PAYMENT_PROVIDER_KEYS, PAYMENT_STATUS_VALUES } = require('../payments');

// Snapshot of a product at purchase time (so later product edits don't change the order).
const orderItemSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        thumbnail: { type: String, default: '' },
        price: { type: Number, required: true },
        // Buying cost per unit at the time of sale — powers profit reporting.
        costPrice: { type: Number, default: 0 },
        quantity: { type: Number, required: true, min: 1 },
        variant: { type: Map, of: String, default: {} },
    },
    { _id: false }
);

const orderSchema = new mongoose.Schema(
    {
        orderNumber: { type: String, required: true, unique: true },
        // Optional for admin-created (phone/walk-in) orders without a registered account.
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        items: { type: [orderItemSchema], required: true },

        // Where the order came from and, for manual orders, which admin created it.
        source: { type: String, enum: ['website', 'admin'], default: 'website' },
        createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

        // Where the invoice gets emailed. Copied from the account for website
        // orders; entered by hand for admin-created (walk-in/phone) orders.
        customerEmail: { type: String, default: '' },
        invoiceSentAt: { type: Date, default: null },

        shippingAddress: {
            fullName: String,
            phone: String,
            addressLine: String,
            area: String,
            city: String,
            postalCode: String,
        },

        subtotal: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        couponCode: { type: String, default: '' },
        couponDiscountType: { type: String, default: '' }, // for display on the invoice/order detail
        shippingCost: { type: Number, default: 0 },
        total: { type: Number, required: true },

        paymentMethod: { type: String, enum: ['cod', 'online'], default: 'cod' },
        paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
        orderStatus: {
            type: String,
            enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
            default: 'pending',
        },
        // Audit trail of status changes.
        statusHistory: [
            {
                status: String,
                note: String,
                at: { type: Date, default: Date.now },
            },
        ],

        // Courier shipment, created on demand from the order detail page.
        // Embedded (not a separate collection) since there's exactly one
        // active consignment per order and no cross-courier history need.
        shipment: {
            provider: { type: String, enum: PROVIDER_KEYS, default: null },
            courierAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'CourierAccount', default: null },
            consignmentId: { type: String, default: null, index: true },
            trackingCode: { type: String, default: '' },
            trackingUrl: { type: String, default: '' },
            status: { type: String, enum: STATUS_VALUES, default: null },
            createdAt: { type: Date, default: null },
            lastSyncedAt: { type: Date, default: null },
            // Full raw provider payload per event — kept since every courier
            // adapter is unverified and this is essential for debugging.
            trackingHistory: [
                {
                    status: String,
                    note: String,
                    at: { type: Date, default: Date.now },
                    raw: mongoose.Schema.Types.Mixed,
                },
            ],
        },

        // Online gateway payment, set when paymentMethod !== 'cod'. Embedded
        // (not a separate collection) for the same reason as `shipment` —
        // exactly one active payment attempt per order, plus an audit trail.
        payment: {
            provider: { type: String, enum: PAYMENT_PROVIDER_KEYS, default: null },
            gatewayAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentGatewayAccount', default: null },
            transactionId: { type: String, default: null, index: true }, // our reference, sent to the gateway
            gatewayTransactionId: { type: String, default: '' },          // their reference, returned by the gateway
            status: { type: String, enum: PAYMENT_STATUS_VALUES, default: null },
            amount: { type: Number, default: 0 },
            paidAt: { type: Date, default: null },
            history: [
                {
                    status: String,
                    note: String,
                    at: { type: Date, default: Date.now },
                    raw: mongoose.Schema.Types.Mixed,
                },
            ],
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
