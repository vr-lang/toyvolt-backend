import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';
import { Shipment } from '../../src/models/Shipment.js';
import { generateAccessToken } from '../../src/utils/token.js';

describe('Shiprocket Logistics & Tracking Integration Tests', () => {
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
});
