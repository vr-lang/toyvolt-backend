import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { OtpToken } from '../models/OtpToken.js';
import { emailService } from './emailService.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

const OTP_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;   // 60 seconds
const MAX_ATTEMPTS = 5;

class OtpService {
  /**
   * Generates cryptographically secure 6-digit OTP
   */
  generateOtp() {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Generates, hashes, stores, and emails an OTP
   */
  async generateAndSendOtp({ email, name = 'there', purpose }) {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check for cooldown from last sent OTP
    const existingOtp = await OtpToken.findOne({
      email: normalizedEmail,
      purpose,
      isConsumed: false
    }).sort({ createdAt: -1 });

    if (existingOtp) {
      const timeSinceLastSent = Date.now() - new Date(existingOtp.lastSentAt).getTime();
      if (timeSinceLastSent < RESEND_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastSent) / 1000);
        throw new AppError(`Please wait ${remainingSeconds} seconds before requesting another code.`, 429);
      }
    }

    // 2. Invalidate previous active OTPs for this email and purpose
    await OtpToken.updateMany(
      { email: normalizedEmail, purpose, isConsumed: false },
      { isConsumed: true }
    );

    // 3. Generate raw 6-digit OTP and secure hash
    const rawOtp = this.generateOtp();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + OTP_VALIDITY_MS);

    // Diagnostic Stage 2: OTP generation completed (safe log, no raw OTP)
    logger.info(`OTP generation completed for purpose: ${purpose}`);

    // 4. Save new OTP token
    await OtpToken.create({
      email: normalizedEmail,
      purpose,
      otpHash,
      expiresAt,
      maxAttempts: MAX_ATTEMPTS,
      attempts: 0,
      lastSentAt: new Date(),
      isConsumed: false
    });

    // Diagnostic Stage 3: OTP record saved successfully
    logger.info(`OTP record saved successfully for purpose: ${purpose}`);

    // Diagnostic Stage 4: Email service called
    logger.info(`Email service called for purpose: ${purpose}`);

    // 5. Send via transactional email
    try {
      if (purpose === 'register') {
        await emailService.sendVerificationOtp({
          email: normalizedEmail,
          name,
          otp: rawOtp,
          expiresInMinutes: 5
        });
      } else if (purpose === 'password_reset') {
        await emailService.sendPasswordResetOtp({
          email: normalizedEmail,
          name,
          otp: rawOtp,
          expiresInMinutes: 5
        });
      }
    } catch (emailError) {
      logger.error(`[OTP] Email delivery failed for recipient: ${normalizedEmail}: ${emailError.message}`);
      throw emailError instanceof AppError
        ? emailError
        : new AppError(`Failed to send verification email: ${emailError.message}`, 502);
    }

    return {
      success: true,
      expiresInSeconds: OTP_VALIDITY_MS / 1000
    };
  }

  /**
   * Validates submitted OTP
   */
  async verifyOtp({ email, otp, purpose }) {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find the latest unconsumed token
    const tokenRecord = await OtpToken.findOne({
      email: normalizedEmail,
      purpose,
      isConsumed: false
    }).sort({ createdAt: -1 });

    if (!tokenRecord) {
      throw new AppError('No active verification code found or code already used. Please request a new one.', 400);
    }

    // 2. Check if expired
    if (Date.now() > new Date(tokenRecord.expiresAt).getTime()) {
      tokenRecord.isConsumed = true;
      await tokenRecord.save();
      throw new AppError('Verification code has expired. Please request a new code.', 400);
    }

    // 3. Check attempt limit
    if (tokenRecord.attempts >= tokenRecord.maxAttempts) {
      tokenRecord.isConsumed = true;
      await tokenRecord.save();
      throw new AppError('Too many failed attempts. This code is now invalid. Please request a new one.', 429);
    }

    // 4. Compare hash
    const isMatch = await bcrypt.compare(otp, tokenRecord.otpHash);

    if (!isMatch) {
      tokenRecord.attempts += 1;
      await tokenRecord.save();

      const remainingAttempts = tokenRecord.maxAttempts - tokenRecord.attempts;
      if (remainingAttempts <= 0) {
        tokenRecord.isConsumed = true;
        await tokenRecord.save();
        throw new AppError('Incorrect code. Maximum attempts exceeded. Code has been invalidated.', 400);
      }

      throw new AppError(`Incorrect verification code. ${remainingAttempts} attempts remaining.`, 400);
    }

    // 5. Success: Consume token
    tokenRecord.isConsumed = true;
    tokenRecord.consumedAt = new Date();
    await tokenRecord.save();

    return true;
  }
}

export const otpService = new OtpService();
