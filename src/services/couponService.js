import { Coupon } from '../models/Coupon.js';
import { AppError } from '../utils/AppError.js';
import { calculateDiscount, paiseToRupees } from '../utils/money.js';

class CouponService {
  async validateCoupon({ code, subtotal, userId }) {
    if (!code) {
      throw new AppError('Coupon code is required.', 400);
    }

    const normalizedCode = code.toUpperCase().trim();
    const coupon = await Coupon.findOne({ code: normalizedCode });

    if (!coupon || !coupon.isActive) {
      throw new AppError('Invalid or inactive coupon code.', 404);
    }

    const now = new Date();
    if (now < new Date(coupon.startDate)) {
      throw new AppError('This coupon is not active yet.', 400);
    }

    if (now > new Date(coupon.expiryDate)) {
      throw new AppError('This coupon has expired.', 400);
    }

    // Check global usage limit
    if (coupon.globalUsageLimit !== null && coupon.usedCount >= coupon.globalUsageLimit) {
      throw new AppError('This coupon has reached its maximum global redemption limit.', 400);
    }

    // Check per-customer usage limit
    if (userId) {
      const userUsage = coupon.usedBy.find(u => u.userId.toString() === userId.toString());
      if (userUsage && userUsage.count >= coupon.perCustomerLimit) {
        throw new AppError(`You have already used this coupon the maximum allowed number of times (${coupon.perCustomerLimit}).`, 400);
      }
    }

    // Check minimum order value
    if (subtotal < coupon.minOrderValue) {
      const minRupees = paiseToRupees(coupon.minOrderValue);
      throw new AppError(`Minimum order value to apply this coupon is ₹${minRupees}.`, 400);
    }

    const discountAmountPaise = calculateDiscount(subtotal, coupon);
    const finalAmountPaise = Math.max(0, subtotal - discountAmountPaise);

    return {
      isValid: true,
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue
      },
      subtotal,
      subtotalInRupees: paiseToRupees(subtotal),
      discountAmount: discountAmountPaise,
      discountAmountInRupees: paiseToRupees(discountAmountPaise),
      finalAmount: finalAmountPaise,
      finalAmountInRupees: paiseToRupees(finalAmountPaise)
    };
  }

  /**
   * Atomically marks a coupon as redeemed after verified order placement.
   */
  async redeemCoupon(code, userId) {
    if (!code) return;
    const normalizedCode = code.toUpperCase().trim();

    const coupon = await Coupon.findOne({ code: normalizedCode });
    if (!coupon) return;

    // Concurrency-safe atomic increment
    await Coupon.findOneAndUpdate(
      {
        _id: coupon._id,
        $or: [
          { globalUsageLimit: null },
          { $expr: { $lt: ['$usedCount', '$globalUsageLimit'] } }
        ]
      },
      {
        $inc: { usedCount: 1 }
      }
    );

    // Record user-specific redemption count
    if (userId) {
      const userUsageIndex = coupon.usedBy.findIndex(u => u.userId.toString() === userId.toString());
      if (userUsageIndex > -1) {
        coupon.usedBy[userUsageIndex].count += 1;
      } else {
        coupon.usedBy.push({ userId, count: 1 });
      }
      await coupon.save();
    }
  }

  // Admin CRUD methods
  async getAllCoupons() {
    return Coupon.find().sort({ createdAt: -1 });
  }

  async createCoupon(data) {
    const existing = await Coupon.findOne({ code: data.code.toUpperCase() });
    if (existing) {
      throw new AppError(`Coupon code "${data.code}" already exists.`, 409);
    }
    return Coupon.create({
      ...data,
      code: data.code.toUpperCase()
    });
  }

  async updateCoupon(id, data) {
    if (data.code) {
      const existing = await Coupon.findOne({
        code: data.code.toUpperCase(),
        _id: { $ne: id }
      });
      if (existing) throw new AppError(`Coupon code "${data.code}" already exists.`, 409);
      data.code = data.code.toUpperCase();
    }

    const updated = await Coupon.findByIdAndUpdate(id, data, { new: true });
    if (!updated) throw new AppError('Coupon not found.', 404);
    return updated;
  }
}

export const couponService = new CouponService();
