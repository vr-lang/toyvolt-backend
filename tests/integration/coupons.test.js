import request from 'supertest';
import app from '../../src/app.js';
import { Coupon } from '../../src/models/Coupon.js';
import { User } from '../../src/models/User.js';
import { generateAccessToken } from '../../src/utils/token.js';

describe('Coupon & Discount Engine Integration Tests', () => {
  let customerToken, customerId;

  beforeEach(async () => {
    const user = await User.create({
      name: 'Discount Tester',
      email: 'coupon@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });
    customerId = user._id;
    customerToken = generateAccessToken({ id: user._id, role: 'customer' });

    // Welcome coupon: flat ₹100 off (10000 paise), min order ₹999 (99900 paise)
    await Coupon.create({
      code: 'WELCOME100',
      discountType: 'flat',
      discountValue: 10000,
      minOrderValue: 99900,
      expiryDate: new Date(Date.now() + 86400000), // tomorrow
      perCustomerLimit: 1,
      globalUsageLimit: 100
    });
  });

  test('Validates welcome coupon correctly on eligible subtotal', async () => {
    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        code: 'WELCOME100',
        subtotal: 249900 // ₹2,499
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.discountAmount).toBe(10000); // ₹100 off
    expect(res.body.data.finalAmount).toBe(239900);   // ₹2,399
  });

  test('Rejects coupon when subtotal does not meet minimum order value', async () => {
    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        code: 'WELCOME100',
        subtotal: 50000 // ₹500 (less than ₹999 min order)
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/minimum order value/i);
  });

  test('Rejects expired coupon', async () => {
    await Coupon.create({
      code: 'EXPIRED20',
      discountType: 'flat',
      discountValue: 2000,
      minOrderValue: 1000,
      expiryDate: new Date(Date.now() - 3600000), // 1 hour ago
      isActive: true
    });

    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        code: 'EXPIRED20',
        subtotal: 249900
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  test('Enforces per-customer usage limit', async () => {
    // Manually mark coupon as used by this customer
    await Coupon.findOneAndUpdate(
      { code: 'WELCOME100' },
      { $push: { usedBy: { userId: customerId, count: 1 } } }
    );

    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        code: 'WELCOME100',
        subtotal: 249900
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/maximum allowed number of times/i);
  });
});
