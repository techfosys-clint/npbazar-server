const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken } = require('../utils/token');
const { generateOtp } = require('../utils/generatePassword');
const { sendOtpSms } = require('../utils/sendSms');
const { normalizeMobile, isValidMobile } = require('../utils/mobile');

const publicUser = (user) => ({
    id: user._id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    address: user.address,
    isPhoneVerified: user.isPhoneVerified,
    createdAt: user.createdAt,
});

// Create + persist a fresh OTP on the user document, then SMS it.
const issueOtp = async (user) => {
    const otp = generateOtp();
    const minutes = Number(process.env.OTP_EXPIRES_MINUTES) || 5;
    user.otp = {
        code: await bcrypt.hash(otp, 10),
        expiresAt: new Date(Date.now() + minutes * 60 * 1000),
    };
    await user.save();
    await sendOtpSms(user.mobile, otp);
};

/**
 * POST /api/user/register
 * Body: { name, mobile, password, email?, address? } — mobile is required and
 * must be a valid BD number. The account stays unverified and an OTP is sent;
 * verify-otp is required before the user can log in.
 */
exports.register = async (req, res) => {
    try {
        let { name, mobile, email, password, address = '' } = req.body;
        if (!name || !password || !mobile) {
            return res.status(400).json({ success: false, message: 'name, mobile number and password are required' });
        }
        mobile = normalizeMobile(mobile);
        if (!isValidMobile(mobile)) {
            return res.status(400).json({ success: false, message: 'Enter a valid Bangladeshi mobile number' });
        }

        if (email) {
            const emailTaken = await User.findOne({ email: String(email).toLowerCase() });
            if (emailTaken) return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const existing = await User.findOne({ mobile });
        if (existing) {
            if (existing.isPhoneVerified) {
                return res.status(409).json({ success: false, message: 'Mobile number already registered' });
            }
            // Unverified re-registration: refresh details and resend the OTP.
            existing.name = name;
            if (email) existing.email = email;
            existing.password = password;
            if (address) existing.address = address;
            await existing.save();
            try {
                await issueOtp(existing);
            } catch (smsErr) {
                return res.status(502).json({ success: false, message: smsErr.message });
            }
            return res.status(200).json({
                success: true,
                message: 'Account exists but is unverified. A new OTP has been sent.',
                userId: existing._id,
            });
        }

        const user = await User.create({ name, mobile, email, password, address });
        try {
            await issueOtp(user);
        } catch (smsErr) {
            // Don't strand an unverifiable account if the SMS never went out.
            await User.deleteOne({ _id: user._id });
            return res.status(502).json({ success: false, message: smsErr.message });
        }

        return res.status(201).json({
            success: true,
            message: 'Registered. An OTP has been sent to your mobile number for verification.',
            userId: user._id,
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'Mobile number or email already registered' });
        }
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/user/verify-otp
 * Body: { mobile, otp }
 */
exports.verifyOtp = async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        if (!mobile || !otp) {
            return res.status(400).json({ success: false, message: 'mobile and otp are required' });
        }

        const user = await User.findOne({ mobile: normalizeMobile(mobile) }).select('+otp.code +otp.expiresAt');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.isPhoneVerified) {
            return res.status(400).json({ success: false, message: 'Phone already verified' });
        }
        if (!user.otp?.code || !user.otp?.expiresAt) {
            return res.status(400).json({ success: false, message: 'No OTP pending. Please request a new one.' });
        }
        if (user.otp.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
        }
        if (!(await bcrypt.compare(String(otp), user.otp.code))) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        user.isPhoneVerified = true;
        user.otp = undefined;
        await user.save();

        const token = signToken({ id: user._id }, 'user');
        return res.json({ success: true, message: 'Phone verified', token, user: publicUser(user) });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/user/resend-otp
 * Body: { mobile }
 */
exports.resendOtp = async (req, res) => {
    try {
        const { mobile } = req.body;
        if (!mobile) return res.status(400).json({ success: false, message: 'mobile is required' });

        const user = await User.findOne({ mobile: normalizeMobile(mobile) });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.isPhoneVerified) {
            return res.status(400).json({ success: false, message: 'Phone already verified' });
        }

        await issueOtp(user);
        return res.json({ success: true, message: 'A new OTP has been sent to your mobile number.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/user/login
 * Body: { mobile, password } — mobile number only (no email login).
 */
exports.login = async (req, res) => {
    try {
        const { mobile, password } = req.body;
        if (!mobile || !password) {
            return res.status(400).json({ success: false, message: 'mobile number and password are required' });
        }

        const user = await User.findOne({ mobile: normalizeMobile(mobile) }).select('+password');
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid mobile number or password' });
        }
        if (!user.isPhoneVerified) {
            return res.status(403).json({
                success: false,
                message: 'Phone number not verified. Please verify with the OTP first.',
                requiresVerification: true,
            });
        }

        const token = signToken({ id: user._id }, 'user');
        return res.json({ success: true, message: 'Logged in', token, user: publicUser(user) });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/user/forgot-password
 * Body: { mobile }
 * Sends an OTP (reusing the same OTP field as registration) that reset-password verifies.
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { mobile } = req.body;
        if (!mobile) return res.status(400).json({ success: false, message: 'mobile number is required' });

        const user = await User.findOne({ mobile: normalizeMobile(mobile) });
        if (!user) return res.status(404).json({ success: false, message: 'No account found with that mobile number' });

        try {
            await issueOtp(user);
        } catch (smsErr) {
            return res.status(502).json({ success: false, message: smsErr.message });
        }
        return res.json({ success: true, message: 'An OTP has been sent to your mobile number.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/user/reset-password
 * Body: { mobile, otp, password }
 * Verifying the OTP here also marks the phone verified, so a forgotten
 * password can't leave an account stuck unverified.
 */
exports.resetPassword = async (req, res) => {
    try {
        const { mobile, otp, password } = req.body;
        if (!mobile || !otp || !password) {
            return res.status(400).json({ success: false, message: 'mobile, otp and new password are required' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const user = await User.findOne({ mobile: normalizeMobile(mobile) }).select('+otp.code +otp.expiresAt');
        if (!user) return res.status(404).json({ success: false, message: 'No account found with that mobile number' });
        if (!user.otp?.code || !user.otp?.expiresAt) {
            return res.status(400).json({ success: false, message: 'No OTP pending. Please request a new one.' });
        }
        if (user.otp.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
        }
        if (!(await bcrypt.compare(String(otp), user.otp.code))) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        user.password = password; // pre-save hook re-hashes it
        user.otp = undefined;
        user.isPhoneVerified = true;
        await user.save();

        const token = signToken({ id: user._id }, 'user');
        return res.json({ success: true, message: 'Password reset successful', token, user: publicUser(user) });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/user/me
exports.me = (req, res) => {
    res.json({ success: true, user: publicUser(req.user) });
};
