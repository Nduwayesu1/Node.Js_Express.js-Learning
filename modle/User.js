const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema(
    {
      name: {
        type: String,
        required: true
      },
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
      },
        password: {
        type: String,
        required: true,
        minlength: 8
      },
        isVerified: {
          type: Boolean,
          default: false
        },
        isApproved: {
          type: Boolean,
          default: true
        },
        isActive: {
          type: Boolean,
          default: true
        },
        otpHash: {
          type: String
        },
        otpExpiresAt: {
          type: Date
        },
      role: {
        type: String,
        enum: ['user', 'admin','employee'],
        default: 'user'
      },
      staffRole: {
        type: String,
        enum: ['branch_manager', 'general_manager', 'hr_manager', 'finance_manager', 'accounts_manager']
      },
      bankId: {
        type: Schema.Types.ObjectId,
        ref: 'Bank'
      },
      customerBankId: {
        type: Schema.Types.ObjectId,
        ref: 'Bank'
      },
      branchId: {
        type: Schema.Types.ObjectId
      },
      bankAccountId: {
        type: Schema.Types.ObjectId,
        ref: 'BankAccount'
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      
    }
);

userSchema.set('toJSON', {
  transform: (_document, returnedUser) => {
    delete returnedUser.password;
    delete returnedUser.otpHash;
    delete returnedUser.otpExpiresAt;
    delete returnedUser.__v;
    return returnedUser;
  }
});

module.exports = mongoose.model('User', userSchema);