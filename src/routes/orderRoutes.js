import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder
} from '../controllers/orderController.js';
import { getOrderTracking } from '../controllers/shipmentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createOrderSchema,
  cancelOrderSchema
} from '../validators/orderValidator.js';

const router = Router();

router.use(protect);

router.post('/', validate(createOrderSchema), createOrder);
router.get('/my', getMyOrders);
router.get('/:id/tracking', getOrderTracking);
router.get('/:id', getOrderById);
router.post('/:id/cancel', validate(cancelOrderSchema), cancelOrder);

export default router;
