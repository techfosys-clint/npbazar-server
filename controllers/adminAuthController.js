const Admin = require('../models/Admin');
const { signToken } = require('../utils/token');
const { generatePassword } = require('../utils/generatePassword');
const { sendAdminWelcomeEmail } = require('../utils/sendEmail');
const { PAGES, PAGE_KEYS, ALL_ACCESS } = require('../config/permissions');

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
