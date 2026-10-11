import request from 'supertest';
import bcrypt from 'bcrypt';
import { jest } from '@jest/globals';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { OtpToken } from '../../src/models/OtpToken.js';
import { emailService } from '../../src/services/emailService.js';

describe('Auth & OTP Integration Tests', () => {
  const testUser = {
    name: 'Yuvraj Singh',
    email: 'yuvraj@toyvolt.test',
    password: 'Password123!'
  };

  test('POST /api/v1/auth/register creates unverified account and generates OTP', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const user = await User.findOne({ email: testUser.email });
    expect(user).toBeTruthy();
    expect(user.isEmailVerified).toBe(false);
    expect(user.role).toBe('customer');

    const otpRecord = await OtpToken.findOne({ email: testUser.email, purpose: 'register' });
    expect(otpRecord).toBeTruthy();
    expect(otpRecord.otpHash).toBeTruthy();
  });

  test('POST /api/v1/auth/verify-email verifies user and sets auth cookies', async () => {
    // 1. Register user
    await request(app).post('/api/v1/auth/register').send(testUser);

    // 2. Mock a known OTP in DB
    const knownOtp = '123456';
    const otpHash = await bcrypt.hash(knownOtp, 10);
    await OtpToken.findOneAndUpdate(
      { email: testUser.email, purpose: 'register' },
      { otpHash, isConsumed: false, expiresAt: new Date(Date.now() + 300000) }
    );

    // 3. Verify with correct OTP
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: testUser.email, otp: knownOtp });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.headers['set-cookie']).toBeDefined();

    const user = await User.findOne({ email: testUser.email });
    expect(user.isEmailVerified).toBe(true);
  });

  test('Rejects invalid OTP and tracks attempts', async () => {
    await request(app).post('/api/v1/auth/register').send(testUser);

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: testUser.email, otp: '999999' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    const otpRecord = await OtpToken.findOne({ email: testUser.email, purpose: 'register' });
    expect(otpRecord.attempts).toBe(1);
  });

  test('Blocks OTP verification when expired', async () => {
    await request(app).post('/api/v1/auth/register').send(testUser);

    // Set expiration in past
    await OtpToken.findOneAndUpdate(
      { email: testUser.email, purpose: 'register' },
      { expiresAt: new Date(Date.now() - 1000) }
    );

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: testUser.email, otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  test('Prevents OTP reuse once consumed', async () => {
    await request(app).post('/api/v1/auth/register').send(testUser);

    const knownOtp = '654321';
    const otpHash = await bcrypt.hash(knownOtp, 10);
    await OtpToken.findOneAndUpdate(
      { email: testUser.email, purpose: 'register' },
      { otpHash, isConsumed: false, expiresAt: new Date(Date.now() + 300000) }
    );

    // First use: success
    await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: testUser.email, otp: knownOtp });

    // Second use: must fail
    const reusedRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: testUser.email, otp: knownOtp });

    expect(reusedRes.status).toBe(400);
  });

  test('Enforces resend cooldown of 60 seconds', async () => {
    await request(app).post('/api/v1/auth/register').send(testUser);

    // Request immediately again
    const resendRes = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ email: testUser.email, purpose: 'register' });

    expect(resendRes.status).toBe(429);
    expect(resendRes.body.message).toMatch(/wait.*seconds/i);
  });

  test('Blocks login if email is not verified', async () => {
    await request(app).post('/api/v1/auth/register').send(testUser);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.message).toMatch(/not verified/i);
  });

  test('Allows login after email is verified', async () => {
    await User.create({
      ...testUser,
      isEmailVerified: true
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.accessToken).toBeDefined();
  });

  describe('Resend Email Delivery & Failure Handling', () => {
    afterEach(() => {
      emailService.setResendClient(null);
    });

    test('POST /api/v1/auth/register succeeds when Resend accepts delivery', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        data: { id: 'msg_resend_delivery_accepted_12345' },
        error: null
      });

      emailService.setResendClient({
        emails: { send: mockSend }
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Resend Test User',
          email: 'resend-success@toyvolt.test',
          password: 'Password123!'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/verification code has been sent/i);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'resend-success@toyvolt.test'
        })
      );
    });

    test('POST /api/v1/auth/register fails and does NOT claim success when Resend returns an error', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        data: null,
        error: {
          message: 'You can only send testing emails to your own email address (yuvraj85274@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains',
          name: 'validation_error',
          statusCode: 400
        }
      });

      emailService.setResendClient({
        emails: { send: mockSend }
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Resend Restricted User',
          email: 'unregistered-recipient@toyvolt.test',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Email delivery failed/i);
      expect(res.body.message).toMatch(/testing emails/i);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('POST /api/v1/auth/register propagates network error when Resend SDK call throws', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('Connection timeout to api.resend.com'));

      emailService.setResendClient({
        emails: { send: mockSend }
      });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Resend Timeout User',
          email: 'timeout-user@toyvolt.test',
          password: 'Password123!'
        });

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Email delivery failed/i);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
