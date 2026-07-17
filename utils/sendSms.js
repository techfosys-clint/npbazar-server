const axios = require('axios');

/**
 * Send an SMS through the FoxSES gateway.
 * Endpoint: {SMS_GATEWAY_BASE_URL}/send-message
 * @param {string} recipient - phone number, e.g. 01XXXXXXXXX
 * @param {string} message
 */
const sendSms = async (recipient, message) => {
    const url = `${process.env.SMS_GATEWAY_BASE_URL}/send-message`;
    const payload = {
        client_id: process.env.SMS_GATEWAY_CLIENT_ID,
        key: process.env.SMS_GATEWAY_API_KEY,
        recipient: recipient.replace(/\D/g, ''), // Strip '+' so it's '8801...'
        message,
    };

    try {
        const { data } = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        return data;
    } catch (err) {
        console.error('SMS Gateway Error:', err.response?.data || err.message);
        throw new Error('Failed to send SMS OTP. Please check your number or try again later.');
    }
};

// Send the OTP verification SMS for user phone verification.
// `mobile` is stored locally as "01XXXXXXXXX" — the gateway needs the BD
// country code, so prepend "88" to get "8801XXXXXXXXX" before sending.
const sendOtpSms = (mobile, otp) =>
    sendSms(`88${mobile}`, `Your Ecomus verification code is ${otp}. It expires in ${process.env.OTP_EXPIRES_MINUTES || 5} minutes.`);

module.exports = { sendSms, sendOtpSms };
