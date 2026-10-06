const crypto = require('crypto');

const API_BASE_URL = 'https://payments.paypack.rw/api';

function getPaypackEnvironment() {
    const environment = (process.env.PAYPACK_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'production' : 'development')).trim().toLowerCase();
    if (!['development', 'production'].includes(environment)) {
        throw new Error('PAYPACK_ENVIRONMENT must be development or production');
    }
    return environment;
}

function isPaypackConfigured() {
    return Boolean(
        process.env.PAYPACK_CLIENT_ID?.trim()
        && process.env.PAYPACK_CLIENT_SECRET?.trim()
        && process.env.PAYPACK_WEBHOOK_SECRET?.trim()
    );
}

function normalizeRwandaPhoneNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (/^07[2389]\d{7}$/.test(digits)) return digits;
    if (/^2507[2389]\d{7}$/.test(digits)) return `0${digits.slice(3)}`;
    throw new Error('Enter a valid Rwanda mobile number, such as 0781234567.');
}

async function parsePaypackResponse(response) {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(result.message || result.error || `Paypack returned HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
    }
    return result;
}

async function authorizePaypack() {
    if (!isPaypackConfigured()) {
        const error = new Error('Configure PAYPACK_CLIENT_ID, PAYPACK_CLIENT_SECRET, and PAYPACK_WEBHOOK_SECRET to accept deposits.');
        error.status = 503;
        throw error;
    }

    const response = await fetch(`${API_BASE_URL}/auth/agents/authorize`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.PAYPACK_CLIENT_ID.trim(),
            client_secret: process.env.PAYPACK_CLIENT_SECRET.trim()
        })
    });
    const result = await parsePaypackResponse(response);
    if (!result.access) throw new Error('Paypack authorization did not return an access token.');
    return result.access;
}

async function initiatePaypackCashin({ amount, number, idempotencyKey }) {
    const accessToken = await authorizePaypack();
    const response = await fetch(`${API_BASE_URL}/transactions/cashin`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'Idempotency-Key': idempotencyKey,
            'X-Webhook-Mode': getPaypackEnvironment()
        },
        body: JSON.stringify({ amount, number })
    });
    return parsePaypackResponse(response);
}

function verifyPaypackSignature(rawBody, signature) {
    const secret = process.env.PAYPACK_WEBHOOK_SECRET?.trim();
    if (!secret || !Buffer.isBuffer(rawBody) || typeof signature !== 'string') return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    let supplied;
    try {
        supplied = Buffer.from(signature, 'base64');
    } catch {
        return false;
    }
    return supplied.toString('base64') === signature
        && supplied.length === expected.length
        && crypto.timingSafeEqual(supplied, expected);
}

module.exports = {
    getPaypackEnvironment,
    isPaypackConfigured,
    normalizeRwandaPhoneNumber,
    initiatePaypackCashin,
    verifyPaypackSignature
};