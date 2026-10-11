import cors from 'cors';
import { env } from './env.js';

const allowedOrigins = [
  env.FRONTEND_URL,
  env.ADMIN_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean);

export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    return callback(new Error(`CORS policy does not allow access from origin: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Set-Cookie']
};

export const corsMiddleware = cors(corsOptions);
