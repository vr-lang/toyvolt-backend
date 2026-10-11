import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import productRoutes from './productRoutes.js';
import cartRoutes from './cartRoutes.js';
import couponRoutes from './couponRoutes.js';
import orderRoutes from './orderRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import shipmentRoutes from './shipmentRoutes.js';
import adminRoutes from './adminRoutes.js';
import { handleRazorpayWebhook } from '../controllers/paymentController.js';
import { handleShiprocketWebhook } from '../controllers/shipmentController.js';

const router = Router();

// Health
router.use('/', healthRoutes);

// Feature routes
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/coupons', couponRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/shipments', shipmentRoutes);
router.use('/admin', adminRoutes);

// Canonical Webhook routes
router.post('/webhooks/razorpay', handleRazorpayWebhook);
router.post('/webhooks/shiprocket', handleShiprocketWebhook);

export default router;
