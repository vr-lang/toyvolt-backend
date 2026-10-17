import request from 'supertest';
import app from '../../src/app.js';
import { isOriginAllowed, allowedOrigins } from '../../src/config/cors.js';

describe('CORS Configuration & Origin Validation Tests', () => {
  test('Explicit allowed origins include storefront (5173), admin (5174), and production domains', () => {
    expect(allowedOrigins).toContain('http://localhost:5173');
    expect(allowedOrigins).toContain('http://localhost:5174');
    expect(allowedOrigins).toContain('https://toyvolt.com');
    expect(allowedOrigins).toContain('https://admin.toyvolt.com');
  });

  test('isOriginAllowed helper allows 5173, 5174, production domains, and localhost variants', () => {
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://localhost:5173/')).toBe(true); // Trailing slash handled
    expect(isOriginAllowed('http://localhost:5174')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5174')).toBe(true);
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://localhost:5175')).toBe(true);
    expect(isOriginAllowed('https://toyvolt.com')).toBe(true);
    expect(isOriginAllowed('https://admin.toyvolt.com')).toBe(true);
    expect(isOriginAllowed(null)).toBe(true); // Non-browser / curl
    expect(isOriginAllowed('')).toBe(true);
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

  test('GET /api/v1/health allows production storefront https://toyvolt.com', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://toyvolt.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://toyvolt.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('OPTIONS preflight request for http://localhost:5173 returns 204 with full CORS headers', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    expect(res.headers['access-control-allow-headers']).toMatch(/Content-Type/i);
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/i);
  });

  test('OPTIONS preflight request for deeply nested endpoint (/api/v1/payments/create-order) succeeds', async () => {
    const res = await request(app)
      .options('/api/v1/payments/create-order')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('Server-to-server or non-browser request with no Origin header succeeds', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
