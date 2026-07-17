// Adapter contract (plain JS, no TS — every provider file exports this exact shape):
//
//   key: string
//   label: string
//   credentialFields: [{ key, label, secret, placeholder? }]
//   baseUrl(environment) -> string
//   testConnection(credentials, environment) -> Promise<{ ok: boolean, message: string }>
//   createShipment({ credentials, environment, order, webhookUrl }) ->
//       Promise<{ consignmentId, trackingCode, trackingUrl, status, raw }>
//   getStatus({ credentials, environment, consignmentId }) -> Promise<{ status, raw }>
//   verifyWebhook({ headers, body, webhookSecret }) -> boolean
//   normalizeWebhookPayload(body) -> { consignmentId, status, raw }
//   mapStatus(providerStatus) -> one of STATUS_VALUES
//
// Every adapter is built from public documentation only and has NOT been tested
// against a real courier account — see the "NEEDS VERIFICATION" comment at the
// top of each file. Steadfast is the most confidently sourced; Pathao is the
// highest-risk (OAuth2 token flow). Treat the first real shipment attempt per
// provider as the actual acceptance test for that adapter.

const pathao = require('./pathao');
const redx = require('./redx');
const steadfast = require('./steadfast');
const paperfly = require('./paperfly');

const STATUS_VALUES = [
    'pending',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'returned',
    'cancelled',
    'failed',
];

const adapters = { pathao, redx, steadfast, paperfly };

function getAdapter(provider) {
    const adapter = adapters[provider];
    if (!adapter) throw new Error(`Unknown courier provider: ${provider}`);
    return adapter;
}

module.exports = { adapters, getAdapter, STATUS_VALUES, PROVIDER_KEYS: Object.keys(adapters) };
