const test = require('node:test');
const assert = require('node:assert/strict');
const {
    MAX_IDENTITY_DOCUMENT_BYTES,
    parseIdentityDocument
} = require('../utils/identityDocumentStorage');

const fixtures = [
    { mimeType: 'image/jpeg', extension: 'jpg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]) },
    { mimeType: 'image/png', extension: 'png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { mimeType: 'application/pdf', extension: 'pdf', bytes: Buffer.from('%PDF-1.7') }
];

test('accepts supported identity document formats with matching file signatures', () => {
    for (const fixture of fixtures) {
        const parsed = parseIdentityDocument(`data:${fixture.mimeType};base64,${fixture.bytes.toString('base64')}`);
        assert.equal(parsed.mimeType, fixture.mimeType);
        assert.equal(parsed.extension, fixture.extension);
        assert.deepEqual(parsed.document, fixture.bytes);
    }
});

test('rejects unsupported, malformed, and signature-mismatched identity documents', () => {
    assert.match(parseIdentityDocument('data:image/gif;base64,R0lGODlh').error, /valid JPEG, PNG, or PDF/);
    assert.match(parseIdentityDocument('data:image/png;base64,not base64!').error, /valid JPEG, PNG, or PDF/);
    assert.match(parseIdentityDocument('data:image/png;base64,/9j/').error, /contents do not match/);
});

test('rejects identity documents larger than the configured maximum', () => {
    const bytes = Buffer.alloc(MAX_IDENTITY_DOCUMENT_BYTES + 1);
    bytes.set(fixtures[1].bytes);
    const result = parseIdentityDocument(`data:image/png;base64,${bytes.toString('base64')}`);
    assert.match(result.error, /smaller than 1.4 MB/);
});
