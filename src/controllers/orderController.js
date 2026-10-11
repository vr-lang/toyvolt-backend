import { orderService } from '../services/orderService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder({
    userId: req.user._id,
    ...req.body
  });

  res.status(201).json({
    success: true,
    message: 'Order placed successfully. Please complete payment.',
    data: { order }
  });
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const result = await orderService.getMyOrders(req.user._id, req.query);

  res.status(200).json({
    success: true,
    data: result
  });
});

export const getOrderById = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id, req.user._id, req.user.role === 'admin');

  res.status(200).json({
    success: true,
    data: { order }
  });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder({
    orderId: req.params.id,
    userId: req.user._id,
    reason: req.body.reason,
    isAdmin: req.user.role === 'admin'
  });

  res.status(200).json({
    success: true,
    message: 'Order cancelled successfully. Stock has been restored.',
    data: { order }
  });
});
