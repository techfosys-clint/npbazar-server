// Normalize BD mobile numbers to local "01XXXXXXXXX" form so "+880...",
// "880..." and "01..." all resolve to the same number.
const normalizeMobile = (raw) => {
    if (!raw) return raw;
    let digits = String(raw).replace(/\D/g, '');
    while (digits.startsWith('880') && digits.length > 11) digits = digits.slice(3);
    if (digits.length === 10 && digits.startsWith('1')) digits = '0' + digits;
    return digits;
};

const isValidMobile = (mobile) => /^01\d{9}$/.test(mobile);

module.exports = { normalizeMobile, isValidMobile };
