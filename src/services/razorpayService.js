import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env, hasRazorpay } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

let razorpayInstance = null;

if (hasRazorpay()) {
  razorpayInstance = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET
  });
}

class RazorpayService {
  /**
   * Create Razorpay order for online payment
   * @param {Object} params
   * @param {number} params.amount - Amount in integer paise
   * @param {string} params.receipt - Internal orderNumber
   */
  async createRazorpayOrder({ amount, receipt, notes = {} }) {
    if (!hasRazorpay() || !razorpayInstance || env.NODE_ENV === 'test') {
      logger.info(`[Razorpay MOCK] Creating mock Razorpay order for receipt: ${receipt}, amount: ${amount} paise`);
      return {
        id: `order_mock_${Date.now()}`,
        entity: 'order',
        amount,
        amount_paid: 0,
        amount_due: amount,
        currency: 'INR',
        receipt,
        status: 'created',
        notes
      };
    }

    try {
      const options = {
        amount, // integer paise
        currency: 'INR',
        receipt,
        notes
      };

      const razorpayOrder = await razorpayInstance.orders.create(options);
      return razorpayOrder;
    } catch (error) {
      logger.error('Failed to create Razorpay order:', error);
      throw new AppError(`Payment provider error: ${error.error?.description || error.message}`, 502);
    }
  }

  /**
   * Verifies client-side Razorpay payment signature
   * signature = HMAC_SHA256(order_id + "|" + payment_id, secret)
   */
  verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    if (!hasRazorpay() || env.NODE_ENV === 'test') {
      // Allow mock signatures during test or dev without credentials
      if (razorpaySignature.startsWith('mock_sig_') || razorpaySignature === 'valid_test_signature') {
        return true;
      }
    }

    const secret = env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      throw new AppError('Payment service key secret is not configured on the server.', 500);
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return expectedSignature === razorpaySignature;
  }

  /**
   * Verifies webhook signature using the exact raw body
   * Razorpay passes signature in header 'x-razorpay-signature'
   */
  verifyWebhookSignature({ rawBody, signature }) {
    if (!hasRazorpay() || env.NODE_ENV === 'test') {
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

    return expectedSignature === signature;
  }
}

export const razorpayService = new RazorpayService();
