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

// 1. Mandatory production and local origins that are always explicitly permitted
const productionOrigins = [
  'https://toyvolt-admin-3v2d.vercel.app',
  'https://toyvolt-admin.vercel.app',
  'https://toyvolt-frontend.vercel.app',
  'https://toyvolt.com',
  'https://www.toyvolt.com',
  'https://admin.toyvolt.com',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

// 2. Dynamic origins from environment configuration
const configuredOrigins = [
  ...parseOrigins(env.ALLOWED_ORIGINS),
  ...parseOrigins(env.FRONTEND_URL),
  ...parseOrigins(env.ADMIN_URL),
  ...parseOrigins(env.CLIENT_URL)
];

// 3. Local development origins
const developmentOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

export const allowedOrigins = Array.from(
  new Set([...productionOrigins, ...configuredOrigins, ...developmentOrigins])
);
const allowedOriginsSet = new Set(allowedOrigins.map((o) => o.toLowerCase()));

/**
 * Checks whether an incoming origin is permitted.
 * Supports exact allowlist matches, Toyvolt Vercel deployments, localhost, and non-browser calls.
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

  // 2. Check Toyvolt Vercel deployment patterns (e.g. toyvolt-admin-*.vercel.app, toyvolt-frontend-*.vercel.app)
  const isToyvoltVercel = /^https:\/\/(toyvolt-frontend(-[a-z0-9]+)*|toyvolt-admin(-[a-z0-9]+)*|toyvolt)\.vercel\.app$/i.test(cleanOrigin);
  if (isToyvoltVercel) {
    return true;
  }

  // 3. Allow localhost / 127.0.0.1 on any port
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin);
  if (isLocalhost) {
    return true;
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
    'Cache-Control',
    'Pragma',
    'Expires',
    'If-Modified-Since',
    'If-None-Match',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'x-razorpay-signature'
  ],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 204,
  maxAge: 86400
};

export const corsMiddleware = cors(corsOptions);
