import { connectDB } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware ensuring MongoDB is connected before handling database-dependent routes.
 * In serverless environments (Vercel), connections are initialized lazily upon request.
 */
export const ensureDbConnected = async (req, res, next) => {
  // Allow health endpoint to manage its own diagnostics/status reporting
  if (req.path === '/health' || req.originalUrl === '/api/v1/health') {
    return next();
  }

  try {
    await connectDB();
    next();
  } catch (error) {
    logger.error(`Database connection unavailable: ${error.message}`);
    return res.status(503).json({
      success: false,
      message: 'Database connection unavailable. Please check database configuration or retry shortly.'
    });
  }
};
