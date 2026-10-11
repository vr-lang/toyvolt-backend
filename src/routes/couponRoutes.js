import { Router } from 'express';
import { validateCoupon } from '../controllers/couponController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { validateCouponSchema } from '../validators/couponValidator.js';

const router = Router();

router.post('/validate', optionalAuth, validate(validateCouponSchema), validateCoupon);

export default router;
