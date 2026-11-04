const crypto = require('crypto');
const mongoose = require('mongoose');
const Attendance = require('../modle/Attendance');
const Bank = require('../modle/Bank');
const User = require('../modle/User');

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

function encryptPhoto(photo) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(photo), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function decryptPhoto(attendance) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), attendance.photoIv);
    decipher.setAuthTag(attendance.photoAuthTag);
    return Buffer.concat([decipher.update(attendance.photoCiphertext), decipher.final()]);
}

async function checkIn(req, res) {
    if (req.user.role !== 'employee') {
        return res.status(403).json({ message: 'Only bank employees can record attendance' });
    }
    if (req.body.photoConsent !== true) {
        return res.status(400).json({ message: 'Consent to store an encrypted attendance selfie is required' });
    }
    const image = req.body.photo;
    const imageMatch = typeof image === 'string' && image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!imageMatch) return res.status(400).json({ message: 'Capture a JPEG selfie to record attendance' });

    const photo = Buffer.from(imageMatch[1], 'base64');
    if (!photo.length || photo.length > 700 * 1024 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) {
        return res.status(400).json({ message: 'The selfie must be a valid JPEG smaller than 700 KB' });
    }
    let encryptedPhoto;
    try {
        encryptedPhoto = encryptPhoto(photo);
    } catch (error) {
        console.error('Attendance photo encryption is unavailable:', error.message);
        return res.status(503).json({ message: 'Secure attendance photo storage is not configured' });
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
        const attendance = await Attendance.create({
            employee: employee._id,
            bankId: employee.bankId,
            branchId: employee.branchId,
            branchName: branch.branchName,
            dayKey: getKigaliDay(now),
            checkInAt: now,
            photoConsentAt: now,
            photoCiphertext: encryptedPhoto.ciphertext,
            photoIv: encryptedPhoto.iv,
            photoAuthTag: encryptedPhoto.authTag
        });
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
            .select('dayKey checkInAt status photoConsentAt')
            .sort({ checkInAt: -1 })
            .limit(90)
            .lean();
        return res.status(200).json({ attendance });
    } catch (error) {
        console.error('Employee attendance lookup failed:', error.message);
        return res.status(500).json({ message: 'Unable to load attendance history' });
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
            .select('employee bankId branchId branchName dayKey checkInAt status photoConsentAt')
            .populate('employee', 'name email staffRole')
            .sort({ checkInAt: -1 })
            .limit(500)
            .lean();
        return res.status(200).json({ attendance });
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
        const attendance = await Attendance.findOne({ _id: req.params.attendanceId, bankId: hr.bankId })
            .select('+photoCiphertext +photoIv +photoAuthTag');
        if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
        const photo = decryptPhoto(attendance);
        res.set({
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        return res.status(200).send(photo);
    } catch (error) {
        console.error('Attendance photo retrieval failed:', error.message);
        return res.status(500).json({ message: 'Unable to retrieve the attendance photo' });
    }
}

module.exports = { checkIn, listMyAttendance, listBankAttendance, getAttendancePhoto, encryptPhoto, decryptPhoto, getKigaliDay };
