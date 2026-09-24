const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI?.trim().replace(/^['"]|['"]$/g, '');

        if (!mongoUri || !/^mongodb(?:\+srv)?:\/\//.test(mongoUri)) {
            throw new Error('MONGO_URI must start with mongodb:// or mongodb+srv://. Set the URI value in Render Environment Variables.');
        }

        await mongoose.connect(mongoUri);

        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;