import { Order } from '../models/Order.js';
import { Shipment } from '../models/Shipment.js';
import { ShippingSetting } from '../models/ShippingSetting.js';
import { shiprocketService } from '../services/shiprocketService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const getOrderTracking = asyncHandler(async (req, res) => {
  const { id: orderId } = req.params;

  let order = await Order.findById(orderId);
  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  if (req.user.role !== 'admin' && order.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Forbidden: Access denied to this order tracking.', 403);
  }

  let shipment = await Shipment.findOne({ orderId: order._id });
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

  const shouldSync = shipment.status !== 'DELIVERED' || req.query.refresh === 'true' || !shipment.awbCode;
  let liveTracking = null;

  if (shouldSync) {
    try {
      const syncResult = await shiprocketService.syncShipment(shipment, {
        force: req.query.refresh === 'true'
      });
      shipment = syncResult.shipment || shipment;
      order = syncResult.order || order;
      liveTracking = syncResult.liveTracking || null;
    } catch (err) {
      logger.warn(`Could not sync shipment tracking for order ${order.orderNumber}: ${err.message}`);
    }
  }

  if (!liveTracking && shipment.awbCode) {
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
        deliveredAt: shipment.deliveredAt,
        trackingUrl: shipment.trackingUrl,
        labelUrl: shipment.labelUrl,
        trackingHistory: shipment.trackingHistory,
        lastSyncedAt: shipment.lastSyncedAt
      },
      liveTracking
    }
  });
});

export const refreshCustomerOrderTracking = asyncHandler(async (req, res) => {
  const { id: orderId } = req.params;

  let order = await Order.findById(orderId);
  if (!order) {
    throw new AppError('Order not found.', 404);
  }

  if (req.user.role !== 'admin' && order.userId.toString() !== req.user._id.toString()) {
    throw new AppError('Forbidden: Access denied to this order tracking.', 403);
  }

  let shipment = await Shipment.findOne({ orderId: order._id });
  if (!shipment) {
    return res.status(200).json({
      success: true,
      message: 'Shipment has not been created yet.',
      data: {
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        shipment: null
      }
    });
  }

  const syncResult = await shiprocketService.syncShipment(shipment, { force: true });
  shipment = syncResult.shipment || shipment;
  order = syncResult.order || order;

  res.status(200).json({
    success: true,
    message: 'Shipment telemetry refreshed successfully.',
    data: {
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      shipment: {
        awbCode: shipment.awbCode,
        courierName: shipment.courierName,
        status: shipment.status,
        deliveredAt: shipment.deliveredAt,
        trackingUrl: shipment.trackingUrl,
        labelUrl: shipment.labelUrl,
        trackingHistory: shipment.trackingHistory,
        lastSyncedAt: shipment.lastSyncedAt
      },
      liveTracking: syncResult.liveTracking
    }
  });
});

export const handleShiprocketWebhook = asyncHandler(async (req, res) => {
  const event = req.body;
  logger.info('Received Shiprocket webhook event:', {
    awb: event?.awb || event?.awb_code,
    order_id: event?.order_id,
    current_status: event?.current_status || event?.status
  });

  // Optional API key / secret verification if configured
  const webhookSecret = process.env.SHIPROCKET_WEBHOOK_SECRET;
  if (webhookSecret) {
    const incomingHeader =
      req.headers['x-api-key'] || req.headers['x-shiprocket-token'] || req.headers['authorization'];
    if (!incomingHeader || incomingHeader !== webhookSecret) {
      logger.warn('Unauthorized Shiprocket webhook attempt received.');
      return res.status(401).json({ status: 'unauthorized', message: 'Invalid webhook token' });
    }
  }

  const awbCode = event?.awb || event?.awb_code;
  const srOrderId = event?.sr_order_id;
  const rawOrderId = event?.order_id;
  const srShipmentId = event?.shipment_id;

  // Multi-strategy shipment identification
  let shipment = null;
  if (awbCode) {
    shipment = await Shipment.findOne({ awbCode: String(awbCode).trim() });
  }

  if (!shipment && srOrderId) {
    shipment = await Shipment.findOne({ shiprocketOrderId: String(srOrderId).trim() });
  }

  if (!shipment && rawOrderId) {
    const order = await Order.findOne({ orderNumber: String(rawOrderId).trim() });
    if (order) {
      shipment = await Shipment.findOne({ orderId: order._id });
    } else {
      shipment = await Shipment.findOne({ shiprocketOrderId: String(rawOrderId).trim() });
    }
  }

  if (!shipment && srShipmentId) {
    shipment = await Shipment.findOne({ shiprocketShipmentId: String(srShipmentId).trim() });
  }

  if (shipment) {
    await shiprocketService.syncShipment(shipment, {
      webhookPayload: event
    });
    logger.info(`Shiprocket webhook successfully processed for shipment ${shipment._id}`);
    return res.status(200).json({ status: 'ok', matched: true, shipmentId: shipment._id });
  }

  logger.warn('Shiprocket webhook received but no matching shipment found in database:', {
    awbCode,
    srOrderId,
    rawOrderId,
    srShipmentId
  });

  res.status(200).json({ status: 'ok', matched: false });
});

export const getShippingSettings = asyncHandler(async (req, res) => {
  let settings = await ShippingSetting.findOne().sort({ createdAt: -1 });
  if (!settings) {
    settings = await ShippingSetting.create({
      isShippingFeeEnabled: false,
      standardShippingFeeRupees: 0,
      standardShippingFeePaise: 0,
      freeShippingThresholdRupees: 0,
      freeShippingThresholdPaise: 0,
      description: 'Free shipping on all orders across India'
    });
  }

  res.status(200).json({
    success: true,
    data: { settings }
  });
});

export const updateShippingSettings = asyncHandler(async (req, res) => {
  const {
    isShippingFeeEnabled,
    standardShippingFeeRupees = 0,
    freeShippingThresholdRupees = 0,
    description
  } = req.body;

  const feeRupees = Math.max(0, Number(standardShippingFeeRupees) || 0);
  const thresholdRupees = Math.max(0, Number(freeShippingThresholdRupees) || 0);
  const isEnabled = Boolean(isShippingFeeEnabled) && feeRupees > 0;

  let settings = await ShippingSetting.findOne().sort({ createdAt: -1 });
  if (!settings) {
    settings = new ShippingSetting();
  }

  settings.isShippingFeeEnabled = isEnabled;
  settings.standardShippingFeeRupees = isEnabled ? feeRupees : 0;
  settings.standardShippingFeePaise = isEnabled ? feeRupees * 100 : 0;
  settings.freeShippingThresholdRupees = isEnabled ? thresholdRupees : 0;
  settings.freeShippingThresholdPaise = isEnabled ? thresholdRupees * 100 : 0;
  if (description) settings.description = description;
  if (req.user?._id) settings.updatedBy = req.user._id;

  await settings.save();

  logger.info(
    `Shipping settings updated: enabled=${settings.isShippingFeeEnabled}, fee=₹${settings.standardShippingFeeRupees}, threshold=₹${settings.freeShippingThresholdRupees}`
  );

  res.status(200).json({
    success: true,
    message: settings.isShippingFeeEnabled
      ? `Shipping fee set to ₹${settings.standardShippingFeeRupees} (Free over ₹${settings.freeShippingThresholdRupees})`
      : 'Shipping fee removed. 100% Free Shipping enabled across all orders.',
    data: { settings }
  });
});

