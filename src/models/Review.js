import mongoose from 'mongoose';
import { Product } from './Product.js';

const reviewImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, default: '' }
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product reference is required'],
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'Verified order reference is required']
  },
  rating: {
    type: Number,
    required: [true, 'Star rating is required'],
    min: [1, 'Rating must be at least 1 star'],
    max: [5, 'Rating cannot exceed 5 stars'],
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be an integer between 1 and 5'
    }
  },
  title: {
    type: String,
    trim: true,
    maxlength: [120, 'Review title cannot exceed 120 characters'],
    default: ''
  },
  comment: {
    type: String,
    required: [true, 'Review comment is required'],
    trim: true,
    minlength: [5, 'Review comment must be at least 5 characters'],
    maxlength: [2000, 'Review comment cannot exceed 2000 characters']
  },
  images: {
    type: [reviewImageSchema],
    validate: {
      validator: function (val) {
        return !val || val.length <= 5;
      },
      message: 'A maximum of 5 images can be attached per review'
    },
    default: []
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['PUBLISHED', 'PENDING', 'FLAGGED', 'ARCHIVED'],
    default: 'PUBLISHED',
    index: true
  },
  storeReply: {
    text: { type: String, trim: true, default: '' },
    repliedAt: { type: Date, default: null }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Enforce strictly one review per customer per product
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

// Virtuals for compatibility with admin panel & storefront
reviewSchema.virtual('photos').get(function () {
  return (this.images || []).map(img => img.url);
});

reviewSchema.virtual('isVerified').get(function () {
  return this.isVerifiedPurchase;
});

// Static helper to recalculate product's averageRating and totalReviews
reviewSchema.statics.calculateProductRatingStats = async function (productId) {
  const stats = await this.aggregate([
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        status: 'PUBLISHED'
      }
    },
    {
      $group: {
        _id: '$productId',
        totalReviews: { $sum: 1 },
        averageRating: { $avg: '$rating' }
      }
    }
  ]);

  if (stats.length > 0) {
    const total = stats[0].totalReviews;
    const avg = Math.round(stats[0].averageRating * 10) / 10; // Round to 1 decimal place

    await Product.findByIdAndUpdate(productId, {
      averageRating: avg,
      totalReviews: total
    });

    return { totalReviews: total, averageRating: avg };
  } else {
    await Product.findByIdAndUpdate(productId, {
      averageRating: 0,
      totalReviews: 0
    });

    return { totalReviews: 0, averageRating: 0 };
  }
};

export const Review = mongoose.model('Review', reviewSchema);
