import cors from 'cors';
import { env } from './env.js';

/**
 * Parses comma-separated origin strings and normalizes trailing slashes and casing.
 */
export const parseOrigins = (val) => {
  if (!val || typeof val !== 'string') return [];
  return val
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
};

// 1. Mandatory production origins that are always explicitly permitted
const productionOrigins = [
  'https://toyvolt-frontend.vercel.app',
  'https://toyvolt.com',
  'https://www.toyvolt.com',
  'https://admin.toyvolt.com',
  'https://toyvolt-admin.vercel.app'
];

// 2. Dynamic origins from environment configuration
const configuredOrigins = [
  ...parseOrigins(env.ALLOWED_ORIGINS),
  ...parseOrigins(env.FRONTEND_URL),
  ...parseOrigins(env.ADMIN_URL),
  ...parseOrigins(env.CLIENT_URL)
];

// 3. Local development origins (included only in non-production environments)
const developmentOrigins = env.NODE_ENV !== 'production' ? [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
] : [];

export const allowedOrigins = Array.from(
  new Set([...productionOrigins, ...configuredOrigins, ...developmentOrigins])
);
const allowedOriginsSet = new Set(allowedOrigins.map((o) => o.toLowerCase()));

/**
 * Checks whether an incoming origin is permitted.
 * Supports exact allowlist matches, localhost in non-production, and non-browser calls.
 * Never allows wildcard '*' when credentials mode is enabled.
 */
export const isOriginAllowed = (origin) => {
  if (!origin) return true; // Server-to-server, curl, mobile apps (no Origin header)

  const cleanOrigin = origin.trim().replace(/\/+$/, '').toLowerCase();

  // Wildcards are strictly forbidden when credentials: true
  if (cleanOrigin === '*' || cleanOrigin === 'null') {
    return false;
  }

  // 1. Check against explicit allowlist
  if (allowedOriginsSet.has(cleanOrigin)) {
    return true;
  }

  // 2. Allow localhost / 127.0.0.1 on any port only in non-production environments
  if (env.NODE_ENV !== 'production') {
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin);
    if (isLocalhost) {
      return true;
    }
  }

  return false;
};

export const corsOptions = {
  origin: (origin, callback) => {
    // Non-browser requests with no Origin header (e.g. server-to-server, curl)
    if (!origin) {
      return callback(null, true);
    }

    if (isOriginAllowed(origin)) {
      // Pass the sanitized explicit origin string so cors sets this exact origin, never '*'
      const cleanOrigin = origin.trim().replace(/\/+$/, '');
      return callback(null, cleanOrigin);
    }

    // Disallowed origin: reject via standard CORS error
    return callback(new Error(`CORS policy does not allow access from origin: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'x-razorpay-signature'
  ],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 204,
  maxAge: 86400
};

export const corsMiddleware = cors(corsOptions);
