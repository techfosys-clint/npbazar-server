const mongoose = require('mongoose');

// A single smart-collection rule, e.g. { field: 'price', operator: 'less_than', value: '500' }.
const conditionSchema = new mongoose.Schema(
    {
        field: {
            type: String,
            enum: ['price', 'brand', 'tag'],
            required: true,
        },
        operator: {
            type: String,
            enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains'],
            required: true,
        },
        value: { type: String, required: true },
    },
    { _id: false }
);

// Collections double as the store's product categories/taxonomy: this single
// model covers both plain hierarchical categories (via `parent` + `order`,
// manual type, no conditions) and curated/smart collections (with conditions).
const collectionSchema = new mongoose.Schema(
    {
        name: { type: String, required: [true, 'Name is required'], trim: true },
        slug: { type: String, required: true, unique: true, lowercase: true },
        description: { type: String, default: '' },
        image: { type: String, default: '' },

        // Optional parent for category-style hierarchy (sub-collections).
        parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', default: null },
        order: { type: Number, default: 0 }, // sort order among siblings

        // manual: products are added explicitly (via Product.collections).
        // smart: products are computed on the fly from `conditions`.
        type: { type: String, enum: ['manual', 'smart'], default: 'manual' },
        matchType: { type: String, enum: ['all', 'any'], default: 'all' }, // AND / OR across conditions
        conditions: { type: [conditionSchema], default: [] },

        seoTitle: { type: String, default: '', trim: true },
        seoDescription: { type: String, default: '', trim: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Collection', collectionSchema);
