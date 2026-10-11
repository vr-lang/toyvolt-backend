import { Resend } from 'resend';
import { env, hasResend } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import { getVerificationEmailTemplate } from '../templates/emails/verificationEmail.js';
import { getWelcomeEmailTemplate } from '../templates/emails/welcomeEmail.js';
import { getPasswordResetEmailTemplate } from '../templates/emails/passwordResetEmail.js';
import { getOrderConfirmationEmailTemplate } from '../templates/emails/orderConfirmationEmail.js';
import { getShippingUpdateEmailTemplate } from '../templates/emails/shippingUpdateEmail.js';

class EmailService {
  constructor() {
    this.resendClient = (env.NODE_ENV !== 'test' && hasResend())
      ? new Resend(env.RESEND_API_KEY)
      : null;
  }

  setResendClient(client) {
    this.resendClient = client;
  }

  async sendEmail({ to, subject, html, text }) {
    if (!this.resendClient) {
      logger.info(`[EmailService MOCK] Sending email to: ${to}`);
      return { id: `mock-${Date.now()}`, success: true };
    }

    // Diagnostic Stage 5: Resend API request started
    logger.info(`Resend API request started for recipient: ${to}`);

    try {
      const response = await this.resendClient.emails.send({
        from: env.EMAIL_FROM,
        to,
        subject,
        html,
        text
      });

      // Diagnostic Stage 6: Resend API response received
      logger.info(`Resend API response received for recipient: ${to}`);

      if (response.error) {
        logger.error(`[Resend] Resend API error for recipient ${to}: ${response.error.message}`);
        const statusCode = response.error.statusCode || (response.error.name === 'validation_error' ? 400 : 502);
        throw new AppError(`Email delivery failed: ${response.error.message}`, statusCode);
      }

      // Safe logging of returned request ID (no OTP or secrets)
      logger.info(`[Resend] Email delivery accepted by Resend. Request ID: ${response.data?.id}`);
      return { id: response.data?.id, success: true };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`[Resend] Failed to dispatch email to ${to}: ${error.message}`);
      throw new AppError(`Email delivery failed: ${error.message}`, 502);
    }
  }

  async sendVerificationOtp({ email, name, otp, expiresInMinutes = 5 }) {
    const { html, text } = getVerificationEmailTemplate({ name, otp, expiresInMinutes });
    return this.sendEmail({
      to: email,
      subject: 'Your Toyvolt verification code',
      html,
      text
    });
  }

  async sendWelcomeEmail({ email, name, welcomeCoupon = 'WELCOME100' }) {
    const { html, text } = getWelcomeEmailTemplate({ name, welcomeCoupon });
    return this.sendEmail({
      to: email,
      subject: 'Welcome to Toyvolt! Here is ₹100 OFF your first order 🎁',
      html,
      text
    });
  }

  async sendPasswordResetOtp({ email, name, otp, expiresInMinutes = 5 }) {
    const { html, text } = getPasswordResetEmailTemplate({ name, otp, expiresInMinutes });
    return this.sendEmail({
      to: email,
      subject: 'Your Toyvolt password reset code',
      html,
      text
    });
  }

  async sendOrderConfirmation({ email, user, order }) {
    const { html, text } = getOrderConfirmationEmailTemplate({ order, user });
    return this.sendEmail({
      to: email,
      subject: `Order Confirmed: #${order.orderNumber} - Toyvolt`,
      html,
      text
    });
  }

  async sendShippingUpdate({ email, order, shipment }) {
    const { html, text } = getShippingUpdateEmailTemplate({ order, shipment });
    return this.sendEmail({
      to: email,
      subject: `Your Toyvolt order #${order.orderNumber} has shipped!`,
      html,
      text
    });
  }
}

export const emailService = new EmailService();
