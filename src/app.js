import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { corsMiddleware } from './config/cors.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AppError } from './utils/AppError.js';
import { ensureDbConnected } from './middleware/dbMiddleware.js';
import v1Routes from './routes/index.js';

const app = express();

// 1. Security Headers (allow cross-origin API consumption by frontend apps)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// 2. CORS allowlist with credentials
app.use(corsMiddleware);

// 3. Request Logging
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// 4. Rate Limiting
app.use('/api', globalLimiter);

// 5. Body Parsing with raw body preservation for webhook signature verification
app.use(express.json({
  limit: '2mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 6. Cookie Parser
app.use(cookieParser());

// 7. Ensure MongoDB connection (serverless & long-running runtimes)
app.use(ensureDbConnected);

// 8. Mount API v1
app.use('/api/v1', v1Routes);

// Root greeting / API discovery
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to Toyvolt E-commerce Backend API',
    version: '1.0.0',
    documentation: '/api/v1/health'
  });
});

// 8. 404 Handler for undefined routes
app.all('*', (req, res, next) => {
  next(new AppError(`Cannot find endpoint ${req.method} ${req.originalUrl} on this server.`, 404));
});

// 9. Centralized Error Handler
app.use(errorHandler);

export default app;
