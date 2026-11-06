const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

const MAX_IDENTITY_DOCUMENT_BYTES = 1.4 * 1024 * 1024;
const DOCUMENT_FORMATS = {
    'image/jpeg': { extension: 'jpg', signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    'image/png': { extension: 'png', signature: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    'application/pdf': { extension: 'pdf', signature: (buffer) => buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-' }
};

function parseIdentityDocument(dataUrl) {
    if (typeof dataUrl !== 'string') {
        return { error: 'Upload a JPEG, PNG, or PDF image of your National ID or passport.' };
    }

    const match = dataUrl.match(/^data:(image\/jpeg|image\/png|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) return { error: 'Upload a valid JPEG, PNG, or PDF file.' };

    const [, mimeType, encoded] = match;
    const document = Buffer.from(encoded, 'base64');
    if (!document.length || document.length > MAX_IDENTITY_DOCUMENT_BYTES) {
        return { error: 'The ID document must be smaller than 1.4 MB.' };
    }
    if (document.toString('base64') !== encoded) return { error: 'The uploaded ID document is invalid.' };
    if (!DOCUMENT_FORMATS[mimeType].signature(document)) {
        return { error: 'The file contents do not match the selected JPEG, PNG, or PDF format.' };
    }

    return { document, mimeType, extension: DOCUMENT_FORMATS[mimeType].extension };
}

function configureCloudinary() {
    const cloudinaryUrl = process.env.CLOUDINARY_URL;
    if (!cloudinaryUrl) throw Object.assign(new Error('CLOUDINARY_URL is not configured'), { status: 503 });

    let credentials;
    try {
        credentials = new URL(cloudinaryUrl);
    } catch (cause) {
        throw Object.assign(new Error('CLOUDINARY_URL is invalid'), { status: 503, cause });
    }
    if (credentials.protocol !== 'cloudinary:' || !credentials.hostname || !credentials.username || !credentials.password) {
        throw Object.assign(new Error('CLOUDINARY_URL must contain valid Cloudinary credentials'), { status: 503 });
    }

    cloudinary.config({
        cloud_name: credentials.hostname,
        api_key: decodeURIComponent(credentials.username),
        api_secret: decodeURIComponent(credentials.password),
        secure: true
    });
}

async function uploadIdentityDocument(document, extension) {
    configureCloudinary();
    return new Promise((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream({
            resource_type: 'raw',
            type: 'authenticated',
            public_id: `identity-documents/${crypto.randomUUID()}.${extension}`,
            overwrite: false
        }, (error, result) => {
            if (error) return reject(error);
            if (!result?.public_id) return reject(new Error('Cloudinary returned no identity document identifier'));
            return resolve(result.public_id);
        });
        Readable.from([document]).pipe(upload);
    });
}

async function downloadIdentityDocument(publicId, extension) {
    configureCloudinary();
    const downloadUrl = cloudinary.utils.private_download_url(publicId, extension, {
        resource_type: 'raw',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 60
    });
    let response;
    try {
        response = await fetch(downloadUrl);
    } catch (cause) {
        throw Object.assign(new Error('Unable to connect to Cloudinary to retrieve the identity document'), { status: 502, cause });
    }
    if (!response.ok) {
        throw Object.assign(new Error(`Cloudinary could not retrieve the identity document (HTTP ${response.status})`), { status: 502 });
    }
    const document = Buffer.from(await response.arrayBuffer());
    if (!document.length || document.length > MAX_IDENTITY_DOCUMENT_BYTES) {
        throw Object.assign(new Error('Cloudinary returned an invalid identity document size'), { status: 502 });
    }
    return document;
}

function deleteIdentityDocument(publicId) {
    return cloudinary.uploader.destroy(publicId, {
        resource_type: 'raw',
        type: 'authenticated',
        invalidate: true
    });
}

module.exports = {
    MAX_IDENTITY_DOCUMENT_BYTES,
    parseIdentityDocument,
    configureCloudinary,
    uploadIdentityDocument,
    downloadIdentityDocument,
    deleteIdentityDocument
};
