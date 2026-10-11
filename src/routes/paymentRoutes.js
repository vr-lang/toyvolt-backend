import { Router } from 'express';
import {
  createRazorpayPaymentOrder,
  verifyPayment,
  getPaymentByOrderId,
  handleRazorpayWebhook
} from '../controllers/paymentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createPaymentOrderSchema,
  verifyPaymentSchema
} from '../validators/paymentValidator.js';

const router = Router();

// Protected user payment routes
router.post('/create-order', protect, validate(createPaymentOrderSchema), createRazorpayPaymentOrder);
router.post('/verify', protect, validate(verifyPaymentSchema), verifyPayment);
router.get('/:orderId', protect, getPaymentByOrderId);

// Public Razorpay Webhook endpoint
router.post('/webhook', handleRazorpayWebhook);

export default router;
