import mongoose from 'mongoose';
import { paiseToRupees } from '../utils/money.js';

const paymentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  razorpayOrderId: {
    type: String,
    required: true,
    index: true
  },
  razorpayPaymentId: {
    type: String,
    default: null,
    index: true
  },
  razorpaySignature: {
    type: String,
    default: null
  },
  amount: {
    type: Number,
    required: true, // in integer paise
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['created', 'authorized', 'captured', 'failed', 'refunded'],
    default: 'created',
    index: true
  },
  method: {
    type: String,
    default: null
  },
  errorCode: {
    type: String,
    default: null
  },
  errorDescription: {
    type: String,
    default: null
  },
  rawWebhookEvents: [{
    eventId: { type: String, required: true },
    event: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
    payload: { type: mongoose.Schema.Types.Mixed }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

paymentSchema.virtual('amountInRupees').get(function () {
  return paiseToRupees(this.amount);
});

export const Payment = mongoose.model('Payment', paymentSchema);
