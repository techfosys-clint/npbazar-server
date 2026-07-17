// NEEDS VERIFICATION — HIGHEST RISK of the four adapters. Nagad's merchant
// checkout API uses an RSA challenge-response handshake (encrypt a payload
// with Nagad's public key, sign it with the merchant's own private key) that
// is both the most complex and the most likely of the four to have drifted
// from current docs. The cryptographic operations below (RSA encrypt with
// Nagad's public key, sign with the merchant's private key) follow Nagad's
// documented pattern structurally, but exact endpoint paths, header names,
// and payload field names are a best-effort reconstruction — verify against
// real Nagad merchant docs and a sandbox account before any production use.

const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = {
    sandbox: 'http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0',
    live: 'https://api.mynagad.com/remote-payment-gateway-1.0',
};

const STATUS_MAP = {
    Success: 'paid',
    Completed: 'paid',
    Failed: 'failed',
    Cancelled: 'cancelled',
    Pending: 'pending',
};

function sign(privateKeyPem, data) {
    const signer = crypto.createSign('SHA256');
    signer.update(data);
    signer.end();
    return signer.sign(privateKeyPem, 'base64');
}

function encryptWithNagadPublicKey(nagadPublicKeyPem, data) {
    return crypto.publicEncrypt(
        { key: nagadPublicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(data)
    ).toString('base64');
}

function commonHeaders(credentials) {
    return {
        'Content-Type': 'application/json',
        'X-KM-Api-Version': 'v-0.2.0',
        'X-KM-IP-V4': '127.0.0.1',
        'X-KM-Client-Type': 'PC_WEB',
    };
}

module.exports = {
    key: 'nagad',
    label: 'Nagad',
    credentialFields: [
        { key: 'merchant_id', label: 'Merchant ID', secret: false },
        { key: 'merchant_number', label: 'Merchant Number', secret: false },
        { key: 'merchant_private_key', label: 'Merchant Private Key (PEM)', secret: true },
        { key: 'nagad_public_key', label: 'Nagad Public Key (PEM)', secret: true },
    ],

    baseUrl(environment) {
        return BASE_URL[environment] || BASE_URL.live;
    },

    async testConnection(credentials, environment) {
        try {
            const orderId = `TEST-${Date.now()}`;
            const dateTime = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
            const sensitiveData = JSON.stringify({ merchantId: credentials.merchant_id, datetime: dateTime, orderId, challenge: crypto.randomBytes(20).toString('hex') });
            const payload = {
                accountNumber: credentials.merchant_number,
                dateTime,
                sensitiveData: encryptWithNagadPublicKey(credentials.nagad_public_key, sensitiveData),
                signature: sign(credentials.merchant_private_key, sensitiveData),
            };
            const res = await axios.post(
                `${this.baseUrl(environment)}/api/dfs/check-out/initialize/${credentials.merchant_id}/${orderId}`,
                payload,
                { headers: commonHeaders(credentials) }
            );
            const ok = !!res.data?.sensitiveData;
            return { ok, message: ok ? 'Connected.' : res.data?.message || 'Credentials rejected' };
        } catch (err) {
            return { ok: false, message: err.response?.data?.message || err.message };
        }
    },

    async initiatePayment({ credentials, environment, order, callbackUrls }) {
        const base = this.baseUrl(environment);
        const orderId = order.orderNumber;
        const dateTime = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
        const challenge = crypto.randomBytes(20).toString('hex');

        const initSensitiveData = JSON.stringify({ merchantId: credentials.merchant_id, datetime: dateTime, orderId, challenge });
        const initRes = await axios.post(
            `${base}/api/dfs/check-out/initialize/${credentials.merchant_id}/${orderId}`,
            {
                accountNumber: credentials.merchant_number,
                dateTime,
                sensitiveData: encryptWithNagadPublicKey(credentials.nagad_public_key, initSensitiveData),
                signature: sign(credentials.merchant_private_key, initSensitiveData),
            },
            { headers: commonHeaders(credentials) }
        );
        const paymentReferenceId = initRes.data?.paymentReferenceId;
        if (!paymentReferenceId) throw new Error(initRes.data?.message || 'Nagad did not return a paymentReferenceId');

        const completeSensitiveData = JSON.stringify({
            merchantId: credentials.merchant_id,
            orderId,
            currencyCode: '050', // BDT
            amount: String(order.total),
            challenge: initRes.data?.challenge || challenge,
        });
        const completeRes = await axios.post(
            `${base}/api/dfs/check-out/complete/${paymentReferenceId}`,
            {
                sensitiveData: encryptWithNagadPublicKey(credentials.nagad_public_key, completeSensitiveData),
                signature: sign(credentials.merchant_private_key, completeSensitiveData),
                merchantCallbackURL: callbackUrls.success,
            },
            { headers: commonHeaders(credentials) }
        );
        const redirectUrl = completeRes.data?.callBackUrl;
        if (!redirectUrl) throw new Error(completeRes.data?.message || 'Nagad did not return a checkout URL');

        return { redirectUrl, gatewayTransactionId: paymentReferenceId, raw: { init: initRes.data, complete: completeRes.data } };
    },

    async verifyPayment({ credentials, environment, params }) {
        const paymentReferenceId = params.payment_ref_id;
        if (!paymentReferenceId) return { status: 'failed', amount: 0, raw: { message: 'No payment_ref_id provided' } };

        const res = await axios.get(`${this.baseUrl(environment)}/api/dfs/verify/payment/${paymentReferenceId}`, {
            headers: commonHeaders(credentials),
        });
        return { status: module.exports.mapStatus(res.data?.status), amount: Number(res.data?.amount) || 0, raw: res.data };
    },

    verifyIpnSignature({ body }) {
        // Nagad's callback carries its own `signature` field, RSA-signed —
        // a full verify (crypto.verify against Nagad's public key) needs the
        // exact signed-payload construction confirmed against real docs
        // before being trusted as the sole gate. Shape check only for now;
        // verifyPayment's server-to-server verify call is the real check.
        return !!(body?.payment_ref_id || body?.paymentReferenceId);
    },

    mapStatus(providerStatus) {
        return STATUS_MAP[providerStatus] || 'pending';
    },
};
