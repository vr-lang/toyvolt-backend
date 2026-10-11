import { cartService } from '../services/cartService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getCart = asyncHandler(async (req, res) => {
  const cart = await cartService.getCart(req.user._id);
  res.status(200).json({
    success: true,
    data: { cart }
  });
});

export const addToCart = asyncHandler(async (req, res) => {
  const cart = await cartService.addItem(req.user._id, req.body);
  res.status(200).json({
    success: true,
    message: 'Item added to cart.',
    data: { cart }
  });
});

export const updateCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  const cart = await cartService.updateItemQuantity(req.user._id, productId, quantity);

  res.status(200).json({
    success: true,
    message: 'Cart updated.',
    data: { cart }
  });
});

export const removeCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const cart = await cartService.removeItem(req.user._id, productId);

  res.status(200).json({
    success: true,
    message: 'Item removed from cart.',
    data: { cart }
  });
});

export const clearCart = asyncHandler(async (req, res) => {
  const cart = await cartService.clearCart(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Cart cleared.',
    data: { cart }
  });
});
