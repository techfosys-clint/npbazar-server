const crypto = require('crypto');
const User = require('../models/User');
const { signToken } = require('../utils/token');
const { sendEmail } = require('../utils/sendEmail');
const { normalizeMobile, isValidMobile } = require('../utils/mobile');

const publicUser = (user) => ({
    id: user._id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    address: user.address,
    createdAt: user.createdAt,
});

const RESET_TOKEN_VALIDITY_MS = 30 * 60 * 1000; // 30 minutes
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * POST /api/user/register
 * Body: { name, mobile, email, password, address? }
 * Accounts are active immediately — no phone/OTP verification step. Email
 * is required so the account can always recover its password later.
 */
exports.register = async (req, res) => {
    try {
        let { name, mobile, email, password, address = '' } = req.body;
        if (!name || !mobile || !email || !password) {
            return res.status(400).json({ success: false, message: 'name, mobile number, email and password are required' });
        }
        mobile = normalizeMobile(mobile);
        if (!isValidMobile(mobile)) {
            return res.status(400).json({ success: false, message: 'Enter a valid Bangladeshi mobile number' });
        }
        email = String(email).toLowerCase().trim();

        const existing = await User.findOne({ $or: [{ mobile }, { email }] });
        if (existing) {
            return res.status(409).json({ success: false, message: 'Mobile number or email already registered' });
        }

        const user = await User.create({ name, mobile, email, password, address });
        const token = signToken({ id: user._id }, 'user');
        return res.status(201).json({ success: true, message: 'Registered', token, user: publicUser(user) });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'Mobile number or email already registered' });
        }
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

        const token = signToken({ id: user._id }, 'user');
        return res.json({ success: true, message: 'Logged in', token, user: publicUser(user) });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/user/forgot-password
 * Body: { email }
 * Emails a password-reset link (the raw token lives only in the email —
 * the DB stores a hash of it, same pattern as a session token).
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'email is required' });

        const user = await User.findOne({ email: String(email).toLowerCase().trim() });
        if (!user) return res.status(404).json({ success: false, message: 'No account found with that email' });

        const rawToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = hashToken(rawToken);
        user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_VALIDITY_MS);
        await user.save();

        const base = (process.env.STOREFRONT_URL || 'http://localhost:3000').replace(/\/$/, '');
        const resetUrl = `${base}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

        try {
            await sendEmail({
                to: user.email,
                subject: 'Reset your password',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; color: #1f2937;">
                        <h2 style="color: #111827;">Reset your password</h2>
                        <p>Hi ${user.name}, we received a request to reset your password. This link is valid for 30 minutes.</p>
                        <p>
                            <a href="${resetUrl}" style="display:inline-block; background:#111827; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">Reset Password</a>
                        </p>
                        <p style="color:#6b7280; font-size: 13px;">If you didn't request this, you can safely ignore this email — your password will stay unchanged.</p>
                    </div>
                `,
                text: `Reset your password: ${resetUrl} (valid for 30 minutes)`,
            });
        } catch (mailErr) {
            console.error('Failed to send password reset email:', mailErr.message);
            return res.status(502).json({ success: false, message: 'Failed to send the reset email. Please try again later.' });
        }

        return res.json({ success: true, message: 'A password reset link has been sent to your email.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/user/reset-password
 * Body: { email, token, password }
 * `token` is the raw value from the emailed link — compared against the
 * hash stored by forgotPassword.
 */
exports.resetPassword = async (req, res) => {
    try {
        const { email, token, password } = req.body;
        if (!email || !token || !password) {
            return res.status(400).json({ success: false, message: 'email, token and new password are required' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
            '+passwordResetToken +passwordResetExpires'
        );
        if (!user || !user.passwordResetToken || !user.passwordResetExpires) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset link. Please request a new one.' });
        }
        if (user.passwordResetExpires < new Date()) {
            return res.status(400).json({ success: false, message: 'Reset link expired. Please request a new one.' });
        }
        if (hashToken(token) !== user.passwordResetToken) {
            return res.status(400).json({ success: false, message: 'Invalid reset link.' });
        }

        user.password = password; // pre-save hook re-hashes it
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        const jwtToken = signToken({ id: user._id }, 'user');
        return res.json({ success: true, message: 'Password reset successful', token: jwtToken, user: publicUser(user) });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/user/me
exports.me = (req, res) => {
    res.json({ success: true, user: publicUser(req.user) });
};
