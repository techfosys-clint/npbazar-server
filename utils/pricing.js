/**
 * Resolve the effective unit price of a product for a given variant selection.
 * Each selected option may carry its own price; when none of the selected
 * options define a price, the product's default price applies. If multiple
 * selected options define prices, the highest one wins.
 *
 * @param {object} product - Product doc (needs price + variants)
 * @param {Map|object} selection - e.g. { Size: 'M', Color: 'Red' }
 * @returns {number}
 */
const getEffectivePrice = (product, selection) => {
    let price = product.price;
    if (!product.variants || !selection) return price;

    const get = (key) => (selection instanceof Map ? selection.get(key) : selection[key]);

    let best = null;
    for (const group of product.variants) {
        const chosen = get(group.name);
        if (!chosen) continue;
        const opt = (group.options || []).find((o) => o.value === chosen);
        if (opt && opt.price != null && opt.price > 0) {
            best = best == null ? opt.price : Math.max(best, opt.price);
        }
    }
    return best != null ? best : price;
};

module.exports = { getEffectivePrice };
