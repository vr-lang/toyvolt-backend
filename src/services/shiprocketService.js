import axios from 'axios';
import { env, hasShiprocket } from '../config/env.js';
import { Shipment } from '../models/Shipment.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { emailService } from './emailService.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { paiseToRupees } from '../utils/money.js';

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
   * Mock responses for unit/integration tests and development sandbox
   */
  getMockResponse(endpoint, data) {
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
