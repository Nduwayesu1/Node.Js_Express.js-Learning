const test = require('node:test');
const assert = require('node:assert/strict');
const AttendancePhotoHash = require('../modle/AttendancePhotoHash');
const {
    claimAttendancePhotoHash,
    decryptPhoto,
    downloadAttendancePhoto,
    encryptPhoto,
    getKigaliDay,
    getKigaliMinutes,
    hashAttendancePhoto,
    isCheckOutTime,
    parseAttendancePhoto
} = require('../controler/attendanceController');

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

test('check-out is available from 5:00 PM Rwanda time for the attendance day', () => {
    assert.equal(getKigaliMinutes(new Date('2026-03-10T14:59:00.000Z')), 16 * 60 + 59);
    assert.equal(isCheckOutTime(new Date('2026-03-10T14:59:00.000Z')), false);
    assert.equal(isCheckOutTime(new Date('2026-03-10T15:00:00.000Z')), true);
});

test('attendance photo encryption rejects keys that are not 32 bytes', () => {
    process.env.ATTENDANCE_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
    assert.throws(() => encryptPhoto(Buffer.from('photo')), /32-byte key/);
    delete process.env.ATTENDANCE_ENCRYPTION_KEY;
});

test('attendance photo reuse checks hash exact image bytes and accept only valid JPEG uploads', () => {
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
    assert.equal(hashAttendancePhoto(photo), hashAttendancePhoto(Buffer.from(photo)));
    assert.notEqual(hashAttendancePhoto(photo), hashAttendancePhoto(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x02])));
    assert.deepEqual(parseAttendancePhoto(`data:image/jpeg;base64,${photo.toString('base64')}`).photo, photo);
    assert.equal(parseAttendancePhoto('data:image/png;base64,AAAA').error, 'Capture a JPEG selfie to record attendance');
    assert.equal(AttendancePhotoHash.schema.path('sha256').options.unique, true);
});

test('attendance photo hashes may be reused by the same employee but not another employee', async () => {
    const originalInit = AttendancePhotoHash.init;
    const originalFindOneAndUpdate = AttendancePhotoHash.findOneAndUpdate;
    AttendancePhotoHash.init = async () => {};
    AttendancePhotoHash.findOneAndUpdate = () => ({
        select: () => ({ lean: async () => ({ employee: 'employee-1' }) })
    });

    try {
        assert.equal(await claimAttendancePhotoHash('a'.repeat(64), 'employee-1'), true);
        assert.equal(await claimAttendancePhotoHash('a'.repeat(64), 'employee-2'), false);
    } finally {
        AttendancePhotoHash.init = originalInit;
        AttendancePhotoHash.findOneAndUpdate = originalFindOneAndUpdate;
    }
});

test('attendance photo reuse handles concurrent hash claims without allowing a second account', async () => {
    const originalInit = AttendancePhotoHash.init;
    const originalFindOneAndUpdate = AttendancePhotoHash.findOneAndUpdate;
    const originalFindOne = AttendancePhotoHash.findOne;
    AttendancePhotoHash.init = async () => {};
    AttendancePhotoHash.findOneAndUpdate = () => {
        const duplicateKeyError = new Error('duplicate key');
        duplicateKeyError.code = 11000;
        throw duplicateKeyError;
    };
    AttendancePhotoHash.findOne = () => ({
        select: () => ({ lean: async () => ({ employee: 'employee-1' }) })
    });

    try {
        assert.equal(await claimAttendancePhotoHash('b'.repeat(64), 'employee-2'), false);
    } finally {
        AttendancePhotoHash.init = originalInit;
        AttendancePhotoHash.findOneAndUpdate = originalFindOneAndUpdate;
        AttendancePhotoHash.findOne = originalFindOne;
    }
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
