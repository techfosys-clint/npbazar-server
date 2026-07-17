const crypto = require('crypto');

// Generate a readable, reasonably strong random password for auto-created accounts.
const generatePassword = (length = 10) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pwd = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        pwd += chars[bytes[i] % chars.length];
    }
    // Ensure at least one special character.
    return pwd + '@' + (crypto.randomInt(10, 99));
};

// 6-digit numeric OTP.
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

module.exports = { generatePassword, generateOtp };
