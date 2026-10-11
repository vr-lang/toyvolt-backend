import { Router } from 'express';
import {
  getOrderTracking,
  handleShiprocketWebhook
} from '../controllers/shipmentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// Customer tracking for specific order
router.get('/orders/:id/tracking', protect, getOrderTracking);

// Shiprocket webhook callback
router.post('/webhook', handleShiprocketWebhook);

export default router;
