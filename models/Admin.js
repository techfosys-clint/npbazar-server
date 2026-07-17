const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ALL_ACCESS } = require('../config/permissions');

const adminSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: [true, 'Full name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            select: false,
        },
        role: {
            type: String,
            enum: ['super_admin', 'admin', 'staff'],
            default: 'staff',
        },
        // Page keys this account can access. Super admin holds the '*' wildcard.
        permissions: {
            type: [String],
            default: [],
        },
        isSuperAdmin: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Hash password before saving whenever it is modified.
adminSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

adminSchema.methods.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

// True if this admin can access the given page.
adminSchema.methods.hasAccess = function (pageKey) {
    return this.permissions.includes(ALL_ACCESS) || this.permissions.includes(pageKey);
};

module.exports = mongoose.model('Admin', adminSchema);
