const mongoose = require('mongoose');

// Audit trail of every manual stock movement made from the admin panel.
// (Sales/cancellations already move stock via orders; these are the
// purchase & correction entries.)
const inventoryLogSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        type: {
            type: String,
            enum: ['stock_in', 'adjustment'],
            required: true,
        },
        // Positive for stock added, negative for stock removed (adjustments only).
        quantity: { type: Number, required: true },
        // Per-unit buying cost for stock_in entries.
        unitCost: { type: Number, default: null },
        // Stock level after this entry was applied.
        stockAfter: { type: Number, required: true },
        note: { type: String, default: '' },
        admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    },
    { timestamps: true }
);

inventoryLogSchema.index({ product: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryLog', inventoryLogSchema);
