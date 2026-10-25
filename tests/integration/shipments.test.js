import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';
import { Shipment } from '../../src/models/Shipment.js';
import { generateAccessToken } from '../../src/utils/token.js';

describe('Shiprocket Logistics & Tracking Integration Tests', () => {
  jest.setTimeout(30000);
  let adminToken, customerToken, customerId;
  let testProduct;
  let paidOrder;
  let unpaidOrder;

  beforeEach(async () => {
    const admin = await User.create({
      name: 'Ship Admin',
      email: 'shipadmin@toyvolt.test',
      password: 'AdminPassword123!',
      role: 'admin',
      isEmailVerified: true
    });
    adminToken = generateAccessToken({ id: admin._id, role: 'admin' });

    const customer = await User.create({
      name: 'Tracking Customer',
      email: 'track@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });
    customerId = customer._id;
    customerToken = generateAccessToken({ id: customer._id, role: 'customer' });

    testProduct = await Product.create({
      name: 'Toyvolt Apex-1 Drift Car',
      slug: 'toyvolt-apex-1-drift-car',
      sku: 'TV-RC-001',
      description: 'RC Car for testing',
      sellingPrice: 249900,
      availableStock: 10,
      weightGrams: 850,
      dimensions: { lengthCm: 32, breadthCm: 18, heightCm: 14 }
    });

    paidOrder = await Order.create({
      orderNumber: 'TV-SHIP-PAID-001',
      userId: customerId,
      items: [{
        productId: testProduct._id,
        name: testProduct.name,
        slug: testProduct.slug,
        sku: testProduct.sku,
        unitPrice: testProduct.sellingPrice,
        quantity: 1,
        total: testProduct.sellingPrice
      }],
      shippingAddress: {
        fullName: 'Tracking Customer',
        phone: '9876543210',
        addressLine1: 'Lane 10',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001'
      },
      subtotal: testProduct.sellingPrice,
      finalAmount: testProduct.sellingPrice,
      paymentStatus: 'paid',
      orderStatus: 'confirmed'
    });

    unpaidOrder = await Order.create({
      orderNumber: 'TV-SHIP-UNPAID-002',
      userId: customerId,
      items: [{
        productId: testProduct._id,
        name: testProduct.name,
        slug: testProduct.slug,
        sku: testProduct.sku,
        unitPrice: testProduct.sellingPrice,
        quantity: 1,
        total: testProduct.sellingPrice
      }],
      shippingAddress: {
        fullName: 'Tracking Customer',
        phone: '9876543210',
        addressLine1: 'Lane 10',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001'
      },
      subtotal: testProduct.sellingPrice,
      finalAmount: testProduct.sellingPrice,
      paymentStatus: 'pending',
      orderStatus: 'placed'
    });
  });

  test('POST /api/v1/admin/shipments/:orderId/create generates shipment for paid order', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/shipments/${paidOrder._id}/create`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shipment.awbCode).toBeDefined();

    const shipment = await Shipment.findOne({ orderId: paidOrder._id });
    expect(shipment).toBeTruthy();
    expect(shipment.status).toBe('AWB_ASSIGNED');
  });

  test('Rejects shipment creation for an unpaid order', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/shipments/${unpaidOrder._id}/create`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unpaid order/i);
  });

  test('GET /api/v1/orders/:id/tracking returns tracking details to customer', async () => {
    // Create shipment record
    await Shipment.create({
      orderId: paidOrder._id,
      shiprocketOrderId: 'SR_TEST_123',
      awbCode: 'MOCK_AWB_987',
      courierName: 'Delhivery',
      status: 'IN_TRANSIT',
      trackingUrl: 'https://shiprocket.co/tracking/MOCK_AWB_987'
    });

    const res = await request(app)
      .get(`/api/v1/orders/${paidOrder._id}/tracking`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shipment.awbCode).toBe('MOCK_AWB_987');
    expect(res.body.data.shipment.courierName).toBe('Delhivery');
  });

  test('GET /api/v1/admin/shipments returns both booked shipments and unbooked orders', async () => {
    // 1. Book one shipment
    await Shipment.create({
      orderId: paidOrder._id,
      shiprocketOrderId: 'SR_TEST_123',
      awbCode: 'MOCK_AWB_123',
      courierName: 'BlueDart Express',
      status: 'IN_TRANSIT'
    });

    // 2. Fetch admin shipments
    const res = await request(app)
      .get('/api/v1/admin/shipments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Should have both the booked shipment and the unpaidOrder which is awaiting booking
    expect(res.body.data.shipments.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.metrics.awaitingBookingCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.metrics.activeInTransit.count).toBe(1);

    const booked = res.body.data.shipments.find(s => s.isBooked === true);
    const unbooked = res.body.data.shipments.find(s => s.isBooked === false);

    expect(booked).toBeDefined();
    expect(booked.awbCode).toBe('MOCK_AWB_123');

    expect(unbooked).toBeDefined();
    expect(unbooked.status).toBe('PENDING_BOOKING');
    expect(unbooked.awbCode).toBeNull();
  });

  test('Shiprocket webhook DELIVERED updates shipment and order status, persisting deliveredAt', async () => {
    const shipment = await Shipment.create({
      orderId: paidOrder._id,
      shiprocketOrderId: '1664945681',
      awbCode: '14326361864278',
      courierName: 'Xpressbees Surface 2kg',
      status: 'IN_TRANSIT'
    });

    const webhookPayload = {
      awb: '14326361864278',
      courier_name: 'Xpressbees Surface 2kg',
      current_status: 'Delivered',
      current_status_id: 7,
      delivered_date: '2026-10-25 13:15:00',
      scans: [
        {
          date: '2026-10-25 13:15:00',
          status: 'DLVD',
          activity: 'Delivered',
          location: 'Noida/PAL, Delhi NCR'
        }
      ]
    };

    const res = await request(app)
      .post('/api/v1/webhooks/shiprocket')
      .send(webhookPayload);

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);

    const updatedShipment = await Shipment.findById(shipment._id);
    expect(updatedShipment.status).toBe('DELIVERED');
    expect(updatedShipment.deliveredAt).toBeTruthy();
    expect(updatedShipment.trackingHistory.length).toBeGreaterThan(0);

    const updatedOrder = await Order.findById(paidOrder._id);
    expect(updatedOrder.orderStatus).toBe('delivered');
  });

  test('Shipment delivery preserves COD order paymentStatus without mutating it to paid', async () => {
    const codOrder = await Order.create({
      orderNumber: 'TV-COD-TEST-003',
      userId: customerId,
      items: [{
        productId: testProduct._id,
        name: testProduct.name,
        slug: testProduct.slug,
        sku: testProduct.sku,
        unitPrice: testProduct.sellingPrice,
        quantity: 1,
        total: testProduct.sellingPrice
      }],
      shippingAddress: {
        fullName: 'COD Customer',
        phone: '9876543210',
        addressLine1: 'Lane 12',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001'
      },
      subtotal: testProduct.sellingPrice,
      finalAmount: testProduct.sellingPrice,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      orderStatus: 'processing'
    });

    const shipment = await Shipment.create({
      orderId: codOrder._id,
      shiprocketOrderId: '1999999999',
      awbCode: '999888777666',
      status: 'OUT_FOR_DELIVERY'
    });

    const webhookPayload = {
      awb: '999888777666',
      current_status: 'Delivered',
      current_status_id: 7,
      delivered_date: '2026-10-25 14:00:00'
    };

    const res = await request(app)
      .post('/api/v1/webhooks/shiprocket')
      .send(webhookPayload);

    expect(res.status).toBe(200);

    const refreshedOrder = await Order.findById(codOrder._id);
    expect(refreshedOrder.orderStatus).toBe('delivered');
    // COD payment status should remain pending until cash collection reconciliation
    expect(refreshedOrder.paymentStatus).toBe('pending');
  });

  test('Out-of-order scans cannot downgrade a DELIVERED status back to IN_TRANSIT', async () => {
    const shipment = await Shipment.create({
      orderId: paidOrder._id,
      shiprocketOrderId: '1664945681',
      awbCode: '14326361864278',
      status: 'DELIVERED',
      deliveredAt: new Date()
    });

    paidOrder.orderStatus = 'delivered';
    await paidOrder.save();

    // Out-of-order webhook delayed in flight
    const stalePayload = {
      awb: '14326361864278',
      current_status: 'In Transit',
      current_status_id: 6
    };

    const res = await request(app)
      .post('/api/v1/webhooks/shiprocket')
      .send(stalePayload);

    expect(res.status).toBe(200);

    const refreshedShipment = await Shipment.findById(shipment._id);
    expect(refreshedShipment.status).toBe('DELIVERED');

    const refreshedOrder = await Order.findById(paidOrder._id);
    expect(refreshedOrder.orderStatus).toBe('delivered');
  });

  test('Webhook matching by orderNumber when AWB was not initially in database', async () => {
    // Shipment created without AWB (as happens initially before courier allocation)
    const shipment = await Shipment.create({
      orderId: paidOrder._id,
      shiprocketOrderId: '1664945681',
      awbCode: null,
      status: 'CREATED'
    });

    const webhookPayload = {
      order_id: paidOrder.orderNumber, // Matches Toyvolt order number TV-SHIP-PAID-001
      awb: '14326361864278',
      courier_name: 'Xpressbees Surface 2kg',
      current_status: 'Delivered',
      current_status_id: 7
    };

    const res = await request(app)
      .post('/api/v1/webhooks/shiprocket')
      .send(webhookPayload);

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);

    const updatedShipment = await Shipment.findById(shipment._id);
    expect(updatedShipment.awbCode).toBe('14326361864278');
    expect(updatedShipment.status).toBe('DELIVERED');
  });

  test('POST /api/v1/orders/:id/tracking/refresh triggers customer tracking refresh', async () => {
    await Shipment.create({
      orderId: paidOrder._id,
      shiprocketOrderId: '1664945681',
      awbCode: 'MOCK_AWB_123',
      courierName: 'BlueDart Express',
      status: 'IN_TRANSIT'
    });

    const res = await request(app)
      .post(`/api/v1/orders/${paidOrder._id}/tracking/refresh`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shipment).toBeDefined();
  });
});
