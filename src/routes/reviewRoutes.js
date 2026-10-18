import { Router } from 'express';
import {
  getProductReviews,
  checkReviewEligibility,
  createProductReview
} from '../controllers/reviewController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadReviewImages } from '../middleware/reviewUploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createReviewSchema } from '../validators/reviewValidator.js';

const router = Router();

router.get('/products/:identifier', getProductReviews);
router.get('/eligibility/:identifier', protect, checkReviewEligibility);
router.post(
  '/products/:identifier',
  protect,
  uploadReviewImages,
  validate(createReviewSchema),
  createProductReview
);

export default router;
