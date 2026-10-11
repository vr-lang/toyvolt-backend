import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Cart } from '../models/Cart.js';
import { Payment } from '../models/Payment.js';
import { couponService } from './couponService.js';
import { cartService } from './cartService.js';
import { emailService } from './emailService.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const FREE_SHIPPING_THRESHOLD_PAISE = 99900; // ₹999
const STANDARD_SHIPPING_FEE_PAISE = 9900;    // ₹99

class OrderService {
  /**
   * Generates readable order number: TV-YYYYMMDD-XXXX
   */
  generateOrderNumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `TV-${dateStr}-${randomSuffix}`;
  }

  /**
   * Creates pending order with atomic inventory reservation
   */
  async createOrder({ userId, shippingAddress, couponCode, paymentMethod = 'razorpay', directItems }) {
    let itemsToProcess = [];

    // 1. Determine items (either direct purchase or from cart)
    if (directItems && directItems.length > 0) {
      itemsToProcess = directItems;
    } else {
      const userCart = await Cart.findOne({ userId });
      if (!userCart || userCart.items.length === 0) {
        throw new AppError('Your cart is empty. Cannot place order.', 400);
      }
      itemsToProcess = userCart.items;
    }

    const reservedProducts = [];
    const itemSnapshots = [];
    let subtotalPaise = 0;

    try {
      // 2. Concurrency-safe atomic inventory reservation
      for (const item of itemsToProcess) {
        const productId = item.productId._id || item.productId;
        const quantity = item.quantity;

        // Atomically decrement availableStock and increment reservedStock
        const reservedProduct = await Product.findOneAndUpdate(
          {
            _id: productId,
            isActive: true,
            isArchived: false,
            availableStock: { $gte: quantity }
          },
          {
            $inc: {
              availableStock: -quantity,
              reservedStock: quantity
            }
          },
          { new: true }
        );

        if (!reservedProduct) {
          const productCheck = await Product.findById(productId);
          const name = productCheck ? productCheck.name : 'Item';
          const stock = productCheck ? productCheck.availableStock : 0;
          throw new AppError(`Insufficient stock for "${name}". Only ${stock} left.`, 400);
        }

        reservedProducts.push({ productId, quantity });

        const itemTotal = reservedProduct.sellingPrice * quantity;
        subtotalPaise += itemTotal;

        itemSnapshots.push({
          productId: reservedProduct._id,
          name: reservedProduct.name,
          slug: reservedProduct.slug,
          sku: reservedProduct.sku,
          imageUrl: reservedProduct.images?.[0]?.url || '',
          unitPrice: reservedProduct.sellingPrice,
          quantity,
          total: itemTotal
        });
      }

      // 3. Calculate Coupon Discount if applied
      let discountAmountPaise = 0;
      let appliedCouponCode = null;

      if (couponCode) {
        const couponValidation = await couponService.validateCoupon({
          code: couponCode,
          subtotal: subtotalPaise,
          userId
        });
        discountAmountPaise = couponValidation.discountAmount;
        appliedCouponCode = couponValidation.coupon.code;
      }

      // 4. Calculate Shipping Fee
      const shippingFeePaise = subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : STANDARD_SHIPPING_FEE_PAISE;

      // 5. Calculate Final Payable Amount
      const finalAmountPaise = Math.max(0, subtotalPaise - discountAmountPaise + shippingFeePaise);

      // 6. Create Order document
      const order = await Order.create({
        orderNumber: this.generateOrderNumber(),
        userId,
        items: itemSnapshots,
        shippingAddress,
        subtotal: subtotalPaise,
        discountAmount: discountAmountPaise,
        shippingFee: shippingFeePaise,
        taxAmount: 0,
        finalAmount: finalAmountPaise,
        couponCode: appliedCouponCode,
        paymentMethod,
        paymentStatus: 'pending',
        orderStatus: 'placed'
      });

      return order;
    } catch (error) {
      // Rollback any reserved stock on checkout failure
      for (const resItem of reservedProducts) {
        await Product.updateOne(
          { _id: resItem.productId },
          {
            $inc: {
              availableStock: resItem.quantity,
              reservedStock: -resItem.quantity
            }
          }
        ).catch(err => logger.error('Failed to rollback reservation:', err));
      }
      throw error;
    }
  }

  /**
   * Finalizes paid order idempotently (converts reserved stock to permanently consumed)
   */
  async finalizeOrderPayment({ orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature, rawEvent = null }) {
    const order = await Order.findById(orderId).populate('userId');
    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    // Idempotency check: if order is already paid, return without duplicating stock deductions
    if (order.paymentStatus === 'paid') {
      logger.info(`Order ${order.orderNumber} is already marked as paid. Skipping duplicate processing.`);
      return order;
    }

    // 1. Permanently deduct reserved stock
    for (const item of order.items) {
      await Product.updateOne(
        { _id: item.productId },
        {
          $inc: { reservedStock: -item.quantity }
        }
      );
    }

    // 2. Create or update Payment record
    let payment = await Payment.findOne({ orderId: order._id });
    if (!payment) {
      payment = await Payment.create({
        orderId: order._id,
        razorpayOrderId: razorpayOrderId || 'N/A',
        razorpayPaymentId,
        razorpaySignature,
        amount: order.finalAmount,
        currency: 'INR',
        status: 'captured',
        rawWebhookEvents: rawEvent ? [rawEvent] : []
      });
    } else {
      payment.status = 'captured';
      payment.razorpayPaymentId = razorpayPaymentId || payment.razorpayPaymentId;
      payment.razorpaySignature = razorpaySignature || payment.razorpaySignature;
      if (rawEvent) payment.rawWebhookEvents.push(rawEvent);
      await payment.save();
    }

    // 3. Update Order status
    order.paymentStatus = 'paid';
    order.orderStatus = 'confirmed';
    order.paymentId = payment._id;
    await order.save();

    // 4. Clear Customer's Cart
    await cartService.clearCart(order.userId._id).catch(() => {});

    // 5. Redeem coupon if applied
    if (order.couponCode) {
      await couponService.redeemCoupon(order.couponCode, order.userId._id).catch(() => {});
    }

    // 6. Send confirmation email asynchronously
    emailService.sendOrderConfirmation({
      email: order.userId.email,
      user: order.userId,
      order
    }).catch(err => logger.error('Order confirmation email failed:', err));

    return order;
  }

  /**
   * Cancels order and safely restores stock
   */
  async cancelOrder({ orderId, userId, reason, isAdmin = false }) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (!isAdmin && order.userId.toString() !== userId.toString()) {
      throw new AppError('You are not authorized to cancel this order.', 403);
    }

    if (order.orderStatus === 'cancelled') {
      throw new AppError('Order is already cancelled.', 400);
    }

    if (order.orderStatus === 'shipped' || order.orderStatus === 'delivered') {
      throw new AppError(`Cannot cancel order that is already ${order.orderStatus}.`, 400);
    }

    // Release inventory based on payment state
    if (order.paymentStatus === 'pending') {
      // Stock was only reserved
      for (const item of order.items) {
        await Product.updateOne(
          { _id: item.productId },
          {
            $inc: {
              availableStock: item.quantity,
              reservedStock: -item.quantity
            }
          }
        );
      }
    } else if (order.paymentStatus === 'paid') {
      // Stock was committed, restore to available
      for (const item of order.items) {
        await Product.updateOne(
          { _id: item.productId },
          {
            $inc: { availableStock: item.quantity }
          }
        );
      }
    }

    order.orderStatus = 'cancelled';
    order.cancellationReason = reason || 'Cancelled by user';
    await order.save();

    return order;
  }

  async getOrderById(orderId, userId, isAdmin = false) {
    const order = await Order.findById(orderId)
      .populate('userId', 'name email')
      .populate('paymentId')
      .populate('shipmentId');

    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (!isAdmin && order.userId._id.toString() !== userId.toString()) {
      throw new AppError('You are not authorized to view this order.', 403);
    }

    return order;
  }

  async getMyOrders(userId, { page = 1, limit = 10 }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('shipmentId', 'awbCode status trackingUrl courierName'),
      Order.countDocuments({ userId })
    ]);

    return {
      orders,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    };
  }
}

export const orderService = new OrderService();
