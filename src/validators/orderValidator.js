import { z } from 'zod';

const shippingAddressSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  addressLine1: z.string().min(3, 'Address line 1 is required'),
  addressLine2: z.string().optional().default(''),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  postalCode: z.string().min(5, 'Valid postal code is required'),
  country: z.string().default('India')
});

export const createOrderSchema = z.object({
  shippingAddress: shippingAddressSchema,
  couponCode: z.string().optional().nullable(),
  paymentMethod: z.enum(['razorpay', 'cod']).default('razorpay'),
  // Optional direct purchase items (if bypassing cart, e.g. "Buy Now" button)
  directItems: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive()
  })).optional()
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(3, 'Cancellation reason is required')
});

export const updateOrderStatusSchema = z.object({
  orderStatus: z.enum(['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
  cancellationReason: z.string().optional()
});
