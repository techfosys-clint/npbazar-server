// Turn a string into a URL-safe slug.
const slugify = (text) =>
    String(text)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

// Append a short random suffix to keep slugs unique.
const uniqueSlug = (text) => `${slugify(text)}-${Math.random().toString(36).slice(2, 7)}`;

module.exports = { slugify, uniqueSlug };
