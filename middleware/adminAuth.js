const { verifyToken } = require('../utils/token');
const Admin = require('../models/Admin');

// Verifies an admin JWT and attaches the Admin document to req.admin.
const adminAuth = async (req, res, next) => {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
        }

        const decoded = verifyToken(token);
        if (decoded.type !== 'admin') {
            return res.status(401).json({ success: false, message: 'Invalid token type' });
        }

        const admin = await Admin.findById(decoded.id);
        if (!admin || !admin.isActive) {
            return res.status(401).json({ success: false, message: 'Admin account not found or disabled' });
        }

        req.admin = admin;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Not authorized, token invalid' });
    }
};

// Restrict a route to the super admin only.
const superAdminOnly = (req, res, next) => {
    if (!req.admin?.isSuperAdmin) {
        return res.status(403).json({ success: false, message: 'Super admin access required' });
    }
    next();
};

// Require access to a specific admin-panel page (super admin always passes).
const requirePage = (pageKey) => (req, res, next) => {
    if (!req.admin?.hasAccess(pageKey)) {
        return res.status(403).json({ success: false, message: `Access to "${pageKey}" is not permitted` });
    }
    next();
};

module.exports = { adminAuth, superAdminOnly, requirePage };
