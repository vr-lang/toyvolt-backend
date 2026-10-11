import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';
import { generateAccessToken } from '../../src/utils/token.js';

describe('Admin Dashboard & Analytics Integration Tests', () => {
  let adminToken;
  let customer;

  beforeEach(async () => {
    const admin = await User.create({
      name: 'Admin Boss',
      email: 'boss@toyvolt.test',
      password: 'AdminPassword123!',
      role: 'admin',
      isEmailVerified: true
    });
    adminToken = generateAccessToken({ id: admin._id, role: 'admin' });

    customer = await User.create({
      name: 'Regular Customer',
      email: 'reg@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });

    // Create 1 low stock product
    await Product.create({
      name: 'Low Stock RC Car',
      slug: 'low-stock-rc',
      sku: 'TV-LOW-1',
      description: 'Running out soon',
      sellingPrice: 199900,
      availableStock: 3, // <= 10
      weightGrams: 700,
      dimensions: { lengthCm: 20, breadthCm: 15, heightCm: 10 }
    });

    // Create 1 paid order
    await Order.create({
      orderNumber: 'TV-ADMIN-PAID-01',
      userId: customer._id,
      items: [{
        productId: (await Product.findOne({ sku: 'TV-LOW-1' }))._id,
        name: 'Low Stock RC Car',
        slug: 'low-stock-rc',
        sku: 'TV-LOW-1',
        unitPrice: 199900,
        quantity: 1,
        total: 199900
      }],
      shippingAddress: {
        fullName: 'Regular Customer',
        phone: '9876543210',
        addressLine1: 'Road 1',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001'
      },
      subtotal: 199900,
      finalAmount: 199900,
      paymentStatus: 'paid',
      orderStatus: 'confirmed'
    });

    // Create 1 pending order
    await Order.create({
      orderNumber: 'TV-ADMIN-PENDING-02',
      userId: customer._id,
      items: [{
        productId: (await Product.findOne({ sku: 'TV-LOW-1' }))._id,
        name: 'Low Stock RC Car',
        slug: 'low-stock-rc',
        sku: 'TV-LOW-1',
        unitPrice: 199900,
        quantity: 1,
        total: 199900
      }],
      shippingAddress: {
        fullName: 'Regular Customer',
        phone: '9876543210',
        addressLine1: 'Road 1',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001'
      },
      subtotal: 199900,
      finalAmount: 199900,
      paymentStatus: 'pending',
      orderStatus: 'placed'
    });
  });

  test('GET /api/v1/health returns system operational status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.services.database).toBe('connected');
  });

  test('GET /api/v1/admin/dashboard calculates accurate metrics and low stock alerts', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { metrics, lowStockProducts, recentOrders } = res.body.data;
    expect(metrics.totalOrders).toBe(2);
    expect(metrics.paidRevenue).toBe(199900); // Only counts paid order
    expect(metrics.paidRevenueInRupees).toBe(1999);
    expect(metrics.pendingOrders).toBe(1);
    expect(metrics.lowStockCount).toBe(1);
    expect(lowStockProducts.length).toBe(1);
    expect(recentOrders.length).toBe(2);
  });

  test('PATCH /api/v1/admin/customers/:id/status allows suspending a customer', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/customers/${customer._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' });

    expect(res.status).toBe(200);
    expect(res.body.data.customer.accountStatus).toBe('suspended');

    const updatedUser = await User.findById(customer._id);
    expect(updatedUser.accountStatus).toBe('suspended');
  });

  test('GET /api/v1/admin/analytics/sales returns timeframe aggregations', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/sales?timeframe=30d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRevenue).toBe(199900);
    expect(res.body.data.summary.totalOrders).toBe(1);
  });
});
