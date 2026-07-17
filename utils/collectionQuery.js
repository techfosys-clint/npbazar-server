const mongoose = require('mongoose');

/** Turn one smart-collection condition into a Mongo match clause. */
const conditionToClause = (c) => {
    switch (c.field) {
        case 'price': {
            const num = Number(c.value);
            if (c.operator === 'greater_than') return { price: { $gt: num } };
            if (c.operator === 'less_than') return { price: { $lt: num } };
            if (c.operator === 'not_equals') return { price: { $ne: num } };
            return { price: num };
        }
        case 'brand': {
            if (!mongoose.Types.ObjectId.isValid(c.value)) return { _id: null }; // never matches
            const id = new mongoose.Types.ObjectId(c.value);
            return c.operator === 'not_equals' ? { brand: { $ne: id } } : { brand: id };
        }
        case 'tag':
            return c.operator === 'not_equals' ? { tags: { $ne: c.value } } : { tags: c.value };
        default:
            return {};
    }
};

/** Build a Mongo filter for a smart collection's conditions. */
const buildSmartFilter = (conditions, matchType) => {
    if (!conditions || conditions.length === 0) return { _id: null }; // no conditions = no matches
    const clauses = conditions.map(conditionToClause);
    return matchType === 'any' ? { $or: clauses } : { $and: clauses };
};

module.exports = { buildSmartFilter };
