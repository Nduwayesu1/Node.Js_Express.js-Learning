async function requestVirtualPayment(payment, {
    fetchImpl = fetch,
    env = process.env
} = {}) {
    const serviceUrl = env.PAYMENT_SIMULATOR_URL || 'http://127.0.0.1:8000';
    const serviceKey = env.PAYMENT_SIMULATOR_API_KEY;
    if (!serviceKey) {
        throw Object.assign(new Error('Virtual payment simulator is not configured'), { status: 503 });
    }

    let response;
    try {
        response = await fetchImpl(`${serviceUrl.replace(/\/$/, '')}/v1/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Payment-Service-Key': serviceKey
            },
            body: JSON.stringify(payment),
            signal: AbortSignal.timeout(5000)
        });
    } catch (error) {
        console.error('Virtual payment simulator request failed:', error.message);
        throw Object.assign(new Error('Virtual payment service is unavailable. Try again later.'), { status: 503 });
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof result.detail === 'string' ? result.detail : 'Virtual payment service rejected the request';
        throw Object.assign(new Error(message), { status: response.status >= 500 ? 503 : 502 });
    }
    if (!['succeeded', 'failed'].includes(result.status)
        || result.simulation !== true
        || result.amount !== payment.amount
        || result.channel !== payment.channel
        || typeof result.reference !== 'string'
        || typeof result.receipt_number !== 'string') {
        throw Object.assign(new Error('Virtual payment service returned an invalid response'), { status: 502 });
    }

    return result;
}

module.exports = { requestVirtualPayment };
