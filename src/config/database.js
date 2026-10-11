import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Global cache across serverless function invocations.
 * In serverless environments (e.g. Vercel), container globals
 * are preserved across warm invocations.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
  // If already connected (readyState 1 = connected)
  if (mongoose.connection.readyState === 1) {
    cached.conn = mongoose.connection;
    return cached.conn;
  }

  // If cached connection is alive
  if (cached.conn && cached.conn.readyState === 1) {
    return cached.conn;
  }

  // If a connection promise is not already in-flight, initialize one
  if (!cached.promise) {
    const opts = {
      serverSelectionTimeoutMS: 5000,
      autoIndex: env.NODE_ENV !== 'production'
    };

    cached.promise = mongoose.connect(env.MONGODB_URI, opts).then((mongooseInstance) => {
      logger.info(`✅ MongoDB Connected successfully [host: ${mongooseInstance.connection.host}]`);
      cached.conn = mongooseInstance.connection;
      return cached.conn;
    }).catch((err) => {
      cached.promise = null;
      cached.conn = null;
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    cached.conn = null;
    logger.error(`MongoDB Connection Error: ${error.message}`);
    throw error;
  }
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  cached.conn = null;
  cached.promise = null;
};
