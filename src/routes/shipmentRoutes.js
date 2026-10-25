import { Router } from 'express';
import {
  getOrderTracking,
  refreshCustomerOrderTracking,
  handleShiprocketWebhook,
  getShippingSettings
} from '../controllers/shipmentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// Public shipping configuration & fee settings
router.get('/settings', getShippingSettings);

// Customer tracking for specific order
router.get('/orders/:id/tracking', protect, getOrderTracking);
router.post('/orders/:id/refresh', protect, refreshCustomerOrderTracking);

// Shiprocket webhook callback
router.post('/webhook', handleShiprocketWebhook);

export default router;
