import { Router } from 'express';
import mongoose from 'mongoose';
import { env, hasResend, hasRazorpay, hasShiprocket, hasCloudinary } from '../config/env.js';
import { connectDB } from '../config/database.js';

const router = Router();

router.get('/health', async (req, res) => {
  // Ensure connection attempt in serverless environments if not already active
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch {
      // Ignored: readyState will remain 0 and report disconnected below
    }
  }

  const isConnected = mongoose.connection.readyState === 1;
  let dbPing = false;
  if (isConnected && mongoose.connection.db) {
    try {
      await mongoose.connection.db.admin().ping();
      dbPing = true;
    } catch {
      dbPing = false;
    }
  }

  const statusCode = isConnected ? 200 : 503;

  res.status(statusCode).json({
    success: isConnected,
    status: isConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: Math.round(process.uptime()),
    port: env.PORT,
    services: {
      database: isConnected ? (dbPing ? 'connected' : 'connecting') : 'disconnected',
      email: hasResend() ? 'configured' : 'unconfigured',
      payments: hasRazorpay() ? 'configured' : 'unconfigured',
      shipping: hasShiprocket() ? 'configured' : 'unconfigured',
      mediaStorage: hasCloudinary() ? 'configured' : 'unconfigured'
    }
  });
});

export default router;
