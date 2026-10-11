import mongoose from 'mongoose';
import { paiseToRupees } from '../utils/money.js';

const orderItemSnapshotSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  sku: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  unitPrice: {
    type: Number,
    required: true, // in integer paise
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  total: {
    type: Number,
    required: true, // unitPrice * quantity in integer paise
    min: 0
  }
}, { _id: false });

const shippingAddressSnapshotSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  addressLine1: { type: String, required: true },
  addressLine2: { type: String, default: '' },
  city: { type: String, required: true },
  state: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, default: 'India' }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  items: [orderItemSnapshotSchema],
  shippingAddress: shippingAddressSnapshotSchema,
  
  // Amounts strictly in integer paise
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  shippingFee: {
    type: Number,
    default: 0,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  finalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  couponCode: {
    type: String,
    default: null,
    uppercase: true,
    trim: true
  },
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'cod'],
    default: 'razorpay'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
    default: 'pending',
    index: true
  },
  orderStatus: {
    type: String,
    enum: ['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'placed',
    index: true
  },
  cancellationReason: {
    type: String,
    default: null
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null
  },
  shipmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipment',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals for rupees
orderSchema.virtual('finalAmountInRupees').get(function () {
  return paiseToRupees(this.finalAmount);
});

orderSchema.virtual('subtotalInRupees').get(function () {
  return paiseToRupees(this.subtotal);
});

orderSchema.virtual('discountAmountInRupees').get(function () {
  return paiseToRupees(this.discountAmount);
});

export const Order = mongoose.model('Order', orderSchema);
