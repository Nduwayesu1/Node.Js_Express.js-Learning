const crypto = require('crypto');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const Attendance = require('../modle/Attendance');
const AttendancePhotoHash = require('../modle/AttendancePhotoHash');
const Bank = require('../modle/Bank');
const User = require('../modle/User');

function configureCloudinary() {
    const cloudinaryUrl = process.env.CLOUDINARY_URL;
    if (!cloudinaryUrl) throw new Error('CLOUDINARY_URL is not configured');

    let credentials;
    try {
        credentials = new URL(cloudinaryUrl);
    } catch {
        throw new Error('CLOUDINARY_URL is invalid');
    }
    if (credentials.protocol !== 'cloudinary:' || !credentials.hostname
        || !credentials.username || !credentials.password) {
        throw new Error('CLOUDINARY_URL must contain valid Cloudinary credentials');
    }

    cloudinary.config({
        cloud_name: credentials.hostname,
        api_key: decodeURIComponent(credentials.username),
        api_secret: decodeURIComponent(credentials.password),
        secure: true
    });
}

function uploadAttendancePhoto(photo) {
    return new Promise((resolve, reject) => {
        const publicId = `attendance/${crypto.randomUUID()}`;
        const upload = cloudinary.uploader.upload_stream({
            resource_type: 'image',
            type: 'authenticated',
            public_id: publicId,
            overwrite: false
        }, (error, result) => {
            if (error) return reject(error);
            if (!result?.public_id) return reject(new Error('Cloudinary returned no photo identifier'));
            return resolve(result.public_id);
        });
        Readable.from([photo]).pipe(upload);
    });
}

async function downloadAttendancePhoto(publicId) {
    configureCloudinary();
    const downloadUrl = cloudinary.utils.private_download_url(publicId, 'jpg', {
        resource_type: 'image',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 60
    });
    let response;
    try {
        response = await fetch(downloadUrl, { headers: { Accept: 'image/jpeg' } });
    } catch (cause) {
        throw Object.assign(new Error('Unable to connect to Cloudinary to retrieve the attendance photo'), { status: 502, cause });
    }
    if (!response.ok) {
        throw Object.assign(new Error(`Cloudinary could not retrieve the attendance photo (HTTP ${response.status})`), { status: 502 });
    }
    const photo = Buffer.from(await response.arrayBuffer());
    if (!photo.length || photo.length > 700 * 1024
        || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) {
        throw Object.assign(new Error('Cloudinary returned invalid JPEG data for the attendance photo'), { status: 502 });
    }
    return photo;
}

function deleteCloudinaryPhoto(publicId) {
    return cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true
    });
}

function getEncryptionKey() {
    const key = Buffer.from(process.env.ATTENDANCE_ENCRYPTION_KEY || '', 'base64');
    if (key.length !== 32) throw new Error('ATTENDANCE_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    return key;
}

function getKigaliDay(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Kigali',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function getKigaliMinutes(date) {
    const timeParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Kigali',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const hour = Number(timeParts.find((part) => part.type === 'hour')?.value);
    const minute = Number(timeParts.find((part) => part.type === 'minute')?.value);
    return hour * 60 + minute;
}

function isCheckOutTime(date) {
    return getKigaliMinutes(date) >= 17 * 60;
}

function encryptPhoto(photo) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(photo), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function decryptPhoto(attendance, ciphertext = attendance.photoCiphertext) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), attendance.photoIv);
    decipher.setAuthTag(attendance.photoAuthTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function hashAttendancePhoto(photo) {
    return crypto.createHash('sha256').update(photo).digest('hex');
}

async function claimAttendancePhotoHash(sha256, employeeId) {
    await AttendancePhotoHash.init();
    let photoHash;
    try {
        photoHash = await AttendancePhotoHash.findOneAndUpdate(
            { sha256 },
            { $setOnInsert: { employee: employeeId } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).select('employee').lean();
    } catch (error) {
        if (error.code !== 11000) throw error;
        photoHash = await AttendancePhotoHash.findOne({ sha256 }).select('employee').lean();
        if (!photoHash) throw error;
    }
    return String(photoHash.employee) === String(employeeId);
}

async function removeUploadedPhoto(photoPublicId, attendanceId) {
    if (attendanceId) {
        try {
            await Attendance.deleteOne({ _id: attendanceId });
        } catch (error) {
            console.error('Failed to remove attendance record after photo validation failed:', error.message);
        }
    }
    try {
        await deleteCloudinaryPhoto(photoPublicId);
    } catch (error) {
        console.error('Failed to remove attendance photo after validation failed:', error.message);
    }
}

function parseAttendancePhoto(image) {
    const imageMatch = typeof image === 'string' && image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!imageMatch) return { error: 'Capture a JPEG selfie to record attendance' };
    const photo = Buffer.from(imageMatch[1], 'base64');
    if (!photo.length || photo.length > 700 * 1024 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) {
        return { error: 'The selfie must be a valid JPEG smaller than 700 KB' };
    }
    return { photo };
}

async function checkIn(req, res) {
    if (req.user.role !== 'employee') {
        return res.status(403).json({ message: 'Only bank employees can record attendance' });
    }
    if (req.body.photoConsent !== true) {
        return res.status(400).json({ message: 'Consent to store an attendance selfie is required' });
    }
    const parsedPhoto = parseAttendancePhoto(req.body.photo);
    if (parsedPhoto.error) return res.status(400).json({ message: parsedPhoto.error });
    const { photo } = parsedPhoto;
    const photoHash = hashAttendancePhoto(photo);
    try {
        configureCloudinary();
    } catch (error) {
        console.error('Cloudinary attendance photo storage is not configured:', error.message);
        return res.status(503).json({
            message: 'Configure CLOUDINARY_URL for attendance photo storage'
        });
    }

    try {
        const employee = await User.findById(req.user.id).select('role bankId branchId isVerified isActive');
        if (!employee || employee.role !== 'employee' || !employee.bankId || !employee.branchId
            || !employee.isVerified || employee.isActive === false) {
            return res.status(403).json({ message: 'An active, verified employee assignment is required' });
        }
        const bank = await Bank.findById(employee.bankId).select('branches');
        const branch = bank?.branches.id(employee.branchId);
        if (!branch) return res.status(403).json({ message: 'Your assigned sub-branch could not be verified' });
        const now = new Date();
        let photoPublicId;
        try {
            photoPublicId = await uploadAttendancePhoto(photo);
        } catch (error) {
            console.error('Attendance photo upload to Cloudinary failed:', error.message);
            return res.status(503).json({ message: 'Unable to securely store the attendance photo' });
        }

        let attendance;
        try {
            attendance = await Attendance.create({
                employee: employee._id,
                bankId: employee.bankId,
                branchId: employee.branchId,
                branchName: branch.branchName,
                dayKey: getKigaliDay(now),
                checkInAt: now,
                photoConsentAt: now,
                photoPublicId
            });
        } catch (error) {
            try {
                await deleteCloudinaryPhoto(photoPublicId);
            } catch (cleanupError) {
                console.error('Failed to remove orphaned attendance photo from Cloudinary:', cleanupError.message);
            }
            throw error;
        }
        let photoOwnedByAnotherEmployee;
        try {
            photoOwnedByAnotherEmployee = !await claimAttendancePhotoHash(photoHash, employee._id);
        } catch (error) {
            await removeUploadedPhoto(photoPublicId, attendance._id);
            throw error;
        }
        if (photoOwnedByAnotherEmployee) {
            await removeUploadedPhoto(photoPublicId, attendance._id);
            return res.status(409).json({ message: 'This exact selfie has already been used by another employee account. Capture a new selfie to continue.' });
        }
        return res.status(201).json({
            message: 'Attendance recorded successfully',
            attendance: {
                _id: attendance._id,
                dayKey: attendance.dayKey,
                checkInAt: attendance.checkInAt,
                status: attendance.status
            }
        });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'Attendance has already been recorded for today' });
        console.error('Attendance check-in failed:', error.message);
        return res.status(500).json({ message: 'Unable to record attendance' });
    }
}

async function listMyAttendance(req, res) {
    if (req.user.role !== 'employee') return res.status(403).json({ message: 'Employee access is required' });
    try {
        const attendance = await Attendance.find({ employee: req.user.id })
            .select('dayKey checkInAt checkOutAt status photoConsentAt')
            .sort({ checkInAt: -1 })
            .limit(90)
            .lean();
        return res.status(200).json({ attendance });
    } catch (error) {
        console.error('Employee attendance lookup failed:', error.message);
        return res.status(500).json({ message: 'Unable to load attendance history' });
    }
}

async function checkOut(req, res) {
    if (req.user.role !== 'employee') {
        return res.status(403).json({ message: 'Employee access is required' });
    }
    const now = new Date();
    if (!isCheckOutTime(now)) {
        return res.status(409).json({ message: 'Check-out is available from 5:00 PM Rwanda time (Africa/Kigali)' });
    }
    if (req.body.photoConsent !== true) {
        return res.status(400).json({ message: 'Consent to store a check-out selfie is required' });
    }
    const parsedPhoto = parseAttendancePhoto(req.body.photo);
    if (parsedPhoto.error) return res.status(400).json({ message: parsedPhoto.error });
    const { photo } = parsedPhoto;
    const photoHash = hashAttendancePhoto(photo);

    try {
        try {
            configureCloudinary();
        } catch (error) {
            console.error('Cloudinary attendance photo storage is not configured:', error.message);
            return res.status(503).json({ message: 'Configure CLOUDINARY_URL for attendance photo storage' });
        }
        const dayKey = getKigaliDay(now);
        const attendance = await Attendance.findOne({ employee: req.user.id, dayKey });
        if (!attendance) {
            return res.status(404).json({ message: 'Record your check-in before checking out' });
        }
        if (attendance.checkOutAt) {
            return res.status(409).json({ message: 'Attendance has already been checked out for today' });
        }

        let photoPublicId;
        try {
            photoPublicId = await uploadAttendancePhoto(photo);
        } catch (error) {
            console.error('Attendance check-out photo upload to Cloudinary failed:', error.message);
            return res.status(503).json({ message: 'Unable to securely store the check-out photo' });
        }

        let checkedOut;
        try {
            checkedOut = await Attendance.findOneAndUpdate(
                { _id: attendance._id, checkOutAt: { $exists: false } },
                {
                    $set: {
                        checkOutAt: now,
                        checkOutPhotoConsentAt: now,
                        checkOutPhotoPublicId: photoPublicId
                    }
                },
                { new: true, runValidators: true }
            ).select('dayKey checkInAt checkOutAt status');
        } catch (error) {
            await removeUploadedPhoto(photoPublicId);
            throw error;
        }

        if (!checkedOut) {
            await removeUploadedPhoto(photoPublicId);
            return res.status(409).json({ message: 'Attendance has already been checked out for today' });
        }
        try {
            if (!await claimAttendancePhotoHash(photoHash, attendance.employee)) {
                await Attendance.updateOne(
                    { _id: attendance._id, checkOutPhotoPublicId: photoPublicId },
                    { $unset: { checkOutAt: 1, checkOutPhotoConsentAt: 1, checkOutPhotoPublicId: 1 } }
                );
                await removeUploadedPhoto(photoPublicId);
                return res.status(409).json({ message: 'This exact selfie has already been used by another employee account. Capture a new selfie to continue.' });
            }
        } catch (error) {
            await Attendance.updateOne(
                { _id: attendance._id, checkOutPhotoPublicId: photoPublicId },
                { $unset: { checkOutAt: 1, checkOutPhotoConsentAt: 1, checkOutPhotoPublicId: 1 } }
            );
            await removeUploadedPhoto(photoPublicId);
            throw error;
        }
        return res.status(200).json({ message: 'Attendance checked out successfully', attendance: checkedOut });
    } catch (error) {
        console.error('Employee attendance check-out failed:', error.message);
        return res.status(500).json({ message: 'Unable to record attendance check-out' });
    }
}

async function listBankAttendance(req, res) {
    try {
        const hr = await User.findById(req.user.id).select('bankId staffRole').lean();
        if (!hr?.bankId || hr.staffRole !== 'hr_manager') {
            return res.status(403).json({ message: 'HR Manager access for an assigned bank is required' });
        }
        const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const until = req.query.until ? new Date(req.query.until) : new Date();
        if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since > until) {
            return res.status(400).json({ message: 'Provide a valid attendance date range' });
        }
        const attendance = await Attendance.find({
            bankId: hr.bankId,
            checkInAt: { $gte: since, $lte: until }
        })
            .select('employee bankId branchId branchName dayKey checkInAt checkOutAt status photoConsentAt +checkOutPhotoPublicId')
            .populate('employee', 'name email staffRole')
            .sort({ checkInAt: -1 })
            .limit(500)
            .lean();
        return res.status(200).json({
            attendance: attendance.map(({ checkOutPhotoPublicId, ...record }) => ({
                ...record,
                hasCheckOutPhoto: Boolean(checkOutPhotoPublicId)
            }))
        });
    } catch (error) {
        console.error('HR attendance report failed:', error.message);
        return res.status(500).json({ message: 'Unable to load the bank attendance report' });
    }
}

async function getAttendancePhoto(req, res) {
    if (!mongoose.Types.ObjectId.isValid(req.params.attendanceId)) {
        return res.status(400).json({ message: 'A valid attendance record is required' });
    }
    try {
        const hr = await User.findById(req.user.id).select('bankId staffRole').lean();
        if (!hr?.bankId || hr.staffRole !== 'hr_manager') {
            return res.status(403).json({ message: 'HR Manager access for an assigned bank is required' });
        }
        const photoType = req.query.type || 'check-in';
        if (!['check-in', 'check-out'].includes(photoType)) {
            return res.status(400).json({ message: 'Choose a valid attendance photo type' });
        }
        const attendance = await Attendance.findOne({ _id: req.params.attendanceId, bankId: hr.bankId })
            .select('+photoPublicId +checkOutPhotoPublicId +photoCiphertext +photoIv +photoAuthTag');
        if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
        const photoPublicId = photoType === 'check-out' ? attendance.checkOutPhotoPublicId : attendance.photoPublicId;
        if (!photoPublicId && photoType === 'check-out') {
            return res.status(404).json({ message: 'No check-out photo is available for this attendance record' });
        }
        const photo = photoPublicId
            ? await downloadAttendancePhoto(photoPublicId)
            : decryptPhoto(attendance);
        res.set({
            'Content-Type': 'image/jpeg',
            'Content-Length': photo.length,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        return res.status(200).send(photo);
    } catch (error) {
        console.error('Attendance photo retrieval failed:', error.message);
        return res.status(error.status || 500).json({
            message: error.status === 502 ? error.message : 'Unable to retrieve the attendance photo'
        });
    }
}

module.exports = {
    checkIn,
    checkOut,
    listMyAttendance,
    listBankAttendance,
    getAttendancePhoto,
    encryptPhoto,
    decryptPhoto,
    getKigaliDay,
    getKigaliMinutes,
    isCheckOutTime,
    configureCloudinary,
    uploadAttendancePhoto,
    downloadAttendancePhoto,
    deleteCloudinaryPhoto,
    hashAttendancePhoto,
    claimAttendancePhotoHash,
    parseAttendancePhoto
};
