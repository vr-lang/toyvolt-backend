import { couponService } from '../services/couponService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const validateCoupon = asyncHandler(async (req, res) => {
  const { code, subtotal } = req.body;
  const userId = req.user ? req.user._id : null;

  const result = await couponService.validateCoupon({
    code,
    subtotal,
    userId
  });

  res.status(200).json({
    success: true,
    data: result
  });
});
