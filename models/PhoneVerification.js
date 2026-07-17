const mongoose = require('mongoose');

// Lightweight, account-independent OTP verification used at checkout — for
// guests (no User yet) and for logged-in customers entering a different
// number than their account's own. Deliberately NOT reusing the User/otp
// flow: that requires an existing User document (password is required on
// that schema) and auto-logs the user in on verify, neither of which is
// correct here.
const phoneVerificationSchema = new mongoose.Schema(
    {
        mobile: { type: String, required: true, unique: true }, // normalized 01XXXXXXXXX
        codeHash: { type: String, select: false },
        expiresAt: { type: Date },
        verified: { type: Boolean, default: false },
        // Proof handed to the client on successful verify, and required by
        // order creation to prove this phone was actually verified.
        verifiedToken: { type: String },
        verifiedAt: { type: Date },
        attempts: { type: Number, default: 0 },
        lastSentAt: { type: Date },
    },
    { timestamps: true }
);

module.exports = mongoose.model('PhoneVerification', phoneVerificationSchema);
