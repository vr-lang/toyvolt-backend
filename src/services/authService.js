import { User } from '../models/User.js';
import { otpService } from './otpService.js';
import { emailService } from './emailService.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} from '../utils/token.js';

class AuthService {
  async register({ name, email, password }) {
    const normalizedEmail = email.toLowerCase().trim();
    logger.info(`Registration request received for recipient: ${normalizedEmail}`);

    // Check if user already exists
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      if (user.isEmailVerified) {
        throw new AppError('An account with this email address already exists. Please log in.', 409);
      }
      // If unverified, update credentials and resend verification OTP
      user.name = name;
      user.password = password; // Will be hashed by pre('save')
      await user.save();
    } else {
      // Strictly enforce role as 'customer'
      user = await User.create({
        name,
        email: normalizedEmail,
        password,
        role: 'customer',
        isEmailVerified: false
      });
    }

    // Generate and dispatch OTP
    await otpService.generateAndSendOtp({
      email: normalizedEmail,
      name: user.name,
      purpose: 'register'
    });

    return {
      message: 'Registration successful. A verification code has been sent to your email.',
      email: normalizedEmail
    };
  }

  async verifyEmail({ email, otp }) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new AppError('No account found with this email address.', 404);
    }

    if (user.isEmailVerified) {
      throw new AppError('This account is already verified. Please log in.', 400);
    }

    // Verify OTP
    await otpService.verifyOtp({
      email: normalizedEmail,
      otp,
      purpose: 'register'
    });

    // Mark verified
    user.isEmailVerified = true;
    await user.save();

    // Send Welcome Email asynchronously
    emailService.sendWelcomeEmail({
      email: normalizedEmail,
      name: user.name,
      welcomeCoupon: 'WELCOME100'
    }).catch(() => {});

    // Issue tokens
    const accessToken = generateAccessToken({ id: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user._id });

    return {
      user,
      accessToken,
      refreshToken
    };
  }

  async resendOtp({ email, purpose = 'register' }) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Do not disclose whether email exists
      return { message: 'If an account exists, a new code will be sent.' };
    }

    if (purpose === 'register' && user.isEmailVerified) {
      throw new AppError('Your email is already verified. Please log in.', 400);
    }

    await otpService.generateAndSendOtp({
      email: normalizedEmail,
      name: user.name,
      purpose
    });

    return { message: 'A new verification code has been dispatched to your email.' };
  }

  async login({ email, password }) {
    const rawInput = (email || '').toLowerCase().trim();
    const candidateEmail = rawInput.includes('@') ? rawInput : `${rawInput}@toyvolt.com`;

    const user = await User.findOne({
      $or: [{ email: rawInput }, { email: candidateEmail }]
    }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      throw new AppError('Invalid email or password.', 401);
    }

    if (!user.isEmailVerified) {
      // Send a fresh OTP to help user verify
      otpService.generateAndSendOtp({
        email: user.email,
        name: user.name,
        purpose: 'register'
      }).catch(() => {});

      throw new AppError('Your email is not verified yet. We have sent a new verification code to your email.', 403);
    }

    if (user.accountStatus !== 'active') {
      throw new AppError('Your account is suspended. Please contact customer support.', 403);
    }

    const accessToken = generateAccessToken({ id: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user._id });

    return {
      user,
      accessToken,
      refreshToken
    };
  }

  async refreshAccessToken(token) {
    if (!token) {
      throw new AppError('Refresh token required.', 401);
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw new AppError('Invalid or expired refresh token. Please log in again.', 401);
    }

    const user = await User.findById(decoded.id);
    if (!user || user.accountStatus !== 'active') {
      throw new AppError('User not found or suspended.', 401);
    }

    const newAccessToken = generateAccessToken({ id: user._id, role: user.role });
    return {
      accessToken: newAccessToken,
      user
    };
  }

  async forgotPassword({ email }) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user && user.isEmailVerified) {
      await otpService.generateAndSendOtp({
        email: normalizedEmail,
        name: user.name,
        purpose: 'password_reset'
      });
    }

    return {
      message: 'If an account exists with this email, a password reset code has been sent.'
    };
  }

  async resetPassword({ email, otp, newPassword }) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new AppError('Invalid request or account not found.', 404);
    }

    await otpService.verifyOtp({
      email: normalizedEmail,
      otp,
      purpose: 'password_reset'
    });

    user.password = newPassword;
    await user.save();

    return {
      message: 'Password has been successfully updated. You may now log in with your new password.'
    };
  }

  async getSetupStatus() {
    const adminCount = await User.countDocuments({ role: 'admin' });
    return {
      hasAdmin: adminCount > 0,
      isSetupRequired: adminCount === 0
    };
  }

  async setupInitialAdmin({ adminId, email, name, password }) {
    // Atomic check: Ensure NO administrator currently exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      throw new AppError('Initial administrator has already been configured. Public setup is permanently disabled.', 403);
    }

    const rawId = (email || adminId || '').toLowerCase().trim();
    const normalizedEmail = rawId.includes('@') ? rawId : `${rawId}@toyvolt.com`;

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(normalizedEmail)) {
      throw new AppError('Please provide a valid Admin Email address or identifier.', 400);
    }

    // Atomic creation
    const admin = await User.create({
      name: (name || 'Toyvolt Administrator').trim(),
      email: normalizedEmail,
      password,
      role: 'admin',
      isEmailVerified: true,
      accountStatus: 'active'
    });

    const accessToken = generateAccessToken({ id: admin._id, role: admin.role });
    const refreshToken = generateRefreshToken({ id: admin._id });

    return {
      user: admin,
      accessToken,
      refreshToken
    };
  }
}

export const authService = new AuthService();
