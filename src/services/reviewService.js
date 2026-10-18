import mongoose from 'mongoose';
import { Review } from '../models/Review.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { AppError } from '../utils/AppError.js';
import { detectImageFormat } from '../utils/imageValidator.js';
import { cloudinary, hasCloudinary, deleteCloudinaryImage } from '../config/cloudinary.js';

class ReviewService {
  /**
   * Helper to resolve product document from either an ObjectId string or a slug
   */
  async resolveProduct(identifier) {
    if (!identifier) {
      throw new AppError('Product identifier is required.', 400);
    }

    let product;
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      product = await Product.findById(identifier);
    }
    if (!product) {
      product = await Product.findOne({ slug: identifier });
    }

    if (!product || product.isArchived) {
      throw new AppError('Product not found.', 404);
    }

    return product;
  }

  /**
   * Format display name for storefront (privacy: "Rahul S." or "Aarav K.")
   */
  formatDisplayName(fullName) {
    if (!fullName || typeof fullName !== 'string') return 'Verified Customer';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${firstName} ${lastInitial}.`;
  }

  /**
   * Check if an authenticated user is eligible to review a product
   */
  async checkEligibility(userId, productIdentifier) {
    const product = await this.resolveProduct(productIdentifier);

    // 1. Check if user already reviewed
    const existingReview = await Review.findOne({
      productId: product._id,
      userId
    });

    if (existingReview) {
      return {
        eligible: false,
        reason: 'ALREADY_REVIEWED',
        message: 'You have already submitted a review for this product.',
        existingReview: {
          _id: existingReview._id,
          rating: existingReview.rating,
          title: existingReview.title,
          comment: existingReview.comment,
          images: existingReview.images,
          status: existingReview.status,
          createdAt: existingReview.createdAt
        }
      };
    }

    // 2. Check for delivered order with valid payment
    const qualifyingOrder = await Order.findOne({
      userId,
      'items.productId': product._id,
      orderStatus: 'delivered',
      $or: [
        { paymentMethod: 'razorpay', paymentStatus: 'paid' },
        { paymentMethod: 'cod', orderStatus: 'delivered' }
      ]
    }).sort({ createdAt: -1 });

    if (qualifyingOrder) {
      return {
        eligible: true,
        reason: 'DELIVERED_PURCHASER',
        message: 'Verified buyer. You are eligible to review this product.',
        orderId: qualifyingOrder._id
      };
    }

    // 3. If no delivered order, check if user has ANY pending/in-transit order for this product
    const anyOrder = await Order.findOne({
      userId,
      'items.productId': product._id
    }).sort({ createdAt: -1 });

    if (anyOrder) {
      return {
        eligible: false,
        reason: 'NOT_DELIVERED',
        message: `Your order (#${anyOrder.orderNumber}) is currently ${anyOrder.orderStatus}. You can share your review as soon as the package is delivered!`
      };
    }

    // 4. User has not purchased this product
    return {
      eligible: false,
      reason: 'NOT_PURCHASED',
      message: 'Only verified buyers who have received this product can submit a review.'
    };
  }

  /**
   * Create a verified buyer review with optional uploaded images
   */
  async createReview(userId, productIdentifier, reviewData, files = []) {
    const product = await this.resolveProduct(productIdentifier);

    // 1. Prevent duplicate reviews
    const existingReview = await Review.findOne({
      productId: product._id,
      userId
    });
    if (existingReview) {
      throw new AppError('You have already submitted a review for this product.', 409);
    }

    // 2. Verify delivered order
    const qualifyingOrder = await Order.findOne({
      userId,
      'items.productId': product._id,
      orderStatus: 'delivered',
      $or: [
        { paymentMethod: 'razorpay', paymentStatus: 'paid' },
        { paymentMethod: 'cod', orderStatus: 'delivered' }
      ]
    }).sort({ createdAt: -1 });

    if (!qualifyingOrder) {
      throw new AppError('Only verified buyers who have received this product can submit a review.', 403);
    }

    // 3. Validate image files (magic bytes & size)
    const uploadedImages = [];
    if (Array.isArray(files) && files.length > 0) {
      if (files.length > 5) {
        throw new AppError('A maximum of 5 images can be uploaded per review.', 400);
      }

      for (const file of files) {
        if (!file.buffer || file.buffer.length > 5 * 1024 * 1024) {
          throw new AppError('Each review image must be less than 5MB.', 400);
        }

        const detectedMime = detectImageFormat(file.buffer);
        if (!detectedMime) {
          throw new AppError('Invalid image format detected. Only genuine JPEG, PNG, and WebP images are allowed.', 400);
        }
      }

      // 4. Upload images to Cloudinary (or mock fallback if no credentials)
      for (const file of files) {
        if (hasCloudinary()) {
          const uploadRes = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: 'toyvolt/reviews',
                transformation: [{ quality: 'auto', fetch_format: 'auto' }]
              },
              (err, result) => {
                if (err) {
                  reject(new AppError(err.message || 'Image upload to storage failed.', 502));
                } else {
                  resolve(result);
                }
              }
            );
            stream.end(file.buffer);
          });

          uploadedImages.push({
            url: uploadRes.secure_url,
            publicId: uploadRes.public_id
          });
        } else {
          // Dev / Test mock fallback
          const mockId = `mock_rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          uploadedImages.push({
            url: `https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=800&q=80`,
            publicId: mockId
          });
        }
      }
    }

    // 5. Create review record
    const review = await Review.create({
      productId: product._id,
      userId,
      orderId: qualifyingOrder._id,
      rating: Number(reviewData.rating),
      title: (reviewData.title || '').trim(),
      comment: reviewData.comment.trim(),
      images: uploadedImages,
      isVerifiedPurchase: true,
      status: 'PUBLISHED'
    });

    // 6. Recalculate product rating & review count
    const stats = await Review.calculateProductRatingStats(product._id);

    await review.populate('userId', 'name');

    return {
      review: {
        _id: review._id,
        reviewerName: this.formatDisplayName(review.userId?.name),
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        images: review.images,
        isVerifiedPurchase: review.isVerifiedPurchase,
        createdAt: review.createdAt,
        storeReply: review.storeReply
      },
      productStats: stats
    };
  }

  /**
   * Get public reviews for a product with rating breakdown
   */
  async getProductReviews(productIdentifier, query = {}) {
    const product = await this.resolveProduct(productIdentifier);
    const { page = 1, limit = 10, rating, hasImages, sort = 'newest' } = query;

    const filter = {
      productId: product._id,
      status: 'PUBLISHED'
    };

    if (rating && !isNaN(rating)) {
      filter.rating = Number(rating);
    }

    if (hasImages === 'true' || hasImages === true) {
      filter['images.0'] = { $exists: true };
    }

    const sortOptions = {};
    if (sort === 'highest') {
      sortOptions.rating = -1;
      sortOptions.createdAt = -1;
    } else if (sort === 'lowest') {
      sortOptions.rating = 1;
      sortOptions.createdAt = -1;
    } else {
      sortOptions.createdAt = -1; // newest
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Fetch reviews and aggregate summary breakdown
    const [rawReviews, totalCount, breakdownAgg] = await Promise.all([
      Review.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate('userId', 'name'),
      Review.countDocuments(filter),
      Review.aggregate([
        {
          $match: {
            productId: product._id,
            status: 'PUBLISHED'
          }
        },
        {
          $group: {
            _id: '$rating',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Construct distribution 1..5
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let overallCount = 0;
    let sumRating = 0;

    breakdownAgg.forEach(item => {
      if (distribution[item._id] !== undefined) {
        distribution[item._id] = item.count;
      }
      overallCount += item.count;
      sumRating += item._id * item.count;
    });

    const averageRating = overallCount > 0 ? Math.round((sumRating / overallCount) * 10) / 10 : 0;

    const percentages = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (overallCount > 0) {
      for (let star = 1; star <= 5; star++) {
        percentages[star] = Math.round((distribution[star] / overallCount) * 100);
      }
    }

    const formattedReviews = rawReviews.map(r => ({
      _id: r._id,
      reviewerName: this.formatDisplayName(r.userId?.name),
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      images: r.images,
      photos: (r.images || []).map(img => img.url),
      isVerifiedPurchase: r.isVerifiedPurchase,
      createdAt: r.createdAt,
      storeReply: r.storeReply?.text ? r.storeReply : null
    }));

    return {
      reviews: formattedReviews,
      summary: {
        averageRating,
        totalReviews: overallCount,
        distribution,
        percentages
      },
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalCount / limitNum) || 1
      }
    };
  }

  /**
   * Admin Review Management
   */
  async getAdminReviews(query = {}) {
    const { status, productId, rating, search, page = 1, limit = 20 } = query;
    const filter = {};

    if (status && status !== 'ALL') {
      filter.status = status.toUpperCase();
    }

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      filter.productId = new mongoose.Types.ObjectId(productId);
    }

    if (rating && !isNaN(rating) && Number(rating) >= 1 && Number(rating) <= 5) {
      filter.rating = Number(rating);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    let reviewsQuery = Review.find(filter)
      .populate('userId', 'name email')
      .populate('productId', 'name sku slug')
      .sort({ createdAt: -1 });

    const [reviews, total] = await Promise.all([
      reviewsQuery.skip(skip).limit(limitNum),
      Review.countDocuments(filter)
    ]);

    // Post-filter search if provided (e.g. parent name, product name, comment)
    let processedReviews = reviews.map(r => ({
      _id: r._id,
      parentName: r.userId?.name || 'Anonymous Parent',
      userEmail: r.userId?.email || '',
      productName: r.productId?.name || 'Toyvolt Toy',
      productSku: r.productId?.sku || '',
      productSlug: r.productId?.slug || '',
      productId: r.productId?._id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      images: r.images,
      photos: (r.images || []).map(img => img.url),
      isVerified: r.isVerifiedPurchase,
      status: r.status,
      storeReply: r.storeReply?.text ? r.storeReply : null,
      createdAt: r.createdAt
    }));

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      processedReviews = processedReviews.filter(r =>
        r.parentName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q)
      );
    }

    return {
      reviews: processedReviews,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1
      }
    };
  }

  async updateAdminReviewStatus(reviewId, status) {
    const cleanStatus = status.toUpperCase();
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new AppError('Review not found.', 404);
    }

    review.status = cleanStatus;
    await review.save();

    // Recalculate product rating stats
    await Review.calculateProductRatingStats(review.productId);

    return review;
  }

  async replyAdminReview(reviewId, replyText) {
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new AppError('Review not found.', 404);
    }

    review.storeReply = {
      text: replyText.trim(),
      repliedAt: new Date()
    };
    await review.save();

    return review;
  }

  async deleteAdminReview(reviewId) {
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new AppError('Review not found.', 404);
    }

    const productId = review.productId;
    const publicIds = (review.images || []).map(img => img.publicId).filter(Boolean);

    await Review.findByIdAndDelete(reviewId);

    // Clean up images from Cloudinary
    if (publicIds.length > 0) {
      await Promise.allSettled(publicIds.map(pubId => deleteCloudinaryImage(pubId)));
    }

    // Recalculate product rating stats
    await Review.calculateProductRatingStats(productId);

    return { message: 'Review deleted successfully.' };
  }
}

export const reviewService = new ReviewService();
