const mongoose = require('mongoose');

const MAX_IMAGES = 3;

// A single option inside a variant group, e.g. { value: 'M', price: 850, images: ['...'] }.
// `price` is optional — when absent (or 0) the product's default price applies.
// `images` is optional — a single image specific to this option.
const variantOptionSchema = new mongoose.Schema(
    {
        value: { type: String, required: true, trim: true },
        price: { type: Number, default: null, min: 0 },
        images: {
            type: [String],
            default: [],
            validate: [(arr) => arr.length <= 1, 'A variant option can have at most 1 image'],
        },
    },
    { _id: false }
);

// A selectable option group, e.g. { name: 'Size', options: [{value:'S'},{value:'M',price:850}] }.
const variantSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        options: { type: [variantOptionSchema], default: [] },
    },
    { _id: false }
);

const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true, lowercase: true },
        description: { type: String, default: '' },
        shortDescription: { type: String, default: '' },

        price: { type: Number, required: true, min: 0 },
        // Original price for showing a discount (optional).
        comparePrice: { type: Number, default: 0, min: 0 },
        // Purchase (buying) cost per unit — admin-only, used for profit reporting.
        // Maintained as a weighted average when stock is purchased at different costs.
        costPrice: { type: Number, default: 0, min: 0 },

        sku: { type: String, default: '', trim: true },
        // null = unlimited stock (never runs out, not tracked/decremented).
        stock: { type: Number, default: null, min: 0 },

        thumbnail: { type: String, default: '' },
        images: {
            type: [String],
            default: [],
            validate: [(arr) => arr.length <= MAX_IMAGES, `A product can have at most ${MAX_IMAGES} images`],
        },

        brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
        tags: { type: [String], default: [] },
        variants: { type: [variantSchema], default: [] },

        // Collections double as categories: a product can belong to several at
        // once, and a collection can have a `parent` for category-style
        // hierarchy. At least one is required (this is how the product is
        // organized/browsed on the storefront).
        collections: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],
            validate: [(arr) => arr.length > 0, 'At least one collection is required'],
        },

        // Search engine listing (defaults to name/shortDescription when empty).
        seoTitle: { type: String, default: '', trim: true },
        seoDescription: { type: String, default: '', trim: true },

        // Denormalized review aggregates for fast listing.
        rating: { type: Number, default: 0 },
        numReviews: { type: Number, default: 0 },
        sold: { type: Number, default: 0 },

        isFeatured: { type: Boolean, default: false },
        // Manually marked as a best seller — storefront shows it in the Best Selling section.
        isBestSelling: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

// Text index for search on name/description/tags.
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Product', productSchema);
