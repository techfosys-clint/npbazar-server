const crypto = require('crypto');
const Admin = require('../models/Admin');
const { signToken } = require('../utils/token');
const { generatePassword } = require('../utils/generatePassword');
const { sendAdminWelcomeEmail, sendEmail } = require('../utils/sendEmail');
const { PAGES, PAGE_KEYS, ALL_ACCESS } = require('../config/permissions');

const RESET_TOKEN_VALIDITY_MS = 30 * 60 * 1000; // 30 minutes
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const publicAdmin = (admin) => ({
    id: admin._id,
    fullName: admin.fullName,
    email: admin.email,
    role: admin.role,
    permissions: admin.permissions,
    isSuperAdmin: admin.isSuperAdmin,
    isActive: admin.isActive,
    createdAt: admin.createdAt,
});

// GET /api/admin/pages  -> list of pages that access can be granted to (for the register form)
exports.getPages = (req, res) => {
    res.json({ success: true, pages: PAGES });
};

// GET /api/admin/check-superadmin -> check if superadmin exists
exports.checkSuperAdmin = async (req, res) => {
    try {
        const count = await Admin.countDocuments();
        res.json({ success: true, hasSuperAdmin: count > 0 });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/admin/register
 * Registers the FIRST admin as the Super Admin. Only works while no admin exists.
 * Body: { fullName, email, password }
 */
exports.registerSuperAdmin = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        if (!fullName || !email || !password) {
            return res.status(400).json({ success: false, message: 'fullName, email and password are required' });
        }

        const existingCount = await Admin.countDocuments();
        if (existingCount > 0) {
            return res.status(403).json({
                success: false,
                message: 'Super admin already exists. New admins/staff must be created from the admin panel.',
            });
        }

        const admin = await Admin.create({
            fullName,
            email,
            password,
            role: 'super_admin',
            isSuperAdmin: true,
            permissions: [ALL_ACCESS],
        });

        const token = signToken({ id: admin._id }, 'admin');
        return res.status(201).json({ success: true, message: 'Super admin created', token, admin: publicAdmin(admin) });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'Email already in use' });
        }
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/admin/login
 * Body: { email, password }
 */
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'email and password are required' });
        }

        const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password');
        if (!admin || !(await admin.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
        if (!admin.isActive) {
            return res.status(403).json({ success: false, message: 'Account is disabled' });
        }

        const token = signToken({ id: admin._id }, 'admin');
        return res.json({ success: true, message: 'Logged in', token, admin: publicAdmin(admin) });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/admin/forgot-password
 * Body: { email }
 * Emails a password-reset link to the admin/staff account (valid 30 minutes).
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'email is required' });

        const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });
        if (!admin) return res.status(404).json({ success: false, message: 'No account found with that email' });

        const rawToken = crypto.randomBytes(32).toString('hex');
        admin.passwordResetToken = hashToken(rawToken);
        admin.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_VALIDITY_MS);
        await admin.save();

        const portal = (process.env.ADMIN_PORTAL_URL || 'http://localhost:3001').replace(/\/$/, '');
        const resetUrl = `${portal}/reset-password?token=${rawToken}&email=${encodeURIComponent(admin.email)}`;

        try {
            await sendEmail({
                to: admin.email,
                subject: 'Reset your admin password',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; color: #1f2937;">
                        <h2 style="color: #111827;">Reset your password</h2>
                        <p>Hi ${admin.fullName}, we received a request to reset your Ecomus Admin password. This link is valid for 30 minutes.</p>
                        <p>
                            <a href="${resetUrl}" style="display:inline-block; background:#111827; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">Reset Password</a>
                        </p>
                        <p style="color:#6b7280; font-size: 13px;">If you didn't request this, you can safely ignore this email — your password will stay unchanged.</p>
                    </div>
                `,
                text: `Reset your admin password: ${resetUrl} (valid for 30 minutes)`,
            });
        } catch (mailErr) {
            console.error('Failed to send admin password reset email:', mailErr.message);
            return res.status(502).json({ success: false, message: 'Failed to send the reset email. Please try again later.' });
        }

        return res.json({ success: true, message: 'A password reset link has been sent to your email.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/admin/reset-password
 * Body: { email, token, password }
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

        const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() }).select(
            '+passwordResetToken +passwordResetExpires'
        );
        if (!admin || !admin.passwordResetToken || !admin.passwordResetExpires) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset link. Please request a new one.' });
        }
        if (admin.passwordResetExpires < new Date()) {
            return res.status(400).json({ success: false, message: 'Reset link expired. Please request a new one.' });
        }
        if (hashToken(token) !== admin.passwordResetToken) {
            return res.status(400).json({ success: false, message: 'Invalid reset link.' });
        }
        if (!admin.isActive) {
            return res.status(403).json({ success: false, message: 'Account is disabled' });
        }

        admin.password = password; // pre-save hook re-hashes it
        admin.passwordResetToken = undefined;
        admin.passwordResetExpires = undefined;
        await admin.save();

        const jwtToken = signToken({ id: admin._id }, 'admin');
        return res.json({ success: true, message: 'Password reset successful', token: jwtToken, admin: publicAdmin(admin) });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/admin/create   (protected: super admin or admin with 'staff' page access)
 * Creates an admin or staff account, auto-generates a password, and emails credentials.
 * Body: { fullName, email, role: 'admin'|'staff', permissions: string[] }
 */
exports.createAdminOrStaff = async (req, res) => {
    try {
        const { fullName, email, role = 'staff', permissions = [] } = req.body;
        if (!fullName || !email) {
            return res.status(400).json({ success: false, message: 'fullName and email are required' });
        }
        if (!['admin', 'staff'].includes(role)) {
            return res.status(400).json({ success: false, message: "role must be 'admin' or 'staff'" });
        }

        // Only the super admin may create other admins.
        if (role === 'admin' && !req.admin.isSuperAdmin) {
            return res.status(403).json({ success: false, message: 'Only the super admin can create admin accounts' });
        }

        // Validate the requested page permissions against the known page list.
        const invalid = permissions.filter((p) => !PAGE_KEYS.includes(p));
        if (invalid.length) {
            return res.status(400).json({ success: false, message: `Invalid page keys: ${invalid.join(', ')}` });
        }

        const exists = await Admin.findOne({ email: email.toLowerCase() });
        if (exists) {
            return res.status(409).json({ success: false, message: 'Email already in use' });
        }

        const rawPassword = generatePassword();
        const admin = await Admin.create({
            fullName,
            email,
            password: rawPassword,
            role,
            permissions: [...new Set(permissions)],
            createdBy: req.admin._id,
        });

        // Fire the welcome email with the generated credentials + portal link.
        let emailSent = true;
        let emailError = null;
        try {
            await sendAdminWelcomeEmail({ to: admin.email, fullName, email: admin.email, password: rawPassword, role });
        } catch (mailErr) {
            emailSent = false;
            emailError = mailErr.message;
            console.error('Failed to send admin welcome email:', mailErr.message);
        }

        return res.status(201).json({
            success: true,
            message: emailSent
                ? `${role} created and credentials emailed`
                : `${role} created, but the welcome email could not be sent`,
            emailSent,
            emailError,
            admin: publicAdmin(admin),
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'Email already in use' });
        }
        return res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/admin/me
exports.me = (req, res) => {
    res.json({ success: true, admin: publicAdmin(req.admin) });
};

/**
 * PATCH /api/admin/me
 * Any logged-in admin/staff updates their own name and/or password
 * (email, role, permissions stay locked to the staff-management flow).
 * Body: { fullName?, currentPassword?, newPassword? }
 */
exports.updateMyProfile = async (req, res) => {
    try {
        const { fullName, currentPassword, newPassword } = req.body;
        const admin = await Admin.findById(req.admin._id).select('+password');

        if (newPassword) {
            if (!currentPassword || !(await admin.comparePassword(currentPassword))) {
                return res.status(401).json({ success: false, message: 'Current password is incorrect' });
            }
            if (String(newPassword).length < 6) {
                return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
            }
            admin.password = newPassword;
        }

        if (fullName) admin.fullName = fullName;

        await admin.save();
        res.json({ success: true, message: 'Profile updated', admin: publicAdmin(admin) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/admin  (protected: staff-page access) -> list all admins/staff
exports.listAdmins = async (req, res) => {
    const admins = await Admin.find().sort({ createdAt: -1 });
    res.json({ success: true, admins: admins.map(publicAdmin) });
};

/**
 * PATCH /api/admin/:id/permissions  (protected: staff-page access)
 * Body: { permissions: string[], role?, isActive? }
 * The super admin's role/permissions/active state are locked.
 */
exports.updateAdmin = async (req, res) => {
    try {
        const target = await Admin.findById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: 'Admin not found' });

        if (target.isSuperAdmin) {
            return res.status(403).json({ success: false, message: 'The super admin cannot be modified' });
        }

        const { permissions, role, isActive } = req.body;

        if (permissions) {
            const invalid = permissions.filter((p) => !PAGE_KEYS.includes(p));
            if (invalid.length) {
                return res.status(400).json({ success: false, message: `Invalid page keys: ${invalid.join(', ')}` });
            }
            target.permissions = [...new Set(permissions)];
        }
        if (role && ['admin', 'staff'].includes(role)) {
            if (role === 'admin' && !req.admin.isSuperAdmin) {
                return res.status(403).json({ success: false, message: 'Only the super admin can promote to admin' });
            }
            target.role = role;
        }
        if (typeof isActive === 'boolean') target.isActive = isActive;

        await target.save();
        res.json({ success: true, message: 'Admin updated', admin: publicAdmin(target) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * DELETE /api/admin/:id  (protected: staff-page access)
 * The super admin can never be deleted.
 */
exports.deleteAdmin = async (req, res) => {
    try {
        const target = await Admin.findById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: 'Admin not found' });

        if (target.isSuperAdmin) {
            return res.status(403).json({ success: false, message: 'The super admin cannot be deleted' });
        }
        if (target._id.equals(req.admin._id)) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
        }

        await target.deleteOne();
        res.json({ success: true, message: 'Admin deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
