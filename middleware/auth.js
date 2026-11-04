const jwt = require('jsonwebtoken');
const User = require('../modle/User');

async function requireAuth(req, res, next) {
    const authorization = req.headers.authorization;
    const token = authorization && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ message: 'Bearer token is required' });
    }

    try {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured');
        }

        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }

    if (['user', 'employee'].includes(req.user.role)) {
        try {
            const user = await User.findById(req.user.id).select('role isActive').lean();
            if (!user || user.isActive === false) {
                return res.status(403).json({ message: 'Your account is deactivated' });
            }
        } catch (error) {
            console.error('Account access check failed:', error.message);
            return res.status(500).json({ message: 'Unable to verify account status' });
        }
    }

    return next();
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access is required' });
    }

    return next();
}

function requireEmployee(req, res, next) {
    if (req.user.role !== 'employee') {
        return res.status(403).json({ message: 'Bank administrator access is required' });
    }

    return next();
}

function requireStaffRole(...allowedRoles) {
    return async (req, res, next) => {
        if (req.user.role !== 'employee') {
            return res.status(403).json({ message: 'Bank staff access is required' });
        }

        try {
            const employee = await User.findById(req.user.id).select('staffRole').lean();
            const staffRole = employee?.staffRole || 'branch_manager';
            if (!allowedRoles.includes(staffRole)) {
                return res.status(403).json({ message: 'Your bank staff role does not have permission for this action' });
            }
            return next();
        } catch (error) {
            console.error('Bank staff role lookup failed:', error.message);
            return res.status(500).json({ message: 'Unable to verify bank staff permissions' });
        }
    };
}

module.exports = { requireAuth, requireAdmin, requireEmployee, requireStaffRole };