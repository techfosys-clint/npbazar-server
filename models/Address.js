const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        addressLine: { type: String, required: true },
        area: { type: String, default: '' },
        city: { type: String, required: true },
        postalCode: { type: String, default: '' },
        isDefault: { type: Boolean, default: false },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Address', addressSchema);
