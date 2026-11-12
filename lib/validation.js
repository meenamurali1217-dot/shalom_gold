/**
 * SHALOM GOLD - Input Validation & Sanitization Helpers
 */

/**
 * Validate and format Indian mobile number
 * @param {string|number} raw 
 * @returns {{ valid: boolean, formatted?: string, national?: string, error?: string }}
 */
function validateIndianMobile(raw) {
    if (!raw) return { valid: false, error: 'Mobile number is required' };
    const cleaned = raw.toString().replace(/[\s\-\(\)\+]/g, '');
    let digits = cleaned;
    if (digits.startsWith('91') && digits.length === 12) {
        digits = digits.substring(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
        digits = digits.substring(1);
    }
    if (!/^[6-9]\d{9}$/.test(digits)) {
        return { valid: false, error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9' };
    }
    return { valid: true, formatted: '+91' + digits, national: digits };
}

/**
 * Validate customer full name
 * @param {string} raw 
 * @returns {{ valid: boolean, name?: string, error?: string }}
 */
function validateFullName(raw) {
    if (!raw || typeof raw !== 'string' || raw.trim().length < 2) {
        return { valid: false, error: 'Please enter your full name (minimum 2 characters).' };
    }
    const clean = raw.trim().replace(/\s+/g, ' ');
    if (!/^[a-zA-Z\s\.\'\-]+$/.test(clean)) {
        return { valid: false, error: 'Full name should only contain letters and standard characters.' };
    }
    return { valid: true, name: clean };
}

// In-memory rate limiting map for quick serverless debounce
const rateLimitMap = new Map();
function isRateLimited(key, maxRequests = 10, windowMinutes = 5) {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const timestamps = (rateLimitMap.get(key) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
        return true;
    }
    timestamps.push(now);
    rateLimitMap.set(key, timestamps);
    return false;
}

module.exports = {
    validateIndianMobile,
    validateFullName,
    isRateLimited
};
