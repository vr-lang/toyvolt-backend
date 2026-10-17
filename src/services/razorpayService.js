import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env, hasRazorpay } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

let razorpayInstance = null;

export const getRazorpayInstance = () => {
  if (razorpayInstance) return razorpayInstance;

  if (hasRazorpay()) {
    if (env.PAYMENTS_MODE === 'test' && env.RAZORPAY_KEY_ID.startsWith('rzp_live_')) {
      throw new AppError(
        'CRITICAL SECURITY SAFEGUARD: Live Razorpay key detected while PAYMENTS_MODE=test. Refusing to initialize with live credentials.',
        500
      );
    }

    razorpayInstance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });
  }

  return razorpayInstance;
};

// Eager initialization if credentials exist
getRazorpayInstance();

class RazorpayService {
  /**
   * Create Razorpay order for online payment
   * @param {Object} params
   * @param {number} params.amount - Amount in integer paise (strictly server calculated)
   * @param {string} params.receipt - Internal orderNumber
   * @param {Object} [params.notes] - Key-value metadata notes
   */
  async createRazorpayOrder({ amount, receipt, notes = {} }) {
    const amountInPaise = Math.round(Number(amount));
    if (!amountInPaise || amountInPaise <= 0 || !Number.isInteger(amountInPaise)) {
      throw new AppError('Invalid order amount. Amount must be a positive integer in paise.', 400);
    }

    const rzp = getRazorpayInstance();

    if (!hasRazorpay() || !rzp || env.NODE_ENV === 'test') {
      logger.info(`[Razorpay TEST/MOCK] Creating test order for receipt: ${receipt}, amount: ${amountInPaise} paise`);
      return {
        id: `order_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        entity: 'order',
        amount: amountInPaise,
        amount_paid: 0,
        amount_due: amountInPaise,
        currency: 'INR',
        receipt,
        status: 'created',
        notes: {
          ...notes,
          paymentsMode: env.PAYMENTS_MODE
        }
      };
    }

    try {
      const options = {
        amount: amountInPaise, // integer paise strictly
        currency: 'INR',
        receipt,
        notes: {
          ...notes,
          paymentsMode: env.PAYMENTS_MODE
        }
      };

      const razorpayOrder = await rzp.orders.create(options);
      return razorpayOrder;
    } catch (error) {
      const description = error.error?.description || error.message || 'Unknown payment provider error';
      const statusCode = error.statusCode || 500;

      logger.error(`Failed to create Razorpay order for receipt ${receipt}:`, {
        statusCode,
        errorCode: error.error?.code,
        description
      });

      if (statusCode === 401 || description.toLowerCase().includes('authentication failed')) {
        logger.error(
          '[CRITICAL] Razorpay API Authentication Failed (HTTP 401). ' +
          'The RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET configured on this server is invalid, deactivated, or mismatched with the Razorpay Dashboard.'
        );
        throw new AppError(
          'Payment gateway authentication failed on server. Please verify the active Razorpay API Key ID and Key Secret in your server environment.',
          502
        );
      }

      throw new AppError(`Payment provider error: ${description}`, 502);
    }
  }

  /**
   * Verifies client-side Razorpay payment signature
   * Expected: HMAC_SHA256(order_id + "|" + payment_id, secret)
   * Uses timing-safe string comparison to protect against timing attacks.
   */
  verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return false;
    }

    const secret = env.RAZORPAY_KEY_SECRET;

    // Support mock signature in test suites where secret is not configured
    if (env.NODE_ENV === 'test') {
      if (razorpaySignature === 'valid_test_signature' || razorpaySignature.startsWith('mock_sig_')) {
        return true;
      }
    }

    if (!secret) {
      throw new AppError('Payment service key secret is not configured on the server.', 500);
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    try {
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const actualBuffer = Buffer.from(razorpaySignature, 'utf8');

      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Verifies webhook signature using the exact raw body
   * Razorpay passes signature in header 'x-razorpay-signature'
   * Uses timing-safe comparison.
   */
  verifyWebhookSignature({ rawBody, signature }) {
    if (!signature) {
      return false;
    }

    if (env.NODE_ENV === 'test') {
      if (signature === 'mock_webhook_sig' || signature === 'valid_test_webhook_sig') {
        return true;
      }
    }

    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      throw new AppError('Razorpay webhook secret is not configured on the server.', 500);
    }

    if (!rawBody) {
      throw new AppError('Raw request body is required for signature verification.', 400);
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    try {
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const actualBuffer = Buffer.from(signature, 'utf8');

      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }
}

export const razorpayService = new RazorpayService();

