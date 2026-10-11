import { z } from 'zod';

export const validateCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').trim(),
  subtotal: z.number().int().nonnegative('Subtotal in paise is required')
});

export const createCouponSchema = z.object({
  code: z.string().min(2).max(30).toUpperCase().trim(),
  description: z.string().optional().default(''),
  discountType: z.enum(['flat', 'percentage']),
  discountValue: z.number().int().positive('Discount value must be positive'),
  minOrderValue: z.number().int().nonnegative().default(0),
  maxDiscountValue: z.number().int().positive().nullable().optional(),
  expiryDate: z.string().datetime().or(z.date()),
  globalUsageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().default(1),
  isActive: z.boolean().default(true)
});

export const updateCouponSchema = createCouponSchema.partial();
