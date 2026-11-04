const test = require('node:test');
const assert = require('node:assert/strict');
const { requestVirtualPayment } = require('../utils/virtualPaymentClient');

const payment = {
    amount: 12000,
    currency: 'RWF',
    channel: 'mtn_mobile_money',
    idempotency_key: 'd72900ef-0770-4bfc-94e1-844c838dd53a',
    simulate_failure: false
};

function response(body, ok = true, status = 200) {
    return { ok, status, json: async () => body };
}

test('sends authenticated virtual payment request and returns validated simulator receipt', async () => {
    let request;
    const result = await requestVirtualPayment(payment, {
        env: { PAYMENT_SIMULATOR_API_KEY: 'test-secret', PAYMENT_SIMULATOR_URL: 'http://simulator/' },
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({
                status: 'succeeded',
                simulation: true,
                amount: payment.amount,
                channel: payment.channel,
                reference: 'VIRT-123',
                receipt_number: 'RCP-123'
            });
        }
    });

    assert.equal(request.url, 'http://simulator/v1/payments');
    assert.equal(request.options.headers['X-Payment-Service-Key'], 'test-secret');
    assert.equal(JSON.parse(request.options.body).amount, payment.amount);
    assert.equal(result.reference, 'VIRT-123');
});

test('fails explicitly when simulator configuration is missing', async () => {
    await assert.rejects(
        requestVirtualPayment(payment, { env: {}, fetchImpl: async () => { throw new Error('must not fetch'); } }),
        { message: 'Virtual payment simulator is not configured', status: 503 }
    );
});

test('rejects success-shaped invalid simulator responses', async () => {
    await assert.rejects(
        requestVirtualPayment(payment, {
            env: { PAYMENT_SIMULATOR_API_KEY: 'test-secret' },
            fetchImpl: async () => response({ status: 'succeeded', simulation: false })
        }),
        { message: 'Virtual payment service returned an invalid response', status: 502 }
    );
});

test('reports simulator connectivity errors clearly', async () => {
    await assert.rejects(
        requestVirtualPayment(payment, {
            env: { PAYMENT_SIMULATOR_API_KEY: 'test-secret' },
            fetchImpl: async () => { throw new Error('offline'); }
        }),
        { message: 'Virtual payment service is unavailable. Try again later.', status: 503 }
    );
});
