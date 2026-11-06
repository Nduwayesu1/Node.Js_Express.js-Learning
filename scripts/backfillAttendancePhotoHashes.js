const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Attendance = require('../modle/Attendance');
const {
    claimAttendancePhotoHash,
    decryptPhoto,
    downloadAttendancePhoto,
    hashAttendancePhoto
} = require('../controler/attendanceController');

async function backfillAttendancePhotoHashes() {
    await connectDB();
    let indexedPhotos = 0;
    let crossAccountDuplicates = 0;

    try {
        const cursor = Attendance.find({
            $or: [
                { photoPublicId: { $exists: true } },
                { checkOutPhotoPublicId: { $exists: true } },
                { photoCiphertext: { $exists: true } }
            ]
        })
            .select('+photoPublicId +checkOutPhotoPublicId +photoCiphertext +photoIv +photoAuthTag')
            .cursor();

        for await (const attendance of cursor) {
            const photos = [];
            if (attendance.photoPublicId) {
                photos.push({ type: 'check-in', photo: await downloadAttendancePhoto(attendance.photoPublicId) });
            } else if (attendance.photoCiphertext) {
                photos.push({ type: 'check-in', photo: decryptPhoto(attendance) });
            }
            if (attendance.checkOutPhotoPublicId) {
                photos.push({ type: 'check-out', photo: await downloadAttendancePhoto(attendance.checkOutPhotoPublicId) });
            }

            for (const { type, photo } of photos) {
                const ownedByThisEmployee = await claimAttendancePhotoHash(
                    hashAttendancePhoto(photo),
                    attendance.employee
                );
                if (!ownedByThisEmployee) {
                    crossAccountDuplicates += 1;
                    console.error(`Duplicate ${type} photo found on attendance record ${attendance._id}; it belongs to a different employee account.`);
                } else {
                    indexedPhotos += 1;
                }
            }
        }
    } finally {
        await mongoose.disconnect();
    }

    console.log(`Indexed ${indexedPhotos} attendance photos; found ${crossAccountDuplicates} cross-account duplicate(s).`);
    if (crossAccountDuplicates) process.exitCode = 1;
}

backfillAttendancePhotoHashes().catch(async (error) => {
    console.error('Attendance photo hash backfill failed:', error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
});
