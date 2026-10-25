import axios from 'axios';
import { env, hasShiprocket } from '../config/env.js';
import { Shipment } from '../models/Shipment.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { emailService } from './emailService.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { paiseToRupees } from '../utils/money.js';
import { mapShiprocketStatus, canTransitionShipmentStatus } from '../utils/shipmentStatusMapper.js';

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

class ShiprocketService {
  constructor() {
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Ensure authenticated token for Shiprocket API
   */
  async getAuthToken() {
    if (!hasShiprocket()) {
      throw new AppError(
        'Shiprocket is not configured. Please provide SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in your environment variables.',
        503
      );
    }

    // Return cached token if valid (valid for 10 days by default, re-auth if less than 1 hour remains)
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    try {
      logger.info('Authenticating with Shiprocket API...');
      const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
        email: env.SHIPROCKET_EMAIL,
        password: env.SHIPROCKET_PASSWORD
      });

      if (!response.data?.token) {
        throw new Error('No token returned in Shiprocket login response');
      }

      this.token = response.data.token;
      // Cache token for 9 days
      this.tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;
      return this.token;
    } catch (error) {
      logger.error('Shiprocket authentication failed:', error.response?.data || error.message);
      throw new AppError(`Shiprocket authentication failed: ${error.response?.data?.message || error.message}`, 502);
    }
  }

  /**
   * Helper to make authenticated requests to Shiprocket
   */
  async request(method, endpoint, data = null, params = null) {
    if (env.NODE_ENV === 'test' || !hasShiprocket()) {
      if (!hasShiprocket() && env.NODE_ENV !== 'test') {
        throw new AppError('Shiprocket service is unconfigured.', 503);
      }
      return this.getMockResponse(endpoint, data);
    }

    const token = await this.getAuthToken();
    try {
      const response = await axios({
        method,
        url: `${SHIPROCKET_BASE_URL}${endpoint}`,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data,
        params
      });
      return response.data;
    } catch (error) {
      const shiprocketError = error.response?.data?.message || error.message;
      logger.error(`Shiprocket API request error on [${method}] ${endpoint}:`, error.response?.data || error.message);
      throw new AppError(`Shiprocket Error: ${shiprocketError}`, error.response?.status || 502);
    }
  }

  /**
   * Fetch registered pickup locations from Shiprocket
   */
  async getPickupLocations() {
    if (!hasShiprocket()) {
      return [{
        pickup_location: 'work',
        city: 'Fatehabad',
        state: 'Haryana',
        pin_code: '125050',
        name: 'Primary Hub',
        is_primary_location: 1
      }];
    }

    try {
      const response = await this.request('GET', '/settings/company/pickup');
      const list = response?.data?.shipping_address || [];
      return list;
    } catch (err) {
      logger.warn(`Could not fetch Shiprocket pickup locations: ${err.message}`);
      return [];
    }
  }

  /**
   * Determine primary registered pickup location tag
   */
  async getDefaultPickupLocation() {
    if (env.SHIPROCKET_PICKUP_LOCATION && env.SHIPROCKET_PICKUP_LOCATION !== 'Primary') {
      return env.SHIPROCKET_PICKUP_LOCATION;
    }
    try {
      const locations = await this.getPickupLocations();
      const primary = locations.find(l => l.is_primary_location === 1) || locations[0];
      return primary?.pickup_location || 'work';
    } catch {
      return 'work';
    }
  }

  /**
   * Create shipment and assign courier for an order
   */
  async createShipmentForOrder(orderId) {
    const order = await Order.findById(orderId).populate('userId');
    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (order.paymentStatus !== 'paid' && order.paymentMethod !== 'cod') {
      throw new AppError('Cannot create shipment for unpaid order.', 400);
    }

    let existingShipment = await Shipment.findOne({ orderId: order._id });
    if (existingShipment && existingShipment.awbCode) {
      return existingShipment;
    }

    // 1. Calculate combined package weight and dimensions from items
    let totalWeightGrams = 0;
    let maxLengthCm = 15;
    let maxBreadthCm = 10;
    let maxHeightCm = 10;

    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      const weight = product?.weightGrams || 850;
      totalWeightGrams += weight * item.quantity;

      if (product?.dimensions) {
        maxLengthCm = Math.max(maxLengthCm, product.dimensions.lengthCm || 15);
        maxBreadthCm = Math.max(maxBreadthCm, product.dimensions.breadthCm || 10);
        maxHeightCm = Math.max(maxHeightCm, product.dimensions.heightCm || 10);
      }
    }

    const totalWeightKg = Math.max(0.1, Number((totalWeightGrams / 1000).toFixed(2)));

    // 2. Prepare payload for /orders/create/adhoc with dynamic registered pickup location
    const orderDate = new Date(order.createdAt).toISOString().slice(0, 19).replace('T', ' ');
    const resolvedPickupLocation = await this.getDefaultPickupLocation();

    const payload = {
      order_id: order.orderNumber,
      order_date: orderDate,
      pickup_location: resolvedPickupLocation,
      billing_customer_name: order.shippingAddress.fullName,
      billing_last_name: '',
      billing_address: order.shippingAddress.addressLine1,
      billing_address_2: order.shippingAddress.addressLine2 || '',
      billing_city: order.shippingAddress.city,
      billing_pincode: order.shippingAddress.postalCode,
      billing_state: order.shippingAddress.state,
      billing_country: order.shippingAddress.country || 'India',
      billing_email: order.userId.email,
      billing_phone: order.shippingAddress.phone,
      shipping_is_billing: true,
      order_items: order.items.map(i => ({
        name: i.name,
        sku: i.sku,
        units: i.quantity,
        selling_price: paiseToRupees(i.unitPrice),
        discount: 0,
        tax: 0
      })),
      payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
      sub_total: paiseToRupees(order.finalAmount),
      length: maxLengthCm,
      breadth: maxBreadthCm,
      height: maxHeightCm,
      weight: totalWeightKg
    };

    const createOrderResponse = await this.request('POST', '/orders/create/adhoc', payload);
    const shiprocketOrderId = createOrderResponse.order_id || `SR_${Date.now()}`;
    const shiprocketShipmentId = createOrderResponse.shipment_id || `SHP_${Date.now()}`;

    // 3. Assign AWB
    let awbCode = null;
    let courierName = null;
    try {
      const awbResponse = await this.request('POST', '/courier/assign/awb', {
        shipment_id: shiprocketShipmentId
      });
      awbCode = awbResponse?.response?.data?.awb_code || null;
      courierName = awbResponse?.response?.data?.courier_name || null;
    } catch (awbError) {
      logger.warn(`AWB assignment can be completed later or in dashboard: ${awbError.message}`);
    }

    // 4. Save or update Shipment record
    if (!existingShipment) {
      existingShipment = await Shipment.create({
        orderId: order._id,
        shiprocketOrderId,
        shiprocketShipmentId,
        awbCode,
        courierName,
        pickupLocation: resolvedPickupLocation,
        status: awbCode ? 'AWB_ASSIGNED' : 'CREATED',
        trackingUrl: awbCode ? `https://shiprocket.co/tracking/${awbCode}` : null
      });
    } else {
      existingShipment.shiprocketOrderId = shiprocketOrderId;
      existingShipment.shiprocketShipmentId = shiprocketShipmentId;
      existingShipment.awbCode = awbCode || existingShipment.awbCode;
      existingShipment.courierName = courierName || existingShipment.courierName;
      existingShipment.status = awbCode ? 'AWB_ASSIGNED' : existingShipment.status;
      if (awbCode) {
        existingShipment.trackingUrl = `https://shiprocket.co/tracking/${awbCode}`;
      }
      await existingShipment.save();
    }

    // Link shipment back to order
    order.shipmentId = existingShipment._id;
    order.orderStatus = 'processing';
    await order.save();

    // Send dispatch update email if AWB was assigned
    if (awbCode) {
      emailService.sendShippingUpdate({
        email: order.userId.email,
        order,
        shipment: existingShipment
      }).catch(err => logger.error('Failed to send shipping email:', err));
    }

    return existingShipment;
  }

  /**
   * Request tracking updates from Shiprocket
   */
  async getTracking(awbCode) {
    if (!awbCode) {
      throw new AppError('AWB code is required for tracking.', 400);
    }

    const trackResponse = await this.request('GET', `/courier/track/awb/${awbCode}`);
    return trackResponse;
  }

  /**
   * Synchronize a shipment with verified Shiprocket tracking data.
   * Updates shipment status, AWB, scans, deliveredAt, and updates parent order status.
   * Strictly enforces status transition precedence and preserves payment status.
   */
  async syncShipment(shipmentOrId, options = {}) {
    let shipment = typeof shipmentOrId === 'string' ? await Shipment.findById(shipmentOrId) : shipmentOrId;
    if (!shipment) {
      throw new AppError('Shipment not found.', 404);
    }

    const order = await Order.findById(shipment.orderId);
    if (!order) {
      throw new AppError('Order associated with shipment not found.', 404);
    }

    // Fast return if already delivered and not forced
    if (shipment.status === 'DELIVERED' && order.orderStatus === 'delivered' && !options.force) {
      return { shipment, order, updated: false };
    }

    let awbCode = shipment.awbCode || null;
    let courierName = shipment.courierName || null;
    let rawStatus = null;
    let rawStatusCode = null;
    let deliveredDate = null;
    let scans = [];
    let liveTracking = null;

    // A. Check if webhook payload is provided directly
    if (options.webhookPayload) {
      const p = options.webhookPayload;
      rawStatus = p.current_status || p.status || null;
      rawStatusCode = p.current_status_id || p.status_code || null;
      awbCode = p.awb || p.awb_code || awbCode;
      courierName = p.courier_name || courierName;
      deliveredDate = p.delivered_date || null;
      scans = p.scans || p.activities || [];
    }

    // B. Live Shiprocket API Lookup (if configured and live)
    const isLive = hasShiprocket() && env.NODE_ENV !== 'test';
    if (isLive && (!options.webhookPayload || !awbCode)) {
      // Step 1: If AWB code is missing, query Shiprocket Order endpoint
      if (!awbCode && shipment.shiprocketOrderId) {
        try {
          const orderResponse = await this.request('GET', `/orders/show/${shipment.shiprocketOrderId}`);
          const shipData = Array.isArray(orderResponse?.data?.shipments)
            ? orderResponse.data.shipments[0]
            : orderResponse?.data?.shipments;

          if (shipData?.awb) {
            awbCode = shipData.awb;
            courierName = shipData.courier || courierName;
          }
          if (orderResponse?.data?.status) {
            rawStatus = orderResponse.data.status;
            rawStatusCode = orderResponse.data.status_code;
          }
          if (shipData?.delivered_date) {
            deliveredDate = shipData.delivered_date;
          }
        } catch (srOrderErr) {
          logger.warn(`Could not fetch Shiprocket order details for #${shipment.shiprocketOrderId}: ${srOrderErr.message}`);
        }
      }

      // Step 2: Fetch detailed tracking from courier AWB endpoint
      if (awbCode) {
        try {
          liveTracking = await this.getTracking(awbCode);
          const trackData = liveTracking?.tracking_data;
          const trackItem = trackData?.shipment_track?.[0];

          if (trackItem) {
            rawStatus = trackItem.current_status || rawStatus;
            rawStatusCode = trackItem.current_status_id || trackData?.shipment_status || rawStatusCode;
            courierName = trackItem.courier_name || courierName;
            if (trackItem.delivered_date) {
              deliveredDate = trackItem.delivered_date;
            }
          }

          scans = trackData?.shipment_track_activities || trackItem?.scans || scans;
        } catch (srTrackErr) {
          logger.warn(`Could not fetch live tracking for AWB ${awbCode}: ${srTrackErr.message}`);
        }
      }
    } else if (env.NODE_ENV === 'test' && !hasShiprocket() && !options.webhookPayload) {
      // Mock tracking behavior for test runner
      if (!awbCode) {
        awbCode = 'MOCK_AWB_14326361864278';
        courierName = 'Xpressbees Surface 2kg';
      }
      liveTracking = this.getMockResponse('/courier/track/awb');
      const trackData = liveTracking?.tracking_data;
      const trackItem = trackData?.shipment_track?.[0];
      rawStatus = options.mockStatus || trackItem?.current_status || 'IN_TRANSIT';
      rawStatusCode = options.mockStatusCode || trackData?.shipment_status || 6;
      deliveredDate = options.mockDeliveredDate || null;
      scans = trackItem?.scans || [];
    }

    // Step 3: Canonical Status Normalization & Transition Validation
    const { shipmentStatus: mappedShipmentStatus, orderStatus: mappedOrderStatus } = mapShiprocketStatus(
      rawStatus,
      rawStatusCode
    );

    const allowTransition = canTransitionShipmentStatus(shipment.status, mappedShipmentStatus);

    // Step 4: Persist updates to Shipment
    if (awbCode && (!shipment.awbCode || shipment.awbCode !== awbCode)) {
      shipment.awbCode = awbCode;
      shipment.trackingUrl = `https://shiprocket.co/tracking/${awbCode}`;
    }
    if (courierName) {
      shipment.courierName = courierName;
    }

    if (allowTransition && mappedShipmentStatus) {
      shipment.status = mappedShipmentStatus;
    }

    if (mappedShipmentStatus === 'DELIVERED') {
      shipment.deliveredAt = deliveredDate ? new Date(deliveredDate) : (shipment.deliveredAt || new Date());
    }

    if (Array.isArray(scans) && scans.length > 0) {
      shipment.trackingHistory = scans.map(s => ({
        status: s['sr-status-label'] || s.status || shipment.status,
        activity: s.activity || s.current_status || 'Tracking scan',
        date: s.date ? new Date(s.date) : new Date(),
        location: s.location || ''
      }));
    }

    shipment.lastSyncedAt = new Date();

    if (options.webhookPayload) {
      shipment.rawWebhooks.push({
        event: shipment.status,
        receivedAt: new Date(),
        payload: options.webhookPayload
      });
    }

    await shipment.save();

    // Step 5: Update parent Order status safely (without modifying paymentStatus)
    if (allowTransition && mappedOrderStatus) {
      if (mappedOrderStatus === 'delivered') {
        order.orderStatus = 'delivered';
      } else if (mappedOrderStatus === 'shipped') {
        if (order.orderStatus === 'placed' || order.orderStatus === 'processing' || order.orderStatus === 'confirmed') {
          order.orderStatus = 'shipped';
        }
      } else if (mappedOrderStatus === 'cancelled') {
        order.orderStatus = 'cancelled';
      }
      await order.save();
    }

    return {
      shipment,
      order,
      liveTracking,
      updated: true
    };
  }

  /**
   * Batch reconciles active, non-terminal shipments with Shiprocket
   */
  async reconcileShipments(filter = {}) {
    const query = {
      status: { $nin: ['DELIVERED', 'CANCELLED', 'RTO_DELIVERED'] },
      ...filter
    };

    const activeShipments = await Shipment.find(query).limit(50);
    let syncedCount = 0;
    const errors = [];

    for (const shipment of activeShipments) {
      try {
        await this.syncShipment(shipment);
        syncedCount++;
      } catch (err) {
        errors.push({ shipmentId: shipment._id, error: err.message });
        logger.warn(`Failed to reconcile shipment ${shipment._id}: ${err.message}`);
      }
    }

    return {
      totalFound: activeShipments.length,
      syncedCount,
      errors
    };
  }

  /**
   * Override mock tracking response for testing
   */
  setMockTrackingOverride(override) {
    this.mockTrackingOverride = override;
  }

  /**
   * Mock responses for unit/integration tests and development sandbox
   */
  getMockResponse(endpoint, data) {
    if (this.mockTrackingOverride && endpoint.includes('/courier/track/awb')) {
      return this.mockTrackingOverride;
    }
    if (endpoint.includes('/orders/show')) {
      return {
        data: {
          id: 1664945681,
          status: 'DELIVERED',
          status_code: 7,
          shipments: [{
            awb: '14326361864278',
            courier: 'Xpressbees Surface 2kg',
            status: 'DELIVERED',
            delivered_date: new Date().toISOString()
          }]
        }
      };
    }
    if (endpoint.includes('/orders/create/adhoc')) {
      return {
        order_id: `SR_MOCK_${Date.now()}`,
        shipment_id: `SHP_MOCK_${Date.now()}`,
        status: 'NEW',
        status_code: 1
      };
    }
    if (endpoint.includes('/courier/assign/awb')) {
      return {
        response: {
          data: {
            awb_code: `MOCK_AWB_${Date.now()}`,
            courier_name: 'BlueDart Express'
          }
        }
      };
    }
    if (endpoint.includes('/courier/track/awb')) {
      return {
        tracking_data: {
          track_status: 1,
          shipment_status: 6,
          shipment_track: [{
            current_status: 'IN_TRANSIT',
            origin: 'Warehouse Hub',
            destination: 'Customer City',
            scans: [
              { date: new Date().toISOString(), activity: 'Package picked up from warehouse', location: 'Warehouse Hub' },
              { date: new Date().toISOString(), activity: 'In transit to destination facility', location: 'Transit Hub' }
            ]
          }]
        }
      };
    }
    return { status: 'success' };
  }
}

export const shiprocketService = new ShiprocketService();
