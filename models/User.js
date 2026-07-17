const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
        },
        // Accounts can be created with a mobile number (OTP-verified) OR just an
        // email — at least one is required (see pre-validate below).
        mobile: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
        },
        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true,
        },
        address: {
            type: String,
            default: '',
            trim: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            select: false,
        },
        isPhoneVerified: {
            type: Boolean,
            default: false,
        },
        // OTP for phone verification (hashed) + expiry.
        otp: {
            code: { type: String, select: false },
            expiresAt: { type: Date, select: false },
        },
    },
    { timestamps: true }
);

userSchema.pre('validate', function () {
    if (!this.mobile && !this.email) {
        this.invalidate('mobile', 'Either a mobile number or an email is required');
    }
});

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
