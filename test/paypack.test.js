const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { normalizeRwandaPhoneNumber, verifyPaypackSignature } = require('../config/paypack');

test('normalizes local and international Rwanda mobile numbers', () => {
    assert.equal(normalizeRwandaPhoneNumber('078 123 4567'), '0781234567');
    assert.equal(normalizeRwandaPhoneNumber('+250 781 234 567'), '0781234567');
    assert.throws(() => normalizeRwandaPhoneNumber('0712345678'), /valid Rwanda mobile number/);
});

test('verifies Paypack webhook HMAC signatures against the raw request body', () => {
    const previousSecret = process.env.PAYPACK_WEBHOOK_SECRET;
    const rawBody = Buffer.from('{"kind":"transaction:processed"}');
    process.env.PAYPACK_WEBHOOK_SECRET = 'test-webhook-secret';
    const signature = crypto.createHmac('sha256', process.env.PAYPACK_WEBHOOK_SECRET).update(rawBody).digest('base64');
    try {
        assert.equal(verifyPaypackSignature(rawBody, signature), true);
        assert.equal(verifyPaypackSignature(rawBody, `${signature}x`), false);
        assert.equal(verifyPaypackSignature(Buffer.from('{}'), signature), false);
    } finally {
        if (previousSecret === undefined) delete process.env.PAYPACK_WEBHOOK_SECRET;
        else process.env.PAYPACK_WEBHOOK_SECRET = previousSecret;
    }
});