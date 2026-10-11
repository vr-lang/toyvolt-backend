import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';
import { generateAccessToken } from '../../src/utils/token.js';

describe('Cart & Orders Integration Tests', () => {
  let customer1Token, customer1Id;
  let customer2Token, customer2Id;
  let testProduct;

  beforeEach(async () => {
    const user1 = await User.create({
      name: 'Customer One',
      email: 'user1@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });
    customer1Id = user1._id;
    customer1Token = generateAccessToken({ id: user1._id, role: 'customer' });

    const user2 = await User.create({
      name: 'Customer Two',
      email: 'user2@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });
    customer2Id = user2._id;
    customer2Token = generateAccessToken({ id: user2._id, role: 'customer' });

    testProduct = await Product.create({
      name: 'Toyvolt Apex-1 Drift Car',
      slug: 'toyvolt-apex-1-drift-car',
      sku: 'TV-RC-001',
      description: 'RC Car for testing',
      sellingPrice: 249900,
      availableStock: 5,
      reservedStock: 0,
      weightGrams: 850,
      dimensions: { lengthCm: 32, breadthCm: 18, heightCm: 14 }
    });
  });

  test('POST /api/v1/cart/items adds product and calculates subtotal on server', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({ productId: testProduct._id.toString(), quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.cart.subtotal).toBe(499800); // 249900 * 2
    expect(res.body.data.cart.itemCount).toBe(2);
  });

  test('Rejects cart addition exceeding available inventory', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({ productId: testProduct._id.toString(), quantity: 10 }); // only 5 available

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/available in stock/i);
  });

  test('POST /api/v1/orders places order and atomically reserves inventory', async () => {
    // Add 2 to cart
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({ productId: testProduct._id.toString(), quantity: 2 });

    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: {
          fullName: 'Customer One',
          phone: '9876543210',
          addressLine1: '123 Speed Way',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001'
        }
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.data.order.finalAmount).toBe(499800); // Free shipping threshold met (> ₹999)

    // Check stock was atomically reserved
    const updatedProduct = await Product.findById(testProduct._id);
    expect(updatedProduct.availableStock).toBe(3); // 5 - 2
    expect(updatedProduct.reservedStock).toBe(2);  // 0 + 2
  });

  test('Enforces customer ownership: Customer 2 cannot access Customer 1 order', async () => {
    const order = await Order.create({
      orderNumber: 'TV-PRIVACY-TEST',
      userId: customer1Id,
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
        fullName: 'Customer One',
        phone: '9876543210',
        addressLine1: '123 Lane',
        city: 'Mumbai',
        state: 'MH',
        postalCode: '400001'
      },
      subtotal: testProduct.sellingPrice,
      finalAmount: testProduct.sellingPrice
    });

    const res = await request(app)
      .get(`/api/v1/orders/${order._id}`)
      .set('Authorization', `Bearer ${customer2Token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not authorized/i);
  });

  test('Order cancellation restores reserved inventory', async () => {
    // Place order of 1
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({
        shippingAddress: {
          fullName: 'Customer One',
          phone: '9876543210',
          addressLine1: '123 Lane',
          city: 'Mumbai',
          state: 'MH',
          postalCode: '400001'
        },
        directItems: [{ productId: testProduct._id.toString(), quantity: 1 }]
      });

    const orderId = orderRes.body.data.order._id;

    // Check reserved
    let prod = await Product.findById(testProduct._id);
    expect(prod.availableStock).toBe(4);
    expect(prod.reservedStock).toBe(1);

    // Cancel order
    const cancelRes = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${customer1Token}`)
      .send({ reason: 'Changed my mind' });

    expect(cancelRes.status).toBe(200);

    // Check stock restored
    prod = await Product.findById(testProduct._id);
    expect(prod.availableStock).toBe(5);
    expect(prod.reservedStock).toBe(0);
  });
});
