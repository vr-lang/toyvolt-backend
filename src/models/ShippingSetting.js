import mongoose from 'mongoose';

const shippingSettingSchema = new mongoose.Schema(
  {
    isShippingFeeEnabled: {
      type: Boolean,
      default: false
    },
    standardShippingFeeRupees: {
      type: Number,
      default: 0,
      min: 0
    },
    standardShippingFeePaise: {
      type: Number,
      default: 0,
      min: 0
    },
    freeShippingThresholdRupees: {
      type: Number,
      default: 0,
      min: 0
    },
    freeShippingThresholdPaise: {
      type: Number,
      default: 0,
      min: 0
    },
    description: {
      type: String,
      default: 'Free standard shipping across India on all orders'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const ShippingSetting = mongoose.model('ShippingSetting', shippingSettingSchema);
