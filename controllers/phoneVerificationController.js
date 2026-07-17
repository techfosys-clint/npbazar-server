const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const PhoneVerification = require('../models/PhoneVerification');
const { normalizeMobile, isValidMobile } = require('../utils/mobile');
const { generateOtp } = require('../utils/generatePassword');
const { sendOtpSms } = require('../utils/sendSms');

const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const TOKEN_VALIDITY_MS = 60 * 60 * 1000; // 60 minutes

/**
 * POST /api/phone-verification/send  (public)
 * Body: { mobile }
 * Sends (or resends) an OTP for a phone number to be verified at checkout —
 * no User account required. Basic per-number cooldown since this is a
 * public, unauthenticated, SMS-cost-incurring endpoint.
 */
exports.sendOtp = async (req, res) => {
    try {
        let { mobile } = req.body;
        if (!mobile) return res.status(400).json({ success: false, message: 'mobile is required' });
        mobile = normalizeMobile(mobile);
        if (!isValidMobile(mobile)) {
            return res.status(400).json({ success: false, message: 'Enter a valid Bangladeshi mobile number' });
        }

        let record = await PhoneVerification.findOne({ mobile });
        if (record?.lastSentAt && Date.now() - record.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
            const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - record.lastSentAt.getTime())) / 1000);
            return res.status(429).json({ success: false, message: `Please wait ${waitSec}s before requesting another code.` });
        }

        const otp = generateOtp();
        const minutes = Number(process.env.OTP_EXPIRES_MINUTES) || 5;
        if (!record) record = new PhoneVerification({ mobile });
        record.codeHash = await bcrypt.hash(otp, 10);
        record.expiresAt = new Date(Date.now() + minutes * 60 * 1000);
        record.verified = false;
        record.verifiedToken = undefined;
        record.attempts = 0;
        record.lastSentAt = new Date();
        await record.save();

        await sendOtpSms(mobile, otp);
        res.json({ success: true, message: 'OTP sent to your mobile number.' });
    } catch (err) {
        res.status(502).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/phone-verification/verify  (public)
 * Body: { mobile, otp }
 * Returns a short-lived token proving this exact number was OTP-verified —
 * order creation requires this token for guest checkout, or for a logged-in
 * user checking out with a number other than their own account's.
 */
exports.verifyOtp = async (req, res) => {
    try {
        const { mobile: rawMobile, otp } = req.body;
        if (!rawMobile || !otp) {
            return res.status(400).json({ success: false, message: 'mobile and otp are required' });
        }
        const mobile = normalizeMobile(rawMobile);

        const record = await PhoneVerification.findOne({ mobile }).select('+codeHash');
        if (!record || !record.codeHash) {
            return res.status(400).json({ success: false, message: 'No OTP pending. Please request a new one.' });
        }
        if (record.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
        }
        if (record.attempts >= MAX_ATTEMPTS) {
            return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new code.' });
        }
        if (!(await bcrypt.compare(String(otp), record.codeHash))) {
            record.attempts += 1;
            await record.save();
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        record.verified = true;
        record.verifiedToken = crypto.randomBytes(24).toString('hex');
        record.verifiedAt = new Date();
        record.attempts = 0;
        await record.save();

        res.json({ success: true, message: 'Phone number verified', token: record.verifiedToken });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Shared helper for order creation: does a valid, unexpired verification
// exist for this exact phone + token?
exports.isPhoneVerifiedWithToken = async (mobile, token) => {
    if (!token) return false;
    const normalized = normalizeMobile(mobile);
    const record = await PhoneVerification.findOne({ mobile: normalized, verified: true, verifiedToken: token });
    if (!record || !record.verifiedAt) return false;
    return Date.now() - record.verifiedAt.getTime() < TOKEN_VALIDITY_MS;
};
