const Order = require('../models/Order');
const PaymentGatewayAccount = require('../models/PaymentGatewayAccount');
const { getAdapter, PAYMENT_PROVIDER_KEYS } = require('../payments');
const { decrypt } = require('../utils/crypto');
const { applyPaymentStatusUpdate } = require('../services/paymentStatusService');

function storefrontUrl(path) {
    const base = (process.env.STOREFRONT_URL || 'http://localhost:3000').replace(/\/$/, '');
    return `${base}${path}`;
}

// Shared by orderController.create/guestCreate — resolves the requested
// active gateway, calls its initiatePayment, and stamps the result onto
// order.payment (caller is responsible for order.save()). Throws on any
// failure; caller rolls back the order on catch.
exports.initiatePaymentForOrder = async (order, provider) => {
    if (!PAYMENT_PROVIDER_KEYS.includes(provider)) {
        throw new Error(`Unknown payment gateway: ${provider}`);
    }
    const account = await PaymentGatewayAccount.findOne({ provider, isActive: true });
    if (!account || !account.credentialsEncrypted) {
        throw new Error(`${provider} is not configured or not currently active`);
    }

    const adapter = getAdapter(provider);
    const credentials = decrypt(account.credentialsEncrypted);
    const base = (process.env.SERVER_PUBLIC_URL || '').replace(/\/$/, '');
    const callbackUrls = {
        success: `${base}/api/payments/callback/${provider}/${order.orderNumber}?result=success`,
        fail: `${base}/api/payments/callback/${provider}/${order.orderNumber}?result=fail`,
        cancel: `${base}/api/payments/callback/${provider}/${order.orderNumber}?result=cancel`,
        ipn: `${base}/api/payments/ipn/${provider}/${account.callbackSecret}`,
    };

    const result = await adapter.initiatePayment({ credentials, environment: account.environment, order, callbackUrls });

    order.payment = {
        provider,
        gatewayAccount: account._id,
        transactionId: order.orderNumber,
        gatewayTransactionId: result.gatewayTransactionId || '',
        status: 'pending',
        amount: order.total,
        paidAt: null,
        history: [{ status: 'pending', note: 'Payment initiated', raw: result.raw }],
    };

    return result.redirectUrl;
};

// Validates a gateway is actually usable before an order is even created —
// avoids creating+rolling-back an order for a simple "not configured" case.
exports.assertGatewayAvailable = async (provider) => {
    if (!PAYMENT_PROVIDER_KEYS.includes(provider)) {
        throw new Error(`paymentGateway must be one of: ${PAYMENT_PROVIDER_KEYS.join(', ')}`);
    }
    const account = await PaymentGatewayAccount.findOne({ provider, isActive: true });
    if (!account || !account.credentialsEncrypted) {
        throw new Error(`${provider} is not available right now — choose a different payment method.`);
    }
};

// Finds the order an IPN payload refers to — gateways vary in which
// reference field they send back, so this tries our own order number first
// (set as `tran_id`/`merchant_transaction_id`/`orderId` at initiate time),
// then falls back to the gateway's own transaction reference.
async function findOrderFromParams(params) {
    const orderNumber = params.tran_id || params.merchant_transaction_id || params.orderId;
    if (orderNumber) {
        const order = await Order.findOne({ orderNumber });
        if (order) return order;
    }
    const gatewayTxnId = params.paymentID || params.payment_ref_id || params.transaction_id || params.val_id;
    if (gatewayTxnId) {
        return Order.findOne({ 'payment.gatewayTransactionId': gatewayTxnId });
    }
    return null;
}

// GET/POST /api/payments/callback/:provider/:orderNumber  (public)
// Where the customer's browser lands after leaving the gateway. NOT trusted
// as proof by itself — always re-verifies server-to-server via
// adapter.verifyPayment before applying any status, then redirects the
// browser to the storefront's order-confirmation page.
exports.callback = async (req, res) => {
    const { provider, orderNumber } = req.params;
    const params = { ...req.query, ...req.body };

    try {
        if (!PAYMENT_PROVIDER_KEYS.includes(provider)) return res.redirect(storefrontUrl(`/order-confirmation/${orderNumber}`));

        const order = await Order.findOne({ orderNumber });
        if (!order) return res.redirect(storefrontUrl(`/order-confirmation/${orderNumber}`));

        const account = await PaymentGatewayAccount.findOne({ provider });
        if (!account || !account.credentialsEncrypted) return res.redirect(storefrontUrl(`/order-confirmation/${orderNumber}`));

        const adapter = getAdapter(provider);
        const credentials = decrypt(account.credentialsEncrypted);
        const result = await adapter.verifyPayment({ credentials, environment: account.environment, params });

        await applyPaymentStatusUpdate(order, { status: result.status, raw: result.raw, note: 'Verified via payment callback' });
        await order.save();
    } catch (err) {
        console.error('Payment callback error:', err.message);
    }

    res.redirect(storefrontUrl(`/order-confirmation/${orderNumber}`));
};

// POST /api/payments/ipn/:provider/:token  (public)
// The asynchronous, authoritative server-to-server notification. Always
// responds 200 (gateways commonly retry/disable IPNs after non-2xx
// responses) — errors are logged server-side, not surfaced to the caller.
exports.ipn = async (req, res) => {
    try {
        const { provider, token } = req.params;
        if (!PAYMENT_PROVIDER_KEYS.includes(provider)) return res.status(200).end();

        const account = await PaymentGatewayAccount.findOne({ provider, callbackSecret: token });
        if (!account || !account.credentialsEncrypted) return res.status(200).end();

        const adapter = getAdapter(provider);
        if (!adapter.verifyIpnSignature({ headers: req.headers, body: req.body, credentials: null })) {
            return res.status(200).end();
        }

        const order = await findOrderFromParams(req.body || {});
        if (!order) return res.status(200).end();

        const credentials = decrypt(account.credentialsEncrypted);
        // Real verification: always re-confirm via the gateway's own status
        // API rather than trusting the IPN body's status field directly.
        const result = await adapter.verifyPayment({ credentials, environment: account.environment, params: req.body });

        await applyPaymentStatusUpdate(order, { status: result.status, raw: result.raw, note: 'Verified via IPN' });
        await order.save();

        res.status(200).end();
    } catch (err) {
        console.error('Payment IPN error:', err.message);
        res.status(200).end();
    }
};
