import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { razorpayService } from '../services/razorpayService.js';
import { orderService } from '../services/orderService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export const createRazorpayPaymentOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  // Ensure customer ownership unless admin
  if (req.user.role !== 'admin' && order.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Forbidden: Access denied to this order.', 403);
  }

  if (order.paymentStatus === 'paid') {
    throw new AppError('This order has already been paid for.', 400);
  }

  if (order.orderStatus === 'cancelled') {
    throw new AppError('Cannot create payment for a cancelled order.', 400);
  }

  // Check if active payment with razorpayOrderId already exists
  let payment = await Payment.findOne({ orderId: order._id, status: 'created' });

  let razorpayOrder;
  if (payment) {
    razorpayOrder = {
      id: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency
    };
  } else {
    // Create new Razorpay order on server
    razorpayOrder = await razorpayService.createRazorpayOrder({
      amount: order.finalAmount, // strictly server calculated in integer paise
      receipt: order.orderNumber,
      notes: {
        orderId: order._id.toString(),
        userId: req.user._id.toString()
      }
    });

    // Record initial Payment record
    payment = await Payment.create({
      orderId: order._id,
      razorpayOrderId: razorpayOrder.id,
      amount: order.finalAmount,
      currency: 'INR',
      status: 'created'
    });
  }

  res.status(200).json({
    success: true,
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      razorpayOrderId: razorpayOrder.id,
      amount: order.finalAmount,
      currency: 'INR',
      keyId: env.RAZORPAY_KEY_ID || 'rzp_test_placeholder'
    }
  });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  // Verify signature
  const isValid = razorpayService.verifyPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  });

  if (!isValid) {
    // Record failed payment
    await Payment.findOneAndUpdate(
      { orderId: order._id },
      {
        status: 'failed',
        razorpayPaymentId,
        errorCode: 'SIGNATURE_VERIFICATION_FAILED',
        errorDescription: 'Client provided invalid payment signature'
      }
    );
    throw new AppError('Invalid payment signature. Payment verification failed.', 400);
  }

  // Signature is valid: finalize order and commit stock
  const updatedOrder = await orderService.finalizeOrderPayment({
    orderId: order._id,
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySignature
  });

  res.status(200).json({
    success: true,
    message: 'Payment verified and order confirmed successfully.',
    data: {
      order: updatedOrder
    }
  });
});

export const getPaymentByOrderId = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  if (req.user.role !== 'admin' && order.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Forbidden: Access denied.', 403);
  }

  const payment = await Payment.findOne({ orderId });

  res.status(200).json({
    success: true,
    data: { payment }
  });
});

export const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  if (!signature) {
    return res.status(400).json({ success: false, message: 'Missing Razorpay signature header.' });
  }

  // 1. Verify webhook signature using req.rawBody
  const isValid = razorpayService.verifyWebhookSignature({
    rawBody: req.rawBody,
    signature
  });

  if (!isValid) {
    logger.warn('Razorpay webhook signature verification failed.');
    return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
  }

  const event = req.body;
  const eventId = event?.event_id || `evt_${Date.now()}`;
  const eventType = event?.event;

  logger.info(`Received verified Razorpay webhook: ${eventType} (ID: ${eventId})`);

  // 2. Idempotency check: see if event has already been processed
  const alreadyProcessed = await Payment.findOne({
    'rawWebhookEvents.eventId': eventId
  });

  if (alreadyProcessed) {
    logger.info(`Webhook event ${eventId} already processed. Acknowledging with 200 OK.`);
    return res.status(200).json({ status: 'ok', message: 'Event already processed.' });
  }

  // 3. Process supported events
  if (eventType === 'order.paid' || eventType === 'payment.captured') {
    const paymentEntity = event.payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id || event.payload?.order?.entity?.id;
    const razorpayPaymentId = paymentEntity?.id;

    if (razorpayOrderId) {
      const paymentRecord = await Payment.findOne({ razorpayOrderId });
      if (paymentRecord) {
        await orderService.finalizeOrderPayment({
          orderId: paymentRecord.orderId,
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature: 'webhook_verified',
          rawEvent: {
            eventId,
            event: eventType,
            receivedAt: new Date(),
            payload: event
          }
        });
      }
    }
  } else if (eventType === 'payment.failed') {
    const paymentEntity = event.payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id;
    if (razorpayOrderId) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId },
        {
          status: 'failed',
          errorCode: paymentEntity.error_code,
          errorDescription: paymentEntity.error_description,
          $push: {
            rawWebhookEvents: {
              eventId,
              event: eventType,
              receivedAt: new Date(),
              payload: event
            }
          }
        }
      );
    }
  }

  // Always return 200 OK quickly to Razorpay to prevent retry storms
  res.status(200).json({ status: 'ok' });
});
