import cors from 'cors';
import { env } from './env.js';

/**
 * Parses comma-separated origin strings and normalizes trailing slashes.
 */
const parseOrigins = (val) => {
  if (!val || typeof val !== 'string') return [];
  return val
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
};

// Explicit allowed origins list: includes both customer storefront (5173) and admin console (5174)
const explicitOrigins = [
  ...parseOrigins(env.FRONTEND_URL),
  ...parseOrigins(env.ADMIN_URL),
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://toyvolt.com',
  'https://www.toyvolt.com',
  'https://admin.toyvolt.com'
].map((o) => o.toLowerCase());

export const allowedOrigins = Array.from(new Set(explicitOrigins));
const allowedOriginsSet = new Set(allowedOrigins);

/**
 * Checks whether an incoming origin is permitted.
 * Supports exact origin matches, any localhost / 127.0.0.1 port in dev, and server-to-server calls.
 */
export const isOriginAllowed = (origin) => {
  if (!origin) return true; // Non-browser clients (curl, mobile apps, server-to-server)

  const cleanOrigin = origin.trim().replace(/\/+$/, '').toLowerCase();

  // 1. Explicit allowlist match
  if (allowedOriginsSet.has(cleanOrigin)) {
    return true;
  }

  // 2. Any localhost or 127.0.0.1 port (Vite, Next.js, Create-React-App)
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin);
  if (isLocalhost) {
    return true;
  }

  // 3. Fallback for development mode
  if (env.NODE_ENV === 'development') {
    return true;
  }

  return false;
};

export const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy does not allow access from origin: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'x-razorpay-signature'
  ],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 204,
  maxAge: 86400
};

export const corsMiddleware = cors(corsOptions);

