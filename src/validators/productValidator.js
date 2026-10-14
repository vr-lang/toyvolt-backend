import { z } from 'zod';

const baseProductSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().min(2).toLowerCase().trim(),
  sku: z.string().min(2).toUpperCase().trim(),
  description: z.string().min(10),
  category: z.string().default('Remote Control Cars'),
  sellingPrice: z.number().int().positive('Selling price must be in integer paise and positive'),
  compareAtPrice: z.number().int().positive().nullable().optional(),
  costPrice: z.number().int().positive().nullable().optional(),
  availableStock: z.number().int().nonnegative('Stock cannot be negative'),
  weightGrams: z.number().positive('Weight in grams must be greater than 0'),
  dimensions: z.object({
    lengthCm: z.number().positive(),
    breadthCm: z.number().positive(),
    heightCm: z.number().positive()
  }),
  specifications: z.record(z.string()).optional().default({}),
  images: z.array(z.object({
    url: z.string().url(),
    publicId: z.string().optional().default(''),
    isPrimary: z.boolean().optional().default(false)
  })).optional().default([]),
  isActive: z.boolean().optional().default(true)
});

export const createProductSchema = baseProductSchema.refine(
  (data) => data.compareAtPrice == null || data.compareAtPrice >= data.sellingPrice,
  {
    message: 'Compare-at price must be greater than or equal to selling price',
    path: ['compareAtPrice']
  }
);

export const updateProductSchema = baseProductSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for product update'
  })
  .refine(
    (data) =>
      data.compareAtPrice == null ||
      data.sellingPrice == null ||
      data.compareAtPrice >= data.sellingPrice,
    {
      message: 'Compare-at price must be greater than or equal to selling price',
      path: ['compareAtPrice']
    }
  );

