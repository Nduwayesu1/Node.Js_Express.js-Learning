const jwt = require('jsonwebtoken');

function createToken(user) {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }

    return jwt.sign(
        {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            bankId: user.bankId?.toString(),
            branchId: user.branchId?.toString()
        },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );
}

module.exports = { createToken };