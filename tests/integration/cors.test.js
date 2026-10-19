import request from 'supertest';
import app from '../../src/app.js';
import { isOriginAllowed, allowedOrigins } from '../../src/config/cors.js';

describe('CORS Configuration & Origin Validation Tests', () => {
  test('Explicit allowed origins include production Vercel frontend, custom domain, and admin', () => {
    expect(allowedOrigins).toContain('https://toyvolt-frontend.vercel.app');
    expect(allowedOrigins).toContain('https://toyvolt.com');
    expect(allowedOrigins).toContain('https://admin.toyvolt.com');
    expect(allowedOrigins).toContain('https://toyvolt-admin-3v2d.vercel.app');
    expect(allowedOrigins).toContain('http://localhost:5174');
  });

  test('isOriginAllowed helper strictly permits approved origins and blocks wildcards and unapproved domains', () => {
    expect(isOriginAllowed('https://toyvolt-frontend.vercel.app')).toBe(true);
    expect(isOriginAllowed('https://toyvolt-frontend.vercel.app/')).toBe(true); // Trailing slash handled
    expect(isOriginAllowed('https://toyvolt-admin-3v2d.vercel.app')).toBe(true);
    expect(isOriginAllowed('https://toyvolt-admin-3v2d.vercel.app/')).toBe(true);
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://localhost:5174')).toBe(true);
    expect(isOriginAllowed('https://toyvolt.com')).toBe(true);
    expect(isOriginAllowed(null)).toBe(true); // Server-to-server / curl
    expect(isOriginAllowed('')).toBe(true);

    // Strictly forbidden: wildcard and malicious origins
    expect(isOriginAllowed('*')).toBe(false);
    expect(isOriginAllowed('null')).toBe(false);
    expect(isOriginAllowed('https://evil-hacker.com')).toBe(false);
    expect(isOriginAllowed('https://toyvolt-fake.vercel.app')).toBe(false);
  });

  test('GET /api/v1/health allows production frontend https://toyvolt-frontend.vercel.app with credentials', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://toyvolt-frontend.vercel.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://toyvolt-frontend.vercel.app');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  test('GET /api/v1/products allows production frontend https://toyvolt-frontend.vercel.app', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .set('Origin', 'https://toyvolt-frontend.vercel.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://toyvolt-frontend.vercel.app');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  test('OPTIONS preflight for production frontend returns 204 with exact origin and credentials', async () => {
    const res = await request(app)
      .options('/api/v1/products')
      .set('Origin', 'https://toyvolt-frontend.vercel.app')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://toyvolt-frontend.vercel.app');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    expect(res.headers['access-control-allow-headers']).toMatch(/Content-Type/i);
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/i);
  });

  test('OPTIONS preflight for admin portal returns 204 with methods and credentials on /api/v1/admin/products', async () => {
    const res = await request(app)
      .options('/api/v1/admin/products')
      .set('Origin', 'https://toyvolt-admin-3v2d.vercel.app')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'Content-Type,Authorization,Cache-Control');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://toyvolt-admin-3v2d.vercel.app');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
    expect(res.headers['access-control-allow-methods']).toMatch(/PATCH/);
    expect(res.headers['access-control-allow-headers']).toMatch(/Content-Type/i);
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/i);
  });

  test('OPTIONS preflight for /api/v1/admin/coupons/:id allows PATCH from https://toyvolt-admin-3v2d.vercel.app', async () => {
    const res = await request(app)
      .options('/api/v1/admin/coupons/6acb8ea6cb6be6a85d0a9608')
      .set('Origin', 'https://toyvolt-admin-3v2d.vercel.app')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://toyvolt-admin-3v2d.vercel.app');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
    expect(res.headers['access-control-allow-methods']).toMatch(/PATCH/);
    expect(res.headers['access-control-allow-methods']).toBe('GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
    expect(res.headers['access-control-allow-headers']).toMatch(/content-type/i);
  });


  test('GET /api/v1/health allows http://localhost:5173 with credentials and matching origin', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  test('GET /api/v1/health allows http://localhost:5174 (admin panel) with credentials', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5174');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5174');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('Unapproved origin is rejected with 403 and never granted Access-Control-Allow-Origin', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://unapproved-malicious-origin.com');

    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.body.success).toBe(false);
  });

  test('Wildcard origin "*" is rejected and never returned as Access-Control-Allow-Origin', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', '*');

    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('404 error responses for allowed origins preserve exact CORS headers', async () => {
    const res = await request(app)
      .get('/api/v1/non-existent-endpoint-xyz')
      .set('Origin', 'https://toyvolt-frontend.vercel.app');

    expect(res.status).toBe(404);
    expect(res.headers['access-control-allow-origin']).toBe('https://toyvolt-frontend.vercel.app');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('Server-to-server or non-browser request with no Origin header succeeds', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
