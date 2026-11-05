const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../modle/User');
const Bank = require('../modle/Bank');
const bcrypt = require('bcryptjs');
const { sendOtpEmail, sendPasswordResetEmail } = require('../config/mailer');
const { createToken } = require('../config/jwt');

function readRegistrationInput(body = {}) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const { password } = body;

    if (!name || !email || !password) return { error: 'Name, email, and password are required' };
    if (typeof password !== 'string' || password.length < 8) {
        return { error: 'Password must be at least 8 characters long' };
    }

    return { name, email, password };
}

async function createPendingUser({ name, email, password, bankId, branchId, role, staffRole, accountLabel }) {
    const otp = crypto.randomInt(100000, 1000000).toString();
    let user;

    try {
        const bank = await Bank.findById(bankId).select(branchId ? 'branches._id' : '_id');
        if (!bank) return { status: 404, message: 'Selected bank was not found' };
        if (branchId && !bank.branches.id(branchId)) {
            return { status: 400, message: 'The selected sub-branch does not belong to this bank' };
        }

        const existingUser = await User.findOne({ email });
        if (existingUser?.isVerified) {
            return { status: 400, message: 'User with this email already exists' };
        }
        if (existingUser && (existingUser.role !== role
            || String(existingUser.customerBankId || existingUser.bankId || '') !== String(bank._id)
            || (branchId && String(existingUser.branchId || '') !== String(branchId)))) {
            return { status: 409, message: 'An unverified account with this email is already registered. Contact an administrator.' };
        }

        user = existingUser || new User({ email, role });
        user.name = name;
        user.password = bcrypt.hashSync(password, 10);
        user.role = role;
        user.isVerified = false;
        user.isApproved = role !== 'user';
        user.isActive = true;
        if (role === 'employee') {
            user.bankId = bank._id;
            user.branchId = branchId;
            user.staffRole = staffRole || 'branch_manager';
            user.customerBankId = undefined;
        } else {
            user.customerBankId = bank._id;
            user.bankId = undefined;
            user.branchId = branchId || undefined;
            user.staffRole = undefined;
        }
        user.otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();
    } catch (error) {
        console.error('User creation failed:', error.message);
        return { status: 500, message: 'Unable to create user' };
    }

    try {
        await sendOtpEmail(email, otp);
        return { status: 202, message: `${accountLabel} created. Check your email for the verification code.` };
    } catch (error) {
        console.error('OTP email failed:', {
            message: error.message,
            code: error.code,
            responseCode: error.responseCode,
            response: error.response
        });
        return { status: 503, message: `${accountLabel} created, but the verification email could not be sent` };
    }
}

async function createBankAdmin(req, res) {
    const input = readRegistrationInput(req.body);
    if (input.error) return res.status(400).json({ message: input.error });
    const { bankId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(bankId)) {
        return res.status(400).json({ message: 'Select a valid bank' });
    }

    const result = await createPendingUser({
        ...input,
        bankId,
        role: 'employee',
        staffRole: 'bank_admin',
        accountLabel: 'Bank Admin'
    });
    return res.status(result.status).json({ message: result.message });
}

async function createBankStaff(req, res) {
    const bankAdmin = await getAssignedBankAdmin(req, res);
    if (!bankAdmin) return;
    const input = readRegistrationInput(req.body);
    if (input.error) return res.status(400).json({ message: input.error });

    const staffRole = req.body.staffRole;
    if (!['branch_manager', 'general_manager', 'hr_manager', 'finance_manager', 'accounts_manager'].includes(staffRole)) {
        return res.status(400).json({ message: 'Select a valid bank staff role' });
    }
    const { branchId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(branchId)) {
        return res.status(400).json({ message: 'Select a valid sub-branch' });
    }

    const result = await createPendingUser({
        ...input,
        bankId: bankAdmin.bankId,
        branchId,
        role: 'employee',
        staffRole,
        accountLabel: 'Bank staff account'
    });
    return res.status(result.status).json({ message: result.message });
}

async function listBankStaff(req, res) {
    const bankAdmin = await getAssignedBankAdmin(req, res);
    if (!bankAdmin) return;
    const branchScoped = (bankAdmin.staffRole || 'branch_manager') === 'branch_manager';

    try {
        const [staff, bank] = await Promise.all([
            User.find({
                role: 'employee',
                bankId: bankAdmin.bankId,
                ...(branchScoped ? { branchId: bankAdmin.branchId } : {})
            }).select('name email staffRole bankId branchId isVerified isActive createdAt').sort({ staffRole: 1, name: 1 }).lean(),
            Bank.findById(bankAdmin.bankId).select('branches._id branches.branchName branches.branchCode').lean()
        ]);
        const branchesById = new Map((bank?.branches || []).map((branch) => [String(branch._id), branch]));
        const bankStaff = staff.map((employee) => ({
            ...employee,
            branch: branchesById.get(String(employee.branchId)) || null
        }));
        return res.status(200).json({ staff: bankStaff });
    } catch (error) {
        console.error('Bank staff list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load bank staff' });
    }
}

async function setBankStaffActiveStatus(req, res, isActive) {
    const bankAdmin = await getAssignedBankAdmin(req, res);
    if (!bankAdmin) return;
    if (bankAdmin.staffRole !== 'bank_admin') {
        return res.status(403).json({ message: 'Only the Bank Admin can manage bank staff access' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.staffId)) {
        return res.status(400).json({ message: 'A valid bank employee is required' });
    }
    if (String(req.params.staffId) === String(bankAdmin._id)) {
        return res.status(400).json({ message: 'You cannot change your own bank access' });
    }

    try {
        const employee = await User.findOne({
            _id: req.params.staffId,
            role: 'employee',
            bankId: bankAdmin.bankId
        });
        if (!employee) return res.status(404).json({ message: 'Bank employee not found' });
        if (employee.isActive === isActive && (!isActive || employee.isVerified)) {
            return res.status(200).json({ message: `Bank employee is already ${isActive ? 'active' : 'deactivated'}`, staff: employee });
        }

        employee.isActive = isActive;
        if (isActive) {
            employee.isVerified = true;
            employee.isApproved = true;
            employee.otpHash = undefined;
            employee.otpExpiresAt = undefined;
        }
        await employee.save();
        return res.status(200).json({
            message: `Bank employee ${isActive ? 'activated' : 'deactivated'} successfully`,
            staff: employee
        });
    } catch (error) {
        console.error(`Bank employee ${isActive ? 'activation' : 'deactivation'} failed:`, error.message);
        return res.status(500).json({ message: `Unable to ${isActive ? 'activate' : 'deactivate'} bank employee` });
    }
}

async function activateBankStaff(req, res) {
    return setBankStaffActiveStatus(req, res, true);
}

async function deactivateBankStaff(req, res) {
    return setBankStaffActiveStatus(req, res, false);
}

async function getAssignedBankAdmin(req, res) {
    try {
        const bankAdmin = await User.findById(req.user.id).select('role bankId branchId staffRole');
        if (!bankAdmin || bankAdmin.role !== 'employee') {
            return res.status(403).json({ message: 'Bank staff access is required' });
        }
        if (!bankAdmin.bankId || (bankAdmin.staffRole !== 'bank_admin' && !bankAdmin.branchId)) {
            return res.status(403).json({ message: 'Your account is not assigned to the required bank scope' });
        }
        return bankAdmin;
    } catch (error) {
        console.error('Bank administrator lookup failed:', error.message);
        res.status(500).json({ message: 'Unable to verify bank administrator access' });
        return null;
    }
}

async function listBankMembers(req, res) {
    const bankAdmin = await getAssignedBankAdmin(req, res);
    if (!bankAdmin) return;
    const branchScoped = (bankAdmin.staffRole || 'branch_manager') === 'branch_manager';

    try {
        const memberFilter = {
                role: 'user',
                customerBankId: bankAdmin.bankId
        };
        if (branchScoped) memberFilter.branchId = bankAdmin.branchId;
        const [members, bank] = await Promise.all([
            User.find(memberFilter)
                .select('name email isVerified isApproved isActive branchId createdAt')
                .sort({ createdAt: -1 })
                .lean(),
            Bank.findById(bankAdmin.bankId).select('branches._id branches.branchName branches.branchCode').lean()
        ]);
        const branchesById = new Map((bank?.branches || []).map((branch) => [String(branch._id), branch]));
        const bankMembers = members.map((member) => ({
            ...member,
            branch: branchesById.get(String(member.branchId)) || null
        }));
        return res.status(200).json({ members: bankMembers });
    } catch (error) {
        console.error('Bank member list failed:', error.message);
        return res.status(500).json({ message: 'Unable to load bank members' });
    }
}

async function createBankMember(req, res) {
    const bankAdmin = await getAssignedBankAdmin(req, res);
    if (!bankAdmin) return;
    const input = readRegistrationInput(req.body);
    if (input.error) return res.status(400).json({ message: input.error });

    const branchId = bankAdmin.staffRole === 'bank_admin' ? req.body.branchId : bankAdmin.branchId;
    if (!mongoose.Types.ObjectId.isValid(branchId)) {
        return res.status(400).json({ message: 'Select a valid sub-branch' });
    }
    const result = await createPendingUser({
        ...input,
        bankId: bankAdmin.bankId,
        branchId,
        role: 'user',
        accountLabel: 'Member account'
    });
    return res.status(result.status).json({ message: result.message });
}

async function activateBankMember(req, res) {
    const bankAdmin = await getAssignedBankAdmin(req, res);
    if (!bankAdmin) return;
    const staffRole = bankAdmin.staffRole || 'branch_manager';
    if (!['bank_admin', 'branch_manager'].includes(staffRole)) {
        return res.status(403).json({ message: 'Bank Admin or Sub-branch Manager access is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.memberId)) {
        return res.status(400).json({ message: 'A valid bank member is required' });
    }

    try {
        const memberFilter = {
            _id: req.params.memberId,
            role: 'user',
            customerBankId: bankAdmin.bankId
        };
        if (staffRole === 'branch_manager') memberFilter.branchId = bankAdmin.branchId;
        const member = await User.findOne(memberFilter);
        if (!member) return res.status(404).json({ message: 'Bank member not found' });
        if (member.isApproved && member.isVerified && member.isActive !== false) {
            return res.status(200).json({ message: 'Bank member is already active', member });
        }

        member.isVerified = true;
        member.isApproved = true;
        member.isActive = true;
        member.otpHash = undefined;
        member.otpExpiresAt = undefined;
        await member.save();
        return res.status(200).json({ message: 'Bank member approved and activated successfully', member });
    } catch (error) {
        console.error('Bank member activation failed:', error.message);
        return res.status(500).json({ message: 'Unable to approve and activate bank member' });
    }
}

async function deactivateBankMember(req, res) {
    const bankAdmin = await getAssignedBankAdmin(req, res);
    if (!bankAdmin) return;
    const staffRole = bankAdmin.staffRole || 'branch_manager';
    if (!['bank_admin', 'branch_manager'].includes(staffRole)) {
        return res.status(403).json({ message: 'Bank Admin or Sub-branch Manager access is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.memberId)) {
        return res.status(400).json({ message: 'A valid bank member is required' });
    }

    try {
        const memberFilter = {
            _id: req.params.memberId,
            role: 'user',
            customerBankId: bankAdmin.bankId
        };
        if (staffRole === 'branch_manager') memberFilter.branchId = bankAdmin.branchId;
        const member = await User.findOne(memberFilter);
        if (!member) return res.status(404).json({ message: 'Bank member not found' });
        if (member.isActive === false) {
            return res.status(200).json({ message: 'Bank member is already deactivated', member });
        }

        member.isActive = false;
        await member.save();
        return res.status(200).json({ message: 'Bank member deactivated successfully', member });
    } catch (error) {
        console.error('Bank member deactivation failed:', error.message);
        return res.status(500).json({ message: 'Unable to deactivate bank member' });
    }
}

async function resendOtp(req, res) {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'User is already verified' });

        const otp = crypto.randomInt(100000, 1000000).toString();
        user.otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();
        await sendOtpEmail(email, otp);
        return res.status(202).json({ message: 'A new verification code has been sent.' });
    } catch (error) {
        console.error('OTP resend failed:', { message: error.message, code: error.code, responseCode: error.responseCode });
        return res.status(503).json({ message: 'The verification email could not be sent' });
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
        if (!user) return res.status(400).json({ message: 'Invalid or expired OTP' });

        user.isVerified = true;
        user.otpHash = undefined;
        user.otpExpiresAt = undefined;
        await user.save();
        return res.status(200).json({ message: 'Email verified successfully' });
    } catch (error) {
        console.error('OTP verification failed:', error.message);
        return res.status(500).json({ message: 'Error verifying OTP' });
    }
}

async function requestPasswordReset(req, res) {
    const email = req.body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'Enter a valid email address' });
    }
    try {
        const user = await User.findOne({ email, isVerified: true, isActive: { $ne: false } });
        if (!user) {
            return res.status(202).json({ message: 'If an active account exists for this email, a reset code will be sent.' });
        }
        const otp = crypto.randomInt(100000, 1000000).toString();
        user.passwordResetOtpHash = crypto.createHash('sha256').update(otp).digest('hex');
        user.passwordResetExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();
        await sendPasswordResetEmail(email, otp);
        return res.status(202).json({ message: 'If an active account exists for this email, a reset code will be sent.' });
    } catch (error) {
        console.error('Password reset email failed:', {
            message: error.message,
            code: error.code,
            responseCode: error.responseCode,
            command: error.command
        });
        return res.status(503).json({ message: 'The password reset email could not be sent. Please try again later.' });
    }
}

async function confirmPasswordReset(req, res) {
    const email = req.body.email?.trim().toLowerCase();
    const otp = String(req.body.otp || '');
    const newPassword = req.body.newPassword;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || !/^\d{6}$/.test(otp)
        || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ message: 'Provide a valid email, 6-digit reset code, and password with at least 8 characters' });
    }
    try {
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        const password = await bcrypt.hash(newPassword, 10);
        const updatedUser = await User.findOneAndUpdate({
            email,
            passwordResetOtpHash: otpHash,
            passwordResetExpiresAt: { $gt: new Date() },
            isVerified: true,
            isActive: { $ne: false }
        }, {
            $set: { password },
            $unset: { passwordResetOtpHash: 1, passwordResetExpiresAt: 1 }
        }, { new: true, runValidators: true }).select('_id');
        if (!updatedUser) return res.status(400).json({ message: 'Invalid or expired password reset code' });
        return res.status(200).json({ message: 'Password reset successfully. You can now sign in.' });
    } catch (error) {
        console.error('Password reset failed:', error.message);
        return res.status(500).json({ message: 'Unable to reset password' });
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
        if (user.isActive === false) {
            return res.status(403).json({ message: 'Your bank membership is deactivated. Contact your Bank Admin.' });
        }
        if (user.role === 'user' && !user.isApproved) {
            return res.status(403).json({ message: 'Your bank membership is awaiting Branch Manager approval' });
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
    const bankId = req.query.bankId;
    if (bankId && !mongoose.Types.ObjectId.isValid(bankId)) {
        return res.status(400).json({ message: 'Invalid bank selection' });
    }
    const filter = {
        ...(role ? { role } : {}),
        ...(bankId ? { bankId } : {}),
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

async function activateUser(req, res) {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isVerified = true;
        user.isApproved = true;
        user.isActive = true;
        user.otpHash = undefined;
        user.otpExpiresAt = undefined;
        await user.save();

        return res.status(200).json({ message: 'User account activated successfully', user });
    } catch (error) {
        console.error('User activation failed:', error.message);
        return res.status(500).json({ message: 'Unable to activate user account' });
    }
}

async function updateUser(req, res) {
    const { name, email, role, staffRole, isVerified, bankId, branchId } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = String(name).trim();
    if (email !== undefined) updates.email = String(email).trim().toLowerCase();
    if (role !== undefined) {
        if (!['user', 'employee', 'admin'].includes(role)) {
            return res.status(400).json({ message: 'Role must be user, employee, or admin' });
        }
        updates.role = role;
    }
    if (staffRole !== undefined) {
        if (!['bank_admin', 'branch_manager', 'general_manager', 'hr_manager', 'finance_manager', 'accounts_manager'].includes(staffRole)) {
            return res.status(400).json({ message: 'Select a valid bank staff role' });
        }
        updates.staffRole = staffRole;
    }
    if (isVerified !== undefined) updates.isVerified = Boolean(isVerified);
    if (bankId !== undefined) {
        if (bankId && !mongoose.Types.ObjectId.isValid(bankId)) {
            return res.status(400).json({ message: 'Invalid bank selection' });
        }
        updates.bankId = bankId || null;
        if (branchId === undefined) updates.branchId = null;
    }
    if (branchId !== undefined) {
        if (branchId && !mongoose.Types.ObjectId.isValid(branchId)) {
            return res.status(400).json({ message: 'Invalid branch selection' });
        }
        updates.branchId = branchId || null;
    }

    if (!Object.keys(updates).length) {
        return res.status(400).json({ message: 'At least one valid field is required' });
    }

    try {
        const currentUser = await User.findById(req.params.id).select('bankId branchId role staffRole');
        if (!currentUser) return res.status(404).json({ message: 'User not found' });
        if (updates.role !== undefined && updates.role !== currentUser.role) {
            if (req.params.id === req.user.id) {
                return res.status(400).json({ message: 'You cannot change your own role' });
            }
            if (currentUser.role === 'admin' && updates.role !== 'admin'
                && await User.countDocuments({ role: 'admin' }) <= 1) {
                return res.status(409).json({ message: 'At least one administrator account must remain' });
            }
        }

        if (updates.role && updates.role !== 'employee') {
            updates.bankId = null;
            updates.branchId = null;
            updates.staffRole = null;
        } else if (updates.role === 'employee' && updates.staffRole === undefined && currentUser.role !== 'employee') {
            updates.staffRole = 'bank_admin';
        }

        if (updates.bankId || updates.branchId || updates.staffRole !== undefined) {
            const selectedBankId = updates.bankId || currentUser.bankId;
            const selectedRole = updates.role || currentUser.role;
            if (selectedRole !== 'employee') return res.status(400).json({ message: 'Only employee accounts can be assigned to a bank' });
            if (!selectedBankId) return res.status(400).json({ message: 'Select a bank before assigning a branch' });
            const bank = await Bank.findById(selectedBankId);
            if (!bank) return res.status(404).json({ message: 'Bank not found' });
            const selectedBranchId = updates.branchId !== undefined
                ? updates.branchId
                : (updates.bankId ? null : currentUser.branchId);
            if (selectedBranchId && !bank.branches.id(selectedBranchId)) {
                return res.status(400).json({ message: 'The selected branch does not belong to this bank' });
            }
            const selectedStaffRole = updates.staffRole || (currentUser.role === 'employee' ? currentUser.staffRole : undefined);
            if (selectedStaffRole !== 'bank_admin' && !selectedBranchId) {
                return res.status(400).json({ message: 'Select a sub-branch for this staff role' });
            }
            if (updates.staffRole && (updates.role || currentUser.role) !== 'employee') {
                return res.status(400).json({ message: 'Only employee accounts can have a bank staff role' });
            }
        }

        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ message: 'User not found' });
        return res.status(200).json({ message: 'User updated successfully', user });
    } catch (error) {
        console.error('User update failed:', error.message);
        return res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'Email is already in use' : 'Unable to update user' });
    }
}

async function deleteUser(req, res) {
    if (req.params.id === req.user.id) {
        return res.status(400).json({ message: 'You cannot delete your own admin account' });
    }

    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        return res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('User deletion failed:', error.message);
        return res.status(500).json({ message: 'Unable to delete user' });
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
    createBankAdmin,
    createBankStaff,
    listBankStaff,
    activateBankStaff,
    deactivateBankStaff,
    listBankMembers,
    createBankMember,
    activateBankMember,
    deactivateBankMember,
    resendOtp,
    verifyOtp,
    requestPasswordReset,
    confirmPasswordReset,
    loginUser,
    listUsers,
    activateUser,
    updateUser,
    deleteUser,
    getMyProfile,
    updateMyProfile
};