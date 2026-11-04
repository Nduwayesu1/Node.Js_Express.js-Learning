const test = require('node:test');
const assert = require('node:assert/strict');
const { decryptPhoto, encryptPhoto, getKigaliDay } = require('../controler/attendanceController');

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
