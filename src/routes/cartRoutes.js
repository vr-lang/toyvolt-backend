import { Router } from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart
} from '../controllers/cartController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  addToCartSchema,
  updateCartItemSchema
} from '../validators/cartValidator.js';

const router = Router();

router.use(protect);

router.get('/', getCart);
router.post('/items', validate(addToCartSchema), addToCart);
router.patch('/items/:productId', validate(updateCartItemSchema), updateCartItem);
router.delete('/items/:productId', removeCartItem);
router.delete('/', clearCart);

export default router;
