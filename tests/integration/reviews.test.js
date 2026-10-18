import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';
import { Review } from '../../src/models/Review.js';
import { generateAccessToken } from '../../src/utils/token.js';

describe('Verified-Buyer Reviews with Image Upload Integration Tests', () => {
  let customerUser;
  let customerToken;
  let otherUser;
  let otherToken;
  let adminUser;
  let adminToken;
  let testProduct;

  beforeEach(async () => {
    // 1. Customer User
    customerUser = await User.create({
      name: 'Rahul Sharma',
      email: 'rahul.sharma@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });
    customerToken = generateAccessToken({ id: customerUser._id, role: 'customer' });

    // 2. Another Customer (unpurchased)
    otherUser = await User.create({
      name: 'Priya Patel',
      email: 'priya.patel@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });
    otherToken = generateAccessToken({ id: otherUser._id, role: 'customer' });

    // 3. Admin User
    adminUser = await User.create({
      name: 'Toyvolt Admin',
      email: 'admin@toyvolt.test',
      password: 'AdminPassword123!',
      role: 'admin',
      isEmailVerified: true
    });
    adminToken = generateAccessToken({ id: adminUser._id, role: 'admin' });

    // 4. Product
    testProduct = await Product.create({
      name: 'Toyvolt Thunder Storm 4WD RC Car',
      slug: 'toyvolt-thunder-storm-4wd-rc-car',
      sku: 'TV-THUNDER-01',
      description: 'Rugged high-speed electric buggy',
      category: 'Remote Control Cars',
      sellingPrice: 179900,
      availableStock: 25,
      weightGrams: 900,
      dimensions: { lengthCm: 30, breadthCm: 20, heightCm: 15 }
    });
  });

  test('Guest cannot submit review (401 Unauthorized)', async () => {
    const res = await request(app)
      .post(`/api/v1/products/${testProduct.slug}/reviews`)
      .field('rating', 5)
      .field('comment', 'Awesome RC car for kids!');

    expect(res.status).toBe(401);
  });

  test('Customer who has not purchased cannot submit review (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/v1/products/${testProduct.slug}/reviews`)
      .set('Authorization', `Bearer ${otherToken}`)
      .field('rating', 5)
      .field('comment', 'I did not buy this but writing anyway!');

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verified buyers/i);
  });

  test('Customer with order in-transit (placed/shipped) cannot submit review (403 Forbidden)', async () => {
    // Create an order that is still shipped/processing, not delivered
    await Order.create({
      orderNumber: 'ORD-TEST-SHIPPED-01',
      userId: customerUser._id,
      items: [{
        productId: testProduct._id,
        name: testProduct.name,
        slug: testProduct.slug,
        sku: testProduct.sku,
        unitPrice: 179900,
        quantity: 1,
        total: 179900
      }],
      shippingAddress: {
        fullName: 'Rahul Sharma',
        phone: '9876543210',
        addressLine1: 'MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001'
      },
      subtotal: 179900,
      finalAmount: 179900,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      orderStatus: 'shipped' // Not delivered yet!
    });

    const res = await request(app)
      .post(`/api/v1/products/${testProduct.slug}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .field('rating', 5)
      .field('comment', 'Waiting for it to arrive!');

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verified buyers/i);
  });

  test('Verified customer with delivered order can submit review and recalculate product rating', async () => {
    // 1. Create a delivered order
    await Order.create({
      orderNumber: 'ORD-TEST-DELIVERED-01',
      userId: customerUser._id,
      items: [{
        productId: testProduct._id,
        name: testProduct.name,
        slug: testProduct.slug,
        sku: testProduct.sku,
        unitPrice: 179900,
        quantity: 1,
        total: 179900
      }],
      shippingAddress: {
        fullName: 'Rahul Sharma',
        phone: '9876543210',
        addressLine1: 'MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001'
      },
      subtotal: 179900,
      finalAmount: 179900,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      orderStatus: 'delivered'
    });

    // Valid PNG buffer: 89 50 4E 47 0D 0A 1A 0A + dummy bytes
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
    ]);

    const res = await request(app)
      .post(`/api/v1/products/${testProduct.slug}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .field('rating', 5)
      .field('title', 'Exceptional build quality!')
      .field('comment', 'My son loved the flips and battery duration. Highly recommended!')
      .attach('images', validPngBuffer, 'toy_photo.png');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.review.rating).toBe(5);
    expect(res.body.data.review.reviewerName).toBe('Rahul S.');
    expect(res.body.data.review.isVerifiedPurchase).toBe(true);
    expect(res.body.data.review.images.length).toBe(1);

    // Verify Product model rating updated
    const updatedProduct = await Product.findById(testProduct._id);
    expect(updatedProduct.totalReviews).toBe(1);
    expect(updatedProduct.averageRating).toBe(5);
  });

  test('Rejects spoofed image files failing magic bytes check', async () => {
    // Delivered order
    await Order.create({
      orderNumber: 'ORD-TEST-DELIVERED-02',
      userId: customerUser._id,
      items: [{
        productId: testProduct._id,
        name: testProduct.name,
        slug: testProduct.slug,
        sku: testProduct.sku,
        unitPrice: 179900,
        quantity: 1,
        total: 179900
      }],
      shippingAddress: {
        fullName: 'Rahul Sharma',
        phone: '9876543210',
        addressLine1: 'MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001'
      },
      subtotal: 179900,
      finalAmount: 179900,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      orderStatus: 'delivered'
    });

    // Malicious fake image containing plain text but named fake.jpg
    const fakeImageBuffer = Buffer.from('echo "Malicious script content"');

    const res = await request(app)
      .post(`/api/v1/products/${testProduct.slug}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .field('rating', 4)
      .field('comment', 'Testing with a fake photo attachment.')
      .attach('images', fakeImageBuffer, 'fake.jpg');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid image format detected/i);
  });

  test('Prevents duplicate reviews from the same user for the same product (409 Conflict)', async () => {
    // Create delivered order
    await Order.create({
      orderNumber: 'ORD-TEST-DELIVERED-03',
      userId: customerUser._id,
      items: [{
        productId: testProduct._id,
        name: testProduct.name,
        slug: testProduct.slug,
        sku: testProduct.sku,
        unitPrice: 179900,
        quantity: 1,
        total: 179900
      }],
      shippingAddress: {
        fullName: 'Rahul Sharma',
        phone: '9876543210',
        addressLine1: 'MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001'
      },
      subtotal: 179900,
      finalAmount: 179900,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      orderStatus: 'delivered'
    });

    // First review
    const res1 = await request(app)
      .post(`/api/v1/products/${testProduct.slug}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .field('rating', 5)
      .field('comment', 'First review submission!');
    expect(res1.status).toBe(201);

    // Second review attempt -> 409
    const res2 = await request(app)
      .post(`/api/v1/products/${testProduct.slug}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .field('rating', 4)
      .field('comment', 'Second review attempt by same user.');
    expect(res2.status).toBe(409);
    expect(res2.body.message).toMatch(/already submitted a review/i);
  });

  test('GET public reviews returns rating distribution and summary', async () => {
    // Deliver for customerUser
    const order1 = await Order.create({
      orderNumber: 'ORD-PUBLIC-01',
      userId: customerUser._id,
      items: [{ productId: testProduct._id, name: testProduct.name, slug: testProduct.slug, sku: testProduct.sku, unitPrice: 179900, quantity: 1, total: 179900 }],
      shippingAddress: { fullName: 'Rahul Sharma', phone: '9876543210', addressLine1: 'MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
      subtotal: 179900, finalAmount: 179900, paymentMethod: 'razorpay', paymentStatus: 'paid', orderStatus: 'delivered'
    });

    // Submit review
    await Review.create({
      productId: testProduct._id,
      userId: customerUser._id,
      orderId: order1._id,
      rating: 5,
      title: 'Top notch toy',
      comment: 'Super fast and durable materials.',
      isVerifiedPurchase: true,
      status: 'PUBLISHED'
    });

    await Review.calculateProductRatingStats(testProduct._id);

    const res = await request(app).get(`/api/v1/products/${testProduct.slug}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reviews.length).toBe(1);
    expect(res.body.data.summary.totalReviews).toBe(1);
    expect(res.body.data.summary.averageRating).toBe(5);
    expect(res.body.data.summary.distribution[5]).toBe(1);
    expect(res.body.data.reviews[0].reviewerName).toBe('Rahul S.');
  });

  test('Admin review moderation: view, update status, and reply', async () => {
    const order = await Order.create({
      orderNumber: 'ORD-ADMIN-01',
      userId: customerUser._id,
      items: [{ productId: testProduct._id, name: testProduct.name, slug: testProduct.slug, sku: testProduct.sku, unitPrice: 179900, quantity: 1, total: 179900 }],
      shippingAddress: { fullName: 'Rahul Sharma', phone: '9876543210', addressLine1: 'MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' },
      subtotal: 179900, finalAmount: 179900, paymentMethod: 'razorpay', paymentStatus: 'paid', orderStatus: 'delivered'
    });

    const rev = await Review.create({
      productId: testProduct._id,
      userId: customerUser._id,
      orderId: order._id,
      rating: 4,
      title: 'Very good racer',
      comment: 'Great speed and handling!',
      status: 'PUBLISHED'
    });

    // 1. Admin gets reviews
    const listRes = await request(app)
      .get('/api/v1/admin/reviews')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.reviews.length).toBe(1);
    expect(listRes.body.data.reviews[0].parentName).toBe('Rahul Sharma');

    // 2. Admin replies
    const replyRes = await request(app)
      .post(`/api/v1/admin/reviews/${rev._id}/reply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reply: 'Thank you Rahul! Glad your child loved it.' });

    expect(replyRes.status).toBe(200);
    expect(replyRes.body.data.review.storeReply.text).toMatch(/Thank you Rahul/i);

    // 3. Admin updates status to FLAGGED
    const statusRes = await request(app)
      .patch(`/api/v1/admin/reviews/${rev._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'FLAGGED' });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.review.status).toBe('FLAGGED');
  });
});
