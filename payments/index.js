// Adapter contract (plain JS, no TS — every provider file exports this exact shape):
//
//   key: string
//   label: string
//   credentialFields: [{ key, label, secret, placeholder? }]
//   baseUrl(environment) -> string
//   testConnection(credentials, environment) -> Promise<{ ok: boolean, message: string }>
//   initiatePayment({ credentials, environment, order, callbackUrls }) ->
//       Promise<{ redirectUrl, gatewayTransactionId, raw }>
//   verifyPayment({ credentials, environment, params }) -> Promise<{ status, amount, raw }>
//       Calls the gateway's OWN status/validator API — never trusts the
//       redirect/IPN payload at face value. This is the real security
//       boundary for real money, unlike the courier webhooks (which had no
//       documented signature scheme and fell back to a URL-embedded secret).
//   verifyIpnSignature({ headers, body, credentials }) -> boolean
//   mapStatus(providerStatus) -> one of PAYMENT_STATUS_VALUES
//
// Every adapter is built from public documentation only and has NOT been
// tested against a real merchant account — see the "NEEDS VERIFICATION"
// comment at the top of each file. SSLCommerz is the most confidently
// sourced; Nagad is the highest-risk (RSA/AES challenge-response). Treat the
// first real payment attempt per provider as the actual acceptance test.

const sslcommerz = require('./sslcommerz');
const bkash = require('./bkash');
const eps = require('./eps');
const nagad = require('./nagad');

const PAYMENT_STATUS_VALUES = ['pending', 'paid', 'failed', 'cancelled'];

const adapters = { sslcommerz, bkash, eps, nagad };

function getAdapter(provider) {
    const adapter = adapters[provider];
    if (!adapter) throw new Error(`Unknown payment gateway: ${provider}`);
    return adapter;
}

module.exports = {
    adapters,
    getAdapter,
    PAYMENT_STATUS_VALUES,
    PAYMENT_PROVIDER_KEYS: Object.keys(adapters),
};
