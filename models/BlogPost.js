const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema(
    {
        title: { type: String, required: [true, 'Title is required'], trim: true },
        slug: { type: String, required: true, unique: true, lowercase: true },
        content: { type: String, default: '' }, // rich text HTML
        excerpt: { type: String, default: '' }, // rich text HTML summary shown on listing pages
        image: { type: String, default: '' },

        blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
        author: { type: String, default: '', trim: true },
        tags: { type: [String], default: [] },

        seoTitle: { type: String, default: '', trim: true },
        seoDescription: { type: String, default: '', trim: true },

        visibility: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
        publishedAt: { type: Date, default: Date.now },
        createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    },
    { timestamps: true }
);

blogPostSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model('BlogPost', blogPostSchema);
