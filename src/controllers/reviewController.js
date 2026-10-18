import { reviewService } from '../services/reviewService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ==========================================
// Customer Storefront Endpoints
// ==========================================

export const checkReviewEligibility = asyncHandler(async (req, res) => {
  const identifier = req.params.productId || req.params.slug;
  const result = await reviewService.checkEligibility(req.user._id, identifier);

  res.status(200).json({
    success: true,
    data: result
  });
});

export const createProductReview = asyncHandler(async (req, res) => {
  const identifier = req.params.productId || req.params.slug;
  // Always derive user ID from authenticated token/cookie session
  const userId = req.user._id;

  const result = await reviewService.createReview(
    userId,
    identifier,
    req.body,
    req.files || []
  );

  res.status(201).json({
    success: true,
    message: 'Review submitted successfully. Thank you for your feedback!',
    data: result
  });
});

export const getProductReviews = asyncHandler(async (req, res) => {
  const identifier = req.params.productId || req.params.slug;
  const result = await reviewService.getProductReviews(identifier, req.query);

  res.status(200).json({
    success: true,
    data: result
  });
});

// ==========================================
// Admin Moderation Endpoints
// ==========================================

export const getAdminReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.getAdminReviews(req.query);

  res.status(200).json({
    success: true,
    data: result
  });
});

export const updateAdminReviewStatus = asyncHandler(async (req, res) => {
  const review = await reviewService.updateAdminReviewStatus(
    req.params.id,
    req.body.status
  );

  res.status(200).json({
    success: true,
    message: `Review status updated to ${review.status}.`,
    data: { review }
  });
});

export const replyAdminReview = asyncHandler(async (req, res) => {
  const review = await reviewService.replyAdminReview(
    req.params.id,
    req.body.reply
  );

  res.status(200).json({
    success: true,
    message: 'Store reply posted successfully.',
    data: { review }
  });
});

export const deleteAdminReview = asyncHandler(async (req, res) => {
  const result = await reviewService.deleteAdminReview(req.params.id);

  res.status(200).json({
    success: true,
    message: result.message
  });
});
