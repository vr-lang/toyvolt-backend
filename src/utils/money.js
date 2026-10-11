/**
 * Standard Monetary Utilities for Toyvolt
 * All internal and database amounts are strictly stored as integer paise (1 INR = 100 paise).
 */

export const paiseToRupees = (paise) => {
  if (typeof paise !== 'number' || isNaN(paise)) return 0;
  return Number((paise / 100).toFixed(2));
};

export const rupeesToPaise = (rupees) => {
  if (typeof rupees !== 'number' || isNaN(rupees)) return 0;
  return Math.round(rupees * 100);
};

export const formatCurrency = (paise) => {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(rupees);
};

export const calculateDiscount = (subtotalPaise, coupon) => {
  if (!coupon || !coupon.isActive) return 0;

  if (coupon.minOrderValue && subtotalPaise < coupon.minOrderValue) {
    return 0;
  }

  let discountPaise = 0;

  if (coupon.discountType === 'flat') {
    discountPaise = coupon.discountValue; // already in paise
  } else if (coupon.discountType === 'percentage') {
    // percentage calculation
    discountPaise = Math.round((subtotalPaise * coupon.discountValue) / 100);
  }

  if (coupon.maxDiscountValue && discountPaise > coupon.maxDiscountValue) {
    discountPaise = coupon.maxDiscountValue;
  }

  // Discount can never exceed subtotal
  return Math.min(discountPaise, subtotalPaise);
};
