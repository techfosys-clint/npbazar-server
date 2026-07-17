const mongoose = require('mongoose');

// A blog "section" that posts are grouped under, e.g. "News", "Recipes".
const blogSchema = new mongoose.Schema(
    {
        name: { type: String, required: [true, 'Name is required'], trim: true },
        slug: { type: String, required: true, unique: true, lowercase: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Blog', blogSchema);
