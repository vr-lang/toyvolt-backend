import mongoose from 'mongoose';
import { paiseToRupees } from '../utils/money.js';

const couponUserUsageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  count: {
    type: Number,
    default: 1
  }
}, { _id: false });

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  discountType: {
    type: String,
    required: true,
    enum: ['flat', 'percentage']
  },
  discountValue: {
    type: Number,
    required: true, // in paise if flat (e.g. 10000 = ₹100), or percentage (e.g. 10 = 10%)
    min: 1
  },
  minOrderValue: {
    type: Number,
    default: 0, // in integer paise
    min: 0
  },
  maxDiscountValue: {
    type: Number,
    default: null, // in integer paise, applicable for percentage coupons
    min: 0
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: true,
    index: true
  },
  globalUsageLimit: {
    type: Number,
    default: null // null means unlimited
  },
  usedCount: {
    type: Number,
    default: 0
  },
  perCustomerLimit: {
    type: Number,
    default: 1
  },
  usedBy: [couponUserUsageSchema],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  productRestrictions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

couponSchema.virtual('discountValueInRupees').get(function () {
  return this.discountType === 'flat' ? paiseToRupees(this.discountValue) : null;
});

couponSchema.virtual('minOrderValueInRupees').get(function () {
  return paiseToRupees(this.minOrderValue);
});

export const Coupon = mongoose.model('Coupon', couponSchema);
