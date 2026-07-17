const Product = require('../models/Product');

// Build a SKU prefix from the product name, e.g. "Men's T-Shirt" -> "MEN".
const skuPrefix = (name) => {
    const letters = String(name || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    return (letters.slice(0, 3) || 'PRD').padEnd(3, 'X');
};

// Generate a SKU that isn't already used by another product, e.g. "MEN-7F3K9".
const generateSku = async (name) => {
    const prefix = skuPrefix(name);
    let sku;
    let taken = true;
    while (taken) {
        sku = `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        taken = await Product.exists({ sku });
    }
    return sku;
};

module.exports = { generateSku };
