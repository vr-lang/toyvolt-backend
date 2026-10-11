import { productService } from '../services/productService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getProducts = asyncHandler(async (req, res) => {
  const result = await productService.getProducts({
    ...req.query,
    isAdmin: false
  });

  res.status(200).json({
    success: true,
    data: result
  });
});

export const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug, false);

  res.status(200).json({
    success: true,
    data: { product }
  });
});

export const getCategories = asyncHandler(async (req, res) => {
  const categories = await productService.getCategories();

  res.status(200).json({
    success: true,
    data: { categories }
  });
});
