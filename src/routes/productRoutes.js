import { Router } from 'express';
import {
  getProducts,
  getProductBySlug,
  getCategories
} from '../controllers/productController.js';
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

// Catalog Queries
router.get('/', getProducts);
router.get('/categories', getCategories);

// Review Endpoints (mounted before /:slug wildcard if exact or with /reviews)
router.get('/:slug/reviews', getProductReviews);
router.get('/:slug/reviews/eligibility', protect, checkReviewEligibility);
router.post(
  '/:slug/reviews',
  protect,
  uploadReviewImages,
  validate(createReviewSchema),
  createProductReview
);

// Product Detail
router.get('/:slug', getProductBySlug);

export default router;
