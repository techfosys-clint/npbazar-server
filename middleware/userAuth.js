const { verifyToken } = require('../utils/token');
const User = require('../models/User');

// Verifies a user JWT and attaches the User document to req.user.
const userAuth = async (req, res, next) => {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
        }

        const decoded = verifyToken(token);
        if (decoded.type !== 'user') {
            return res.status(401).json({ success: false, message: 'Invalid token type' });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Not authorized, token invalid' });
    }
};

module.exports = { userAuth };
