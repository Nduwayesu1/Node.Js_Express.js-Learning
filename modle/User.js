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