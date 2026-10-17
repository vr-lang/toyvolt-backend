import request from 'supertest';
import crypto from 'crypto';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';
import { Payment } from '../../src/models/Payment.js';
import { generateAccessToken } from '../../src/utils/token.js';

describe('Razorpay Payments & Webhook Idempotency Integration Tests', () => {
  let customerToken, customerId;
  let testProduct;
  let testOrder;

  beforeEach(async () => {
    const user = await User.create({
      name: 'Payer User',
      email: 'payer@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });
    customerId = user._id;
    customerToken = generateAccessToken({ id: user._id, role: 'customer' });

    testProduct = await Product.create({
      name: 'Toyvolt Apex-1 Drift Car',
      slug: 'toyvolt-apex-1-drift-car',
      sku: 'TV-RC-001',
      description: 'RC Car for testing',
      sellingPrice: 249900,
      availableStock: 10,
      reservedStock: 1, // 1 already reserved for this testOrder
      weightGrams: 850,
      dimensions: { lengthCm: 32, breadthCm: 18, heightCm: 14 }
    });

    testOrder = await Order.create({
      orderNumber: 'TV-PAY-TEST-001',
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
        fullName: 'Payer User',
        phone: '9876543210',
        addressLine1: 'Road 5',
        city: 'Bangalore',
        state: 'Karnataka',
        postalCode: '560001'
      },
      subtotal: testProduct.sellingPrice,
      finalAmount: testProduct.sellingPrice,
      paymentStatus: 'pending',
      orderStatus: 'placed'
    });
  });

  test('POST /api/v1/payments/create-order generates Razorpay order info', async () => {
    const res = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ orderId: testOrder._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe(249900);
    expect(res.body.data.razorpayOrderId).toBeDefined();

    const payment = await Payment.findOne({ orderId: testOrder._id });
    expect(payment).toBeTruthy();
    expect(payment.status).toBe('created');
  });

  test('POST /api/v1/payments/verify verifies valid signature and confirms order', async () => {
    const razorpayOrderId = 'order_mock_test_123';
    const razorpayPaymentId = 'pay_mock_test_456';
    // In test environment, razorpayService accepts 'valid_test_signature' or 'mock_sig_'
    const razorpaySignature = 'valid_test_signature';

    await Payment.create({
      orderId: testOrder._id,
      razorpayOrderId,
      amount: testOrder.finalAmount,
      status: 'created'
    });

    const res = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: testOrder._id.toString(),
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedOrder = await Order.findById(testOrder._id);
    expect(updatedOrder.paymentStatus).toBe('paid');
    expect(updatedOrder.orderStatus).toBe('confirmed');

    // Reserved stock must now be converted to permanently deducted
    const prod = await Product.findById(testProduct._id);
    expect(prod.reservedStock).toBe(0);
  });

  test('POST /api/v1/payments/verify rejects invalid payment signature with 400', async () => {
    const razorpayOrderId = 'order_mock_test_invalid';
    const razorpayPaymentId = 'pay_mock_test_invalid';
    const badSignature = 'invalid_tampered_signature_99999999';

    await Payment.create({
      orderId: testOrder._id,
      razorpayOrderId,
      amount: testOrder.finalAmount,
      status: 'created'
    });

    const res = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: testOrder._id.toString(),
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: badSignature
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid payment signature/i);

    const order = await Order.findById(testOrder._id);
    expect(order.paymentStatus).toBe('pending');

    const payment = await Payment.findOne({ orderId: testOrder._id, razorpayOrderId });
    expect(payment.status).toBe('failed');
    expect(payment.errorCode).toBe('SIGNATURE_VERIFICATION_FAILED');
  });

  test('POST /api/v1/payments/verify handles duplicate verification calls idempotently', async () => {
    const razorpayOrderId = 'order_mock_test_dup';
    const razorpayPaymentId = 'pay_mock_test_dup';
    const razorpaySignature = 'valid_test_signature';

    await Payment.create({
      orderId: testOrder._id,
      razorpayOrderId,
      amount: testOrder.finalAmount,
      status: 'created'
    });

    // 1st verification
    const res1 = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: testOrder._id.toString(),
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      });

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.data.order.paymentStatus).toBe('paid');

    // 2nd duplicate verification
    const res2 = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: testOrder._id.toString(),
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      });

    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
    expect(res2.body.data.order.paymentStatus).toBe('paid');
  });

  test('POST /api/v1/payments/verify rejects payment amount mismatch', async () => {
    const razorpayOrderId = 'order_mock_test_mismatch';
    const razorpayPaymentId = 'pay_mock_test_mismatch';
    const razorpaySignature = 'valid_test_signature';

    // Tampered payment record with different amount
    await Payment.create({
      orderId: testOrder._id,
      razorpayOrderId,
      amount: 10000, // 100 rupees instead of 2499 rupees
      currency: 'INR',
      status: 'created'
    });

    const res = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: testOrder._id.toString(),
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/amount mismatch/i);
  });

  test('POST /api/v1/payments/create-order enforces customer order ownership', async () => {
    const anotherUser = await User.create({
      name: 'Another User',
      email: 'another@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });
    const anotherToken = generateAccessToken({ id: anotherUser._id, role: 'customer' });

    const res = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${anotherToken}`)
      .send({ orderId: testOrder._id.toString() });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Access denied/i);
  });

  test('POST /api/v1/webhooks/razorpay processes order.paid idempotently on retries', async () => {
    const razorpayOrderId = 'order_webhook_123';
    const razorpayPaymentId = 'pay_webhook_456';
    const eventId = 'evt_unique_12345';

    await Payment.create({
      orderId: testOrder._id,
      razorpayOrderId,
      amount: testOrder.finalAmount,
      status: 'created'
    });

    const webhookPayload = {
      event_id: eventId,
      event: 'order.paid',
      payload: {
        payment: {
          entity: {
            id: razorpayPaymentId,
            order_id: razorpayOrderId,
            amount: 249900,
            status: 'captured'
          }
        }
      }
    };

    // First attempt
    const res1 = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', 'valid_test_webhook_sig')
      .send(webhookPayload);

    expect(res1.status).toBe(200);

    const orderAfterFirst = await Order.findById(testOrder._id);
    expect(orderAfterFirst.paymentStatus).toBe('paid');

    // Duplicate webhook attempt with identical event_id
    const res2 = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', 'valid_test_webhook_sig')
      .send(webhookPayload);

    expect(res2.status).toBe(200);
    expect(res2.body.message).toMatch(/already processed/i);
  });
});
