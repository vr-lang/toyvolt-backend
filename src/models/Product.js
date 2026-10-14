import mongoose from 'mongoose';
import { paiseToRupees } from '../utils/money.js';

const productImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, default: '' },
  isPrimary: { type: Boolean, default: false }
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters']
  },
  slug: {
    type: String,
    required: [true, 'Product slug is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  sku: {
    type: String,
    required: [true, 'Product SKU is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    required: [true, 'Product description is required']
  },
  category: {
    type: String,
    default: 'Remote Control Cars',
    trim: true
  },
  images: [productImageSchema],
  sellingPrice: {
    type: Number,
    required: [true, 'Selling price is required in integer paise'],
    min: [1, 'Price must be positive']
  },
  compareAtPrice: {
    type: Number,
    min: [1, 'Compare-at price must be positive'],
    default: null
  },
  costPrice: {
    type: Number,
    min: [1, 'Cost price must be positive'],
    default: null // Admin only
  },
  availableStock: {
    type: Number,
    required: [true, 'Available stock is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  reservedStock: {
    type: Number,
    min: [0, 'Reserved stock cannot be negative'],
    default: 0
  },
  // Physical parameters for Shiprocket logistics
  weightGrams: {
    type: Number,
    required: [true, 'Weight in grams is required for logistics calculation'],
    min: 1
  },
  dimensions: {
    lengthCm: { type: Number, required: true, min: 1 },
    breadthCm: { type: Number, required: true, min: 1 },
    heightCm: { type: Number, required: true, min: 1 }
  },
  specifications: {
    type: Map,
    of: String,
    default: {}
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals for rupee representation
productSchema.virtual('sellingPriceInRupees').get(function () {
  return paiseToRupees(this.sellingPrice);
});

productSchema.virtual('compareAtPriceInRupees').get(function () {
  return this.compareAtPrice ? paiseToRupees(this.compareAtPrice) : null;
});

// Virtual for in-stock check
productSchema.virtual('isInStock').get(function () {
  return this.availableStock > 0;
});

export const Product = mongoose.model('Product', productSchema);
