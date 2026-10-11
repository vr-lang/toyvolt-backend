import mongoose from 'mongoose';

const otpTokenSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  purpose: {
    type: String,
    required: true,
    enum: ['register', 'password_reset', 'email_change'],
    index: true
  },
  otpHash: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 5
  },
  lastSentAt: {
    type: Date,
    default: Date.now
  },
  isConsumed: {
    type: Boolean,
    default: false
  },
  consumedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// TTL Index: automatically delete document 24 hours after expiresAt
otpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

export const OtpToken = mongoose.model('OtpToken', otpTokenSchema);
