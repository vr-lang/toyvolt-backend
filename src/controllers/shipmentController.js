import { Order } from '../models/Order.js';
import { Shipment } from '../models/Shipment.js';
import { shiprocketService } from '../services/shiprocketService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const getOrderTracking = asyncHandler(async (req, res) => {
  const { id: orderId } = req.params;

  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  if (req.user.role !== 'admin' && order.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Forbidden: Access denied to this order tracking.', 403);
  }

  const shipment = await Shipment.findOne({ orderId: order._id });
  if (!shipment) {
    return res.status(200).json({
      success: true,
      message: 'Shipment has not been dispatched yet.',
      data: {
        orderNumber: order.orderNumber,
        status: order.orderStatus,
        shipment: null
      }
    });
  }

  let liveTracking = null;
  if (shipment.awbCode) {
    try {
      liveTracking = await shiprocketService.getTracking(shipment.awbCode);
    } catch (err) {
      logger.warn(`Could not fetch live tracking for AWB ${shipment.awbCode}: ${err.message}`);
    }
  }

  res.status(200).json({
    success: true,
    data: {
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      shipment: {
        awbCode: shipment.awbCode,
        courierName: shipment.courierName,
        status: shipment.status,
        trackingUrl: shipment.trackingUrl,
        labelUrl: shipment.labelUrl,
        trackingHistory: shipment.trackingHistory
      },
      liveTracking
    }
  });
});

export const handleShiprocketWebhook = asyncHandler(async (req, res) => {
  const event = req.body;
  logger.info('Received Shiprocket webhook payload:', event);

  const awbCode = event?.awb || event?.awb_code;
  const currentStatus = event?.current_status || event?.status;

  if (awbCode && currentStatus) {
    const shipment = await Shipment.findOne({ awbCode });
    if (shipment) {
      shipment.status = currentStatus;
      shipment.rawWebhooks.push({
        event: currentStatus,
        receivedAt: new Date(),
        payload: event
      });

      if (event?.scans && Array.isArray(event.scans)) {
        shipment.trackingHistory = event.scans.map(s => ({
          status: s.status || currentStatus,
          activity: s.activity || '',
          date: s.date ? new Date(s.date) : new Date(),
          location: s.location || ''
        }));
      }

      await shipment.save();

      // If status is DELIVERED, update order status
      if (currentStatus.toUpperCase() === 'DELIVERED') {
        await Order.findByIdAndUpdate(shipment.orderId, { orderStatus: 'delivered' });
      } else if (currentStatus.toUpperCase() === 'IN_TRANSIT') {
        await Order.findByIdAndUpdate(shipment.orderId, { orderStatus: 'shipped' });
      }
    }
  }

  res.status(200).json({ status: 'ok' });
});
