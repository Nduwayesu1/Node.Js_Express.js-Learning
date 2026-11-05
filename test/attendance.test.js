const test = require('node:test');
const assert = require('node:assert/strict');
const { decryptPhoto, downloadAttendancePhoto, encryptPhoto, getKigaliDay } = require('../controler/attendanceController');

test('attendance selfies are encrypted and decrypt only with their authentication tag', () => {
    process.env.ATTENDANCE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
    const encrypted = encryptPhoto(photo);

    assert.notDeepEqual(encrypted.ciphertext, photo);
    assert.deepEqual(decryptPhoto({
        photoCiphertext: encrypted.ciphertext,
        photoIv: encrypted.iv,
        photoAuthTag: encrypted.authTag
    }), photo);
    assert.throws(() => decryptPhoto({
        photoCiphertext: encrypted.ciphertext,
        photoIv: encrypted.iv,
        photoAuthTag: Buffer.alloc(16)
    }));
    delete process.env.ATTENDANCE_ENCRYPTION_KEY;
});

test('attendance day keys use Rwanda local time', () => {
    assert.equal(getKigaliDay(new Date('2026-03-10T22:30:00.000Z')), '2026-03-11');
});

test('attendance photo encryption rejects keys that are not 32 bytes', () => {
    process.env.ATTENDANCE_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
    assert.throws(() => encryptPhoto(Buffer.from('photo')), /32-byte key/);
    delete process.env.ATTENDANCE_ENCRYPTION_KEY;
});

test('authenticated Cloudinary attendance photos are fetched as JPEG data', async () => {
    const originalCloudinaryUrl = process.env.CLOUDINARY_URL;
    const originalFetch = global.fetch;
    const expectedPhoto = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
    process.env.CLOUDINARY_URL = 'cloudinary://test-key:test-secret@example-cloud';
    global.fetch = async (url, options) => {
        const downloadUrl = new URL(url);
        assert.match(downloadUrl.pathname, /\/image\/download$/);
        assert.equal(downloadUrl.searchParams.get('type'), 'authenticated');
        assert.equal(options.headers.Accept, 'image/jpeg');
        return new Response(expectedPhoto, { status: 200 });
    };

    try {
        assert.deepEqual(await downloadAttendancePhoto('attendance/test-photo'), expectedPhoto);
    } finally {
        global.fetch = originalFetch;
        if (originalCloudinaryUrl === undefined) delete process.env.CLOUDINARY_URL;
        else process.env.CLOUDINARY_URL = originalCloudinaryUrl;
    }
});
