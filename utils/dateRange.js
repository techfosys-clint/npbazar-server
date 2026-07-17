/** Resolve a `?days=N` query param into a { since, until, days } range (default 30, max 365). */
const resolveRange = (req) => {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const until = new Date();
    const since = new Date(until.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);
    return { since, until, days };
};

/** Fill in zero-value entries for every day in the range so charts render a continuous line. */
const fillDailySeries = (rows, since, days, valueKeys) => {
    const map = new Map(rows.map((r) => [r._id, r]));
    const result = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        const row = map.get(key);
        const entry = { date: key };
        valueKeys.forEach((k) => {
            entry[k] = row ? row[k] || 0 : 0;
        });
        result.push(entry);
    }
    return result;
};

module.exports = { resolveRange, fillDailySeries };
