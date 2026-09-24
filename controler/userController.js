const crypto = require('crypto');
const User = require('../modle/User');
const bcrypt = require('bcryptjs');
const { sendOtpEmail } = require('../config/mailer');
const { createToken } = require('../config/jwt');

async function createUser(req, res) {
    const { name, password } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    if (await User.findOne({ email })) {
        return res.status(400).json({ message: 'User with this email already exists' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const newUser = new User({
        name,
        email,
        password: bcrypt.hashSync(password, 10),
        role: 'user',
        otpHash: crypto.createHash('sha256').update(otp).digest('hex'),
        otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    try {
        await newUser.save();
    } catch (error) {
        console.error('User creation failed:', error.message);
        return res.status(500).json({ message: 'Unable to create user' });
    }

    try {
        await sendOtpEmail(email, otp);
        return res.status(202).json({ message: 'User created. Check your email for the verification code.' });
    } catch (error) {
        await User.deleteOne({ _id: newUser._id });
        console.error('OTP email failed:', error.message);
        return res.status(503).json({ message: 'User created, but the verification email could not be sent' });
    }
}

async function verifyOtp(req, res) {
    const { otp } = req.body;

    if (!otp || !/^\d{6}$/.test(String(otp))) {
        return res.status(400).json({ message: 'A valid 6-digit OTP is required' });
    }

    try {
        const otpHash = crypto.createHash('sha256').update(String(otp)).digest('hex');
        const user = await User.findOne({
            otpHash,
            otpExpiresAt: { $gt: new Date() },
            isVerified: false
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        user.isVerified = true;
        user.otpHash = undefined;
        user.otpExpiresAt = undefined;
        await user.save();

        return res.status(200).json({ message: 'Email verified successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Error verifying OTP' });
    }
}

async function loginUser(req, res) {
    const { password } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!user.isVerified) {
            return res.status(403).json({ message: 'Verify your email before logging in' });
        }
        if (!await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        return res.status(200).json({ message: 'Login successful', token: createToken(user) });
    } catch (error) {
        return res.status(500).json({ message: 'Error logging in' });
    }
}

async function listUsers(req, res) {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 100);
    const sortBy = ['name', 'email', 'role', 'createdAt', 'isVerified'].includes(req.query.sortBy)
        ? req.query.sortBy
        : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const search = req.query.search?.trim();
    const role = ['user', 'employee', 'admin'].includes(req.query.role) ? req.query.role : undefined;
    const filter = {
        ...(role ? { role } : {}),
        ...(search ? { $or: [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }] } : {})
    };

    try {
        const [users, total] = await Promise.all([
            User.find(filter)
                .sort({ [sortBy]: sortOrder })
                .skip((page - 1) * limit)
                .limit(limit),
            User.countDocuments(filter)
        ]);

        return res.status(200).json({
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            sort: { sortBy, sortOrder: sortOrder === 1 ? 'asc' : 'desc' }
        });
    } catch (error) {
        console.error('User list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load users' });
    }
}

async function getMyProfile(req, res) {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({ user });
    } catch (error) {
        console.error('Profile lookup failed:', error.message);
        return res.status(500).json({ message: 'Unable to load profile' });
    }
}

async function updateMyProfile(req, res) {
    const { name, password } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
        return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (email && email !== user.email && await User.findOne({ email })) {
            return res.status(409).json({ message: 'Email is already in use' });
        }

        if (name !== undefined) user.name = name;
        if (email) user.email = email;
        if (password !== undefined) user.password = await bcrypt.hash(password, 10);

        await user.save();
        return res.status(200).json({ message: 'Profile updated successfully', user });
    } catch (error) {
        console.error('Profile update failed:', error.message);
        return res.status(500).json({ message: 'Unable to update profile' });
    }
}

module.exports = {
    createUser,
    verifyOtp,
    loginUser,
    listUsers,
    getMyProfile,
    updateMyProfile
};