const crypto = require('crypto');

const MIDTRANS_BANKS = new Set([
    'permata',
    'bca',
    'mandiri',
    'cimb',
    'bni',
    'bri',
    'danamon',
    'bsi',
    'seabank',
    'saqu'
]);
const SNAP_VERSION = 'v1.0';
const ACCESS_TOKEN_PATH = `/${SNAP_VERSION}/access-token/b2b`;
let accessTokenCache;

function getMidtransConfiguration(env = process.env) {
    const required = [
        'MIDTRANS_CLIENT_KEY',
        'MIDTRANS_PRIVATE_KEY',
        'MIDTRANS_CLIENT_SECRET',
        'MIDTRANS_PARTNER_ID',
        'MIDTRANS_CHANNEL_ID',
        'MIDTRANS_PARTNER_SERVICE_ID',
        'MIDTRANS_MERCHANT_ID'
    ];
    const missing = required.filter((name) => !env[name]?.trim());
    if (missing.length) {
        throw Object.assign(new Error(`Configure ${missing.join(', ')} to enable Midtrans virtual-account payments.`), { status: 503 });
    }

    const channelId = env.MIDTRANS_CHANNEL_ID.trim();
    const partnerServiceId = env.MIDTRANS_PARTNER_SERVICE_ID.trim();
    if (!/^\d{5}$/.test(channelId)) {
        throw Object.assign(new Error('MIDTRANS_CHANNEL_ID must be a five-digit numeric string.'), { status: 503 });
    }
    if (!/^[\da-zA-Z]{1,8}$/.test(partnerServiceId)) {
        throw Object.assign(new Error('MIDTRANS_PARTNER_SERVICE_ID must be 1 to 8 alphanumeric characters.'), { status: 503 });
    }

    let baseUrl;
    try {
        baseUrl = new URL(env.MIDTRANS_BASE_URL || 'https://api.sandbox.midtrans.com');
    } catch (cause) {
        throw Object.assign(new Error('MIDTRANS_BASE_URL must be a valid HTTPS URL.'), { status: 503, cause });
    }
    if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
        throw Object.assign(new Error('MIDTRANS_BASE_URL must be an HTTPS origin without credentials, query, or fragment.'), { status: 503 });
    }
    const basePath = baseUrl.pathname.replace(/\/+$/, '');
    if (basePath && basePath !== '/') {
        throw Object.assign(new Error('MIDTRANS_BASE_URL must not include an API path.'), { status: 503 });
    }

    const privateKey = env.MIDTRANS_PRIVATE_KEY.replace(/\\n/g, '\n').trim();
    const clientSecret = env.MIDTRANS_CLIENT_SECRET.trim();
    const merchantId = env.MIDTRANS_MERCHANT_ID.trim();
    const partnerId = env.MIDTRANS_PARTNER_ID.trim();
    if (merchantId.length > 10 || partnerId.length > 10) {
        throw Object.assign(new Error('MIDTRANS_MERCHANT_ID and MIDTRANS_PARTNER_ID must not exceed 10 characters.'), { status: 503 });
    }

    const exchangeRate = Number(env.MIDTRANS_RWF_PER_IDR);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw Object.assign(new Error('Set MIDTRANS_RWF_PER_IDR to the configured RWF value for one IDR before enabling Midtrans repayments.'), { status: 503 });
    }

    try {
        crypto.createPrivateKey(privateKey);
    } catch (cause) {
        throw Object.assign(new Error('MIDTRANS_PRIVATE_KEY is not a valid PEM private key.'), { status: 503, cause });
    }

    return {
        baseUrl: baseUrl.origin,
        clientKey: env.MIDTRANS_CLIENT_KEY.trim(),
        privateKey,
        clientSecret,
        partnerId,
        channelId,
        partnerServiceId: partnerServiceId.padStart(8, ' '),
        merchantId,
        exchangeRate
    };
}

function getMidtransIdrAmount(amountRwf, exchangeRate) {
    if (!Number.isSafeInteger(amountRwf) || amountRwf <= 0) {
        throw new Error('Repayment must be a positive whole-number RWF amount.');
    }
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw new Error('A positive configured RWF-per-IDR exchange rate is required.');
    }
    const amountIdr = Math.ceil(amountRwf / exchangeRate);
    if (!Number.isSafeInteger(amountIdr) || amountIdr <= 0) {
        throw new Error('The repayment cannot be represented as a valid IDR amount.');
    }
    return amountIdr;
}

function createAccessTokenSignature(clientKey, timestamp, privateKey) {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${clientKey}|${timestamp}`);
    signer.end();
    return signer.sign(privateKey, 'base64');
}

function createRequestSignature(method, path, accessToken, timestamp, body, clientSecret) {
    const payloadHash = crypto.createHash('sha256')
        .update(JSON.stringify(body))
        .digest('hex')
        .toLowerCase();
    const stringToSign = `${method}:${path}:${accessToken}:${payloadHash}:${timestamp}`;
    return crypto.createHmac('sha512', clientSecret).update(stringToSign).digest('base64');
}

async function readJsonResponse(response, operation) {
    let result;
    try {
        result = await response.json();
    } catch (cause) {
        throw Object.assign(new Error(`Midtrans returned an invalid ${operation} response.`), { status: 502, uncertain: true, cause });
    }
    if (!response.ok) {
        throw Object.assign(new Error(`Midtrans rejected the ${operation} request (HTTP ${response.status}).`), {
            status: response.status >= 500 ? 503 : 502,
            uncertain: response.status >= 500
        });
    }
    return result;
}

async function requestAccessToken(config, fetchImpl) {
    if (accessTokenCache?.baseUrl === config.baseUrl
        && accessTokenCache.clientKey === config.clientKey
        && accessTokenCache.expiresAt > Date.now() + 30_000) {
        return accessTokenCache.value;
    }

    const timestamp = new Date().toISOString();
    let response;
    try {
        response = await fetchImpl(`${config.baseUrl}${ACCESS_TOKEN_PATH}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CLIENT-KEY': config.clientKey,
                'X-TIMESTAMP': timestamp,
                'X-SIGNATURE': createAccessTokenSignature(config.clientKey, timestamp, config.privateKey)
            },
            body: JSON.stringify({ grantType: 'client_credentials' }),
            signal: AbortSignal.timeout(8000)
        });
    } catch (cause) {
        throw Object.assign(new Error('Unable to connect to Midtrans to authorize the payment.'), { status: 503, cause });
    }
    const result = await readJsonResponse(response, 'access-token');
    if (typeof result.accessToken !== 'string' || !result.accessToken || !Number.isFinite(Number(result.expiresIn))) {
        throw Object.assign(new Error('Midtrans returned an invalid access token response.'), { status: 502 });
    }

    accessTokenCache = {
        baseUrl: config.baseUrl,
        clientKey: config.clientKey,
        value: result.accessToken,
        expiresAt: Date.now() + Math.max(0, Number(result.expiresIn)) * 1000
    };
    return result.accessToken;
}

async function requestSnap(config, path, body, externalId, fetchImpl) {
    const accessToken = await requestAccessToken(config, fetchImpl);
    const timestamp = new Date().toISOString();
    let response;
    try {
        response = await fetchImpl(`${config.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'X-TIMESTAMP': timestamp,
                'X-SIGNATURE': createRequestSignature('POST', path, accessToken, timestamp, body, config.clientSecret),
                'X-PARTNER-ID': config.partnerId,
                'CHANNEL-ID': config.channelId,
                'X-EXTERNAL-ID': externalId
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000)
        });
    } catch (cause) {
        throw Object.assign(new Error('The Midtrans request outcome is unknown. Retry using the same payment request.'), { status: 503, uncertain: true, cause });
    }
    return readJsonResponse(response, 'virtual-account');
}

function buildVirtualAccountRequest({ config, reference, customerNo, customerName, customerEmail, amountIdr, bank, expiresAt }) {
    if (!MIDTRANS_BANKS.has(bank)) throw new Error('Choose a supported Indonesian virtual-account bank.');
    const body = {
        partnerServiceId: config.partnerServiceId,
        customerNo,
        virtualAccountNo: `${config.partnerServiceId}${customerNo}`,
        virtualAccountName: customerName.slice(0, 255),
        trxId: reference,
        totalAmount: { value: amountIdr.toFixed(2), currency: 'IDR' },
        expiredDate: expiresAt.toISOString(),
        additionalInfo: {
            merchantId: config.merchantId,
            bank,
            flags: { shouldRandomizeVaNumber: false },
            ...(customerEmail ? { customerDetails: { email: customerEmail.slice(0, 255) } } : {}),
            ...(bank === 'mandiri' ? {
                mandiri: {
                    billInfo1: 'Loan payment',
                    billInfo2: reference.slice(0, 30)
                }
            } : {})
        }
    };
    return body;
}

async function createVirtualAccount(payment, options = {}) {
    const config = getMidtransConfiguration(options.env || process.env);
    const fetchImpl = options.fetchImpl || fetch;
    const body = buildVirtualAccountRequest({ ...payment, config });
    const result = await requestSnap(
        config,
        `/${SNAP_VERSION}/transfer-va/create-va`,
        body,
        payment.reference,
        fetchImpl
    );
    if (result.responseCode !== '2002700') {
        const status = result.responseCode === '4092700' ? 409 : 502;
        throw Object.assign(new Error('Midtrans did not create the virtual account.'), { status, uncertain: status >= 500 });
    }
    const data = result.virtualAccountData;
    if (!data || data.trxId !== payment.reference
        || typeof data.virtualAccountNo !== 'string'
        || typeof data.partnerServiceId !== 'string'
        || typeof data.customerNo !== 'string'
        || data.totalAmount?.currency !== 'IDR'
        || Number(data.totalAmount?.value) !== payment.amountIdr) {
        throw Object.assign(new Error('Midtrans returned virtual-account details that do not match the payment request.'), { status: 502, uncertain: true });
    }
    return {
        partnerServiceId: data.partnerServiceId,
        customerNo: data.customerNo,
        virtualAccountNo: data.virtualAccountNo,
        virtualAccountName: data.virtualAccountName,
        bank: payment.bank,
        totalAmount: data.totalAmount,
        expiredAt: data.expiredDate || payment.expiresAt.toISOString()
    };
}

async function inquireVirtualAccount(payment, options = {}) {
    const config = getMidtransConfiguration(options.env || process.env);
    const fetchImpl = options.fetchImpl || fetch;
    const body = {
        inquiryRequestId: payment.reference,
        partnerServiceId: payment.partnerServiceId,
        customerNo: payment.customerNo,
        virtualAccountNo: payment.virtualAccountNo,
        additionalInfo: { merchantId: config.merchantId }
    };
    const result = await requestSnap(
        config,
        `/${SNAP_VERSION}/transfer-va/status`,
        body,
        crypto.randomUUID(),
        fetchImpl
    );
    if (result.responseCode !== '2002600') {
        throw Object.assign(new Error('Midtrans could not verify the virtual-account payment.'), { status: 502, uncertain: true });
    }
    const data = result.virtualAccountData;
    if (!data || data.inquiryRequestId !== payment.reference) {
        throw Object.assign(new Error('Midtrans returned a status for a different payment.'), { status: 502, uncertain: true });
    }
    if (data.paymentFlagStatus === '00') {
        if (data.totalAmount?.currency !== 'IDR' || Number(data.totalAmount?.value) !== payment.amountIdr) {
            throw Object.assign(new Error('The confirmed Midtrans amount does not match the requested IDR payment.'), { status: 409 });
        }
        return { status: 'succeeded', paidAt: data.transactionDate || new Date().toISOString(), paymentRequestId: data.paymentRequestId };
    }
    if (data.paymentFlagStatus === '08') return { status: 'expired' };
    if (data.paymentFlagStatus === '05') return { status: 'failed' };
    if (data.paymentFlagStatus === '03') return { status: 'pending' };
    throw Object.assign(new Error('Midtrans returned an unsupported virtual-account payment status.'), { status: 502, uncertain: true });
}

module.exports = {
    MIDTRANS_BANKS,
    getMidtransConfiguration,
    getMidtransIdrAmount,
    createAccessTokenSignature,
    createRequestSignature,
    buildVirtualAccountRequest,
    createVirtualAccount,
    inquireVirtualAccount
};
