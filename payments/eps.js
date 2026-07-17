const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = {
    sandbox: 'https://sandboxpgapi.eps.com.bd',
    live: 'https://pgapi.eps.com.bd', // Guessed live URL, usually same structure without sandbox
};

const STATUS_MAP = {
    Success: 'paid',
    SUCCESS: 'paid',
    Failed: 'failed',
    FAILED: 'failed',
    Cancelled: 'cancelled',
    CANCELLED: 'cancelled',
    PENDING: 'pending',
    Pending: 'pending'
};

function generateHash(key, value) {
    if (!key) return '';
    const hmac = crypto.createHmac('sha512', Buffer.from(key, 'utf8'));
    hmac.update(value);
    return hmac.digest('base64');
}

module.exports = {
    key: 'eps',
    label: 'EPS Bangladesh',
    credentialFields: [
        { key: 'userName', label: 'User Name', secret: false },
        { key: 'password', label: 'Password', secret: true },
        { key: 'hash_key', label: 'Hash Key', secret: true },
        { key: 'store_id', label: 'Store ID', secret: false },
    ],

    baseUrl(environment) {
        return BASE_URL[environment] || BASE_URL.live;
    },

    async testConnection(credentials, environment) {
        try {
            const xHash = generateHash(credentials.hash_key, credentials.userName);
            const res = await axios.post(`${this.baseUrl(environment)}/v1/Auth/GetToken`, {
                userName: credentials.userName,
                password: credentials.password
            }, {
                headers: { 'x-hash': xHash }
            });
            if (res.data && res.data.token) {
                return { ok: true, message: 'Connected.' };
            }
            return { ok: false, message: res.data?.errorMessage || 'Invalid credentials' };
        } catch (err) {
            return { ok: false, message: err.response?.data?.errorMessage || err.message };
        }
    },

    async initiatePayment({ credentials, environment, order, callbackUrls }) {
        const base = this.baseUrl(environment);
        
        // 1. Get Token
        const xHashAuth = generateHash(credentials.hash_key, credentials.userName);
        const tokenRes = await axios.post(`${base}/v1/Auth/GetToken`, {
            userName: credentials.userName,
            password: credentials.password
        }, {
            headers: { 'x-hash': xHashAuth }
        });
        
        const token = tokenRes.data?.token;
        if (!token) throw new Error('Failed to get EPS token');

        // 2. Initialize Payment
        const merchantTransactionId = `${order.orderNumber}_${Date.now()}`;
        const xHashInit = generateHash(credentials.hash_key, merchantTransactionId);
        
        const address = order.shippingAddress || {};
        
        const body = {
            storeId: credentials.store_id,
            merchantTransactionId: merchantTransactionId,
            CustomerOrderId: String(order.orderNumber),
            transactionTypeId: 1, // Web
            financialEntityId: 0,
            transitionStatusId: 0,
            totalAmount: order.total,
            ipAddress: "127.0.0.1",
            version: "1",
            successUrl: callbackUrls.success,
            failUrl: callbackUrls.fail,
            cancelUrl: callbackUrls.cancel,
            customerName: address.fullName || 'Customer',
            customerEmail: order.customerEmail || 'example@gmail.com',
            customerAddress: address.address1 || 'Address',
            customerAddress2: address.address2 || '',
            customerCity: address.city || 'City',
            customerState: address.state || 'State',
            customerPostcode: address.postalCode || '0000',
            customerCountry: address.country || 'BD',
            customerPhone: address.phone || '01000000000',
            shipmentName: address.fullName || 'Customer',
            shipmentAddress: address.address1 || 'Address',
            shipmentAddress2: address.address2 || '',
            shipmentCity: address.city || 'City',
            shipmentState: address.state || 'State',
            shipmentPostcode: address.postalCode || '0000',
            shipmentCountry: address.country || 'BD',
            valueA: "",
            valueB: "",
            valueC: "",
            valueD: "",
            shippingMethod: "NO",
            noOfItem: "1",
            productName: "Order Products",
            productProfile: "general",
            productCategory: "Ecomus",
            ProductList: order.items ? order.items.map(item => ({
                ProductName: item.name || "Product",
                NoOfItem: String(item.quantity || 1),
                ProductProfile: "General",
                ProductCategory: "Category",
                ProductPrice: String(item.price || 0)
            })) : []
        };

        const res = await axios.post(`${base}/v1/EPSEngine/InitializeEPS`, body, {
            headers: {
                'x-hash': xHashInit,
                'Authorization': `Bearer ${token}`
            }
        });
        
        const redirectUrl = res.data?.RedirectURL;
        if (!redirectUrl) throw new Error(res.data?.ErrorMessage || 'EPS did not return a payment URL');

        return { redirectUrl, gatewayTransactionId: merchantTransactionId, raw: res.data };
    },

    async verifyPayment({ credentials, environment, params }) {
        // Find transaction id from query or body depending on what EPS returns
        const transactionId = params.transaction_id || params.merchantTransactionId || params.merchant_transaction_id;
        if (!transactionId) return { status: 'failed', amount: 0, raw: { message: 'No transaction_id provided in callback parameters' } };

        const base = this.baseUrl(environment);
        
        // 1. Get Token
        const xHashAuth = generateHash(credentials.hash_key, credentials.userName);
        const tokenRes = await axios.post(`${base}/v1/Auth/GetToken`, {
            userName: credentials.userName,
            password: credentials.password
        }, {
            headers: { 'x-hash': xHashAuth }
        });
        
        const token = tokenRes.data?.token;
        if (!token) throw new Error('Failed to get EPS token for verification');

        // 2. Check Status
        const xHashCheck = generateHash(credentials.hash_key, transactionId);
        
        const res = await axios.get(`${base}/v1/EPSEngine/CheckMerchantTransactionStatus`, {
            headers: {
                'x-hash': xHashCheck,
                'Authorization': `Bearer ${token}`
            },
            params: { merchantTransactionId: transactionId }
        });
        
        return { status: module.exports.mapStatus(res.data?.Status), amount: Number(res.data?.TotalAmount) || 0, raw: res.data };
    },

    verifyIpnSignature({ body }) {
        // verification happens via verifyPayment's status-query call.
        return !!(body?.transaction_id || body?.merchantTransactionId || body?.merchant_transaction_id);
    },

    mapStatus(providerStatus) {
        return STATUS_MAP[providerStatus] || 'pending';
    },
};
