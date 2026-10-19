import { Router } from 'express';
import {
  getOrderTracking,
  handleShiprocketWebhook,
  getShippingSettings
} from '../controllers/shipmentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// Public shipping configuration & fee settings
router.get('/settings', getShippingSettings);

// Customer tracking for specific order
router.get('/orders/:id/tracking', protect, getOrderTracking);

// Shiprocket webhook callback
router.post('/webhook', handleShiprocketWebhook);

export default router;
