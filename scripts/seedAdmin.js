require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../modle/User');

const adminEmail = process.env.ADMIN_EMAIL || 'oriviernduwayesu@gmail.com';
const adminPassword = process.env.ADMIN_PASSWORD || '12345678';

async function seedAdmin() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const password = await bcrypt.hash(adminPassword, 10);
    const admin = await User.findOneAndUpdate(
        { email: adminEmail.toLowerCase() },
        {
            name: process.env.ADMIN_NAME || 'Olivier Nduwayesu',
            email: adminEmail.toLowerCase(),
            password,
            role: 'admin',
            isVerified: true,
            otpHash: undefined,
            otpExpiresAt: undefined
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log(`Admin ready: ${admin.email}`);
}

seedAdmin()
    .catch(error => {
        console.error('Admin seed failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });