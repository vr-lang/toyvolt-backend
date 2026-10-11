import request from 'supertest';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import app from '../../src/app.js';
import { ensureDbConnected } from '../../src/middleware/dbMiddleware.js';
import { Product } from '../../src/models/Product.js';

describe('Serverless Database Connection & Health Verification', () => {
  beforeEach(async () => {
    if (mongoose.connection.readyState === 0 && process.env.TEST_MONGO_URI) {
      await mongoose.connect(process.env.TEST_MONGO_URI);
      if (global.mongoose) {
        global.mongoose.conn = mongoose.connection;
        global.mongoose.promise = null;
      }
    }
    await Product.deleteMany({});
  });

  afterEach(async () => {
    if (mongoose.connection.readyState === 0 && process.env.TEST_MONGO_URI) {
      await mongoose.connect(process.env.TEST_MONGO_URI);
      if (global.mongoose) {
        global.mongoose.conn = mongoose.connection;
        global.mongoose.promise = null;
      }
    }
  });

  test('GET /api/v1/health returns 200 with database: connected when healthy', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services.database).toBe('connected');
  });

  test('GET /api/v1/products executes successfully on connected database', async () => {
    await Product.create({
      name: 'Toyvolt RC Monster Truck',
      slug: 'rc-monster-truck-health-test',
      sku: 'TV-TEST-HEALTH-001',
      description: 'High performance testing monster truck',
      category: 'Remote Control Cars',
      sellingPrice: 249900,
      costPrice: 120000,
      availableStock: 10,
      weightGrams: 850,
      dimensions: { lengthCm: 32, breadthCm: 18, heightCm: 14 },
      isActive: true
    });

    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.products)).toBe(true);
    expect(res.body.data.products.some(p => p.sku === 'TV-TEST-HEALTH-001')).toBe(true);
  });

  test('ensureDbConnected fails fast with 503 when connection cannot be established', async () => {
    await mongoose.disconnect();
    if (global.mongoose) {
      global.mongoose.conn = null;
      global.mongoose.promise = null;
    }

    const connectSpy = jest.spyOn(mongoose, 'connect').mockRejectedValueOnce(
      new Error('MongooseServerSelectionError: connect ECONNREFUSED 10.0.0.1:27017')
    );

    const mockReq = { path: '/products', originalUrl: '/api/v1/products' };
    const mockRes = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      }
    };
    const mockNext = jest.fn();

    await ensureDbConnected(mockReq, mockRes, mockNext);

    expect(connectSpy).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.statusCode).toBe(503);
    expect(mockRes.body.success).toBe(false);
    expect(mockRes.body.message).toMatch(/Database connection unavailable/i);

    connectSpy.mockRestore();
  });

  test('GET /api/v1/health returns 503 degraded when database connection is disconnected', async () => {
    await mongoose.disconnect();
    if (global.mongoose) {
      global.mongoose.conn = null;
      global.mongoose.promise = null;
    }

    const connectSpy = jest.spyOn(mongoose, 'connect').mockRejectedValueOnce(
      new Error('Atlas connection failed')
    );

    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.database).toBe('disconnected');

    connectSpy.mockRestore();
  });
});
