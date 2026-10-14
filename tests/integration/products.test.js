import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Order } from '../../src/models/Order.js';
import { generateAccessToken } from '../../src/utils/token.js';
import { cloudinary } from '../../src/config/cloudinary.js';

describe('Products & Admin Authorization Integration Tests', () => {
  let customerToken;
  let adminToken;
  let sampleProduct;

  beforeEach(async () => {
    const customer = await User.create({
      name: 'Customer One',
      email: 'customer@toyvolt.test',
      password: 'Password123!',
      role: 'customer',
      isEmailVerified: true
    });
    customerToken = generateAccessToken({ id: customer._id, role: 'customer' });

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@toyvolt.test',
      password: 'AdminPassword123!',
      role: 'admin',
      isEmailVerified: true
    });
    adminToken = generateAccessToken({ id: admin._id, role: 'admin' });

    sampleProduct = await Product.create({
      name: 'Toyvolt Apex-1 Drift Car',
      slug: 'toyvolt-apex-1-drift-car',
      sku: 'TV-RC-001',
      description: 'High performance RC drift car',
      category: 'Remote Control Cars',
      sellingPrice: 249900,
      costPrice: 120000,
      availableStock: 50,
      weightGrams: 850,
      dimensions: { lengthCm: 32, breadthCm: 18, heightCm: 14 }
    });
  });

  test('GET /api/v1/products returns public catalogue without costPrice', async () => {
    const res = await request(app).get('/api/v1/products');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.products.length).toBe(1);
    expect(res.body.data.products[0].sellingPrice).toBe(249900);
    expect(res.body.data.products[0].costPrice).toBeUndefined();
  });

  test('GET /api/v1/products/:slug returns product by slug', async () => {
    const res = await request(app).get(`/api/v1/products/${sampleProduct.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product.name).toBe('Toyvolt Apex-1 Drift Car');
    expect(res.body.data.product.costPrice).toBeUndefined();
  });

  test('Rejects unauthorized admin product creation by customer', async () => {
    const res = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        name: 'Hacker Product',
        slug: 'hacker-product',
        sku: 'HACK-01',
        description: 'Should fail',
        sellingPrice: 10000,
        availableStock: 10,
        weightGrams: 500,
        dimensions: { lengthCm: 10, breadthCm: 10, heightCm: 10 }
      });

    expect(res.status).toBe(403);
  });

  test('Admin can create new product', async () => {
    const res = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Toyvolt Storm Buggy',
        slug: 'toyvolt-storm-buggy',
        sku: 'TV-RC-002',
        description: 'Off-road 4WD high speed buggy',
        category: 'Off-Road RC',
        sellingPrice: 299900,
        costPrice: 150000,
        availableStock: 25,
        weightGrams: 950,
        dimensions: { lengthCm: 35, breadthCm: 20, heightCm: 15 }
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.product.sku).toBe('TV-RC-002');
  });

  test('Soft-deletes product if referenced in an order', async () => {
    // Create an order referencing sampleProduct
    await Order.create({
      orderNumber: 'TV-TEST-ORDER-1',
      userId: (await User.findOne({ role: 'customer' }))._id,
      items: [{
        productId: sampleProduct._id,
        name: sampleProduct.name,
        slug: sampleProduct.slug,
        sku: sampleProduct.sku,
        unitPrice: sampleProduct.sellingPrice,
        quantity: 1,
        total: sampleProduct.sellingPrice
      }],
      shippingAddress: {
        fullName: 'Test User',
        phone: '9876543210',
        addressLine1: 'Road 1',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001'
      },
      subtotal: sampleProduct.sellingPrice,
      finalAmount: sampleProduct.sellingPrice
    });

    const deleteRes = await request(app)
      .delete(`/api/v1/admin/products/${sampleProduct._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.isArchived).toBe(true);

    const updated = await Product.findById(sampleProduct._id);
    expect(updated.isArchived).toBe(true);
    expect(updated.isActive).toBe(false);
  });

  test('Admin can list products (including costPrice) and fetch single product by ID', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.products[0].costPrice).toBe(120000);

    const detailRes = await request(app)
      .get(`/api/v1/admin/products/${sampleProduct._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.product.sku).toBe('TV-RC-001');
    expect(detailRes.body.data.product.costPrice).toBe(120000);
  });

  test('Admin can update product via PATCH and PUT and validates compareAtPrice >= sellingPrice', async () => {
    const patchRes = await request(app)
      .patch(`/api/v1/admin/products/${sampleProduct._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        availableStock: 75,
        sellingPrice: 229900,
        compareAtPrice: 279900
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.product.availableStock).toBe(75);
    expect(patchRes.body.data.product.sellingPrice).toBe(229900);
    expect(patchRes.body.data.product.compareAtPrice).toBe(279900);

    // Reject invalid compareAtPrice < sellingPrice
    const badPriceRes = await request(app)
      .put(`/api/v1/admin/products/${sampleProduct._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        compareAtPrice: 100000 // less than existing sellingPrice 229900
      });

    expect(badPriceRes.status).toBe(400);
  });

  test('Permanently deletes product when not referenced in any order', async () => {
    const deleteRes = await request(app)
      .delete(`/api/v1/admin/products/${sampleProduct._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.isArchived).toBe(false);

    const checkDeleted = await Product.findById(sampleProduct._id);
    expect(checkDeleted).toBeNull();
  });

  test('Admin can upload and delete a product image', async () => {
    const uploadSpy = jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((_opts, cb) => {
      return {
        end: () => cb(null, {
          secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/toyvolt/products/rc-car.png',
          public_id: 'toyvolt/products/rc-car'
        })
      };
    });
    const destroySpy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });

    const fakeImageBuffer = Buffer.from('fake-png-content');
    const uploadRes = await request(app)
      .post('/api/v1/admin/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', fakeImageBuffer, { filename: 'rc-car.png', contentType: 'image/png' });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.data.url).toBeDefined();
    expect(uploadRes.body.data.publicId).toBeDefined();

    const delImgRes = await request(app)
      .delete('/api/v1/admin/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ publicId: uploadRes.body.data.publicId });

    expect(delImgRes.status).toBe(200);
    expect(delImgRes.body.success).toBe(true);

    uploadSpy.mockRestore();
    destroySpy.mockRestore();
  });
});


