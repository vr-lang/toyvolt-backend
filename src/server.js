import app from './app.js';
import { env, hasShiprocket } from './config/env.js';
import { connectDB, disconnectDB } from './config/database.js';

let server;
let backgroundSyncInterval = null;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    server = app.listen(env.PORT, () => {
      console.log(`
⚡ ====================================================
🚗 TOYVOLT BACKEND RUNNING
📡 Port:        ${env.PORT}
🌍 Environment: ${env.NODE_ENV}
🔗 URL:         http://localhost:${env.PORT}
🏥 Health:      http://localhost:${env.PORT}/api/v1/health
====================================================
      `);

      // Start periodic background shipment reconciliation (every 15 minutes)
      if (hasShiprocket()) {
        const SYNC_INTERVAL_MS = 15 * 60 * 1000;
        backgroundSyncInterval = setInterval(async () => {
          try {
            const { shiprocketService } = await import('./services/shiprocketService.js');
            await shiprocketService.reconcileShipments();
          } catch (syncErr) {
            console.error('[Shiprocket Background Sync] Error:', syncErr.message);
          }
        }, SYNC_INTERVAL_MS);
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${env.PORT} is already in use.`);
        if (Number(env.PORT) === 5000) {
          console.error(`💡 Note: On macOS, port 5000 is occupied by ControlCenter (AirPlay Receiver). Please change PORT to 5001 in .env.`);
        }
      } else {
        console.error(`❌ Server error: ${err.message}`);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start Toyvolt server:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown handlers
const handleShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
  if (backgroundSyncInterval) {
    clearInterval(backgroundSyncInterval);
  }
  if (server) {
    server.close(async () => {
      console.log('🔒 Closed active HTTP connections.');
      await disconnectDB();
      console.log('📦 Closed MongoDB connection.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Start persistent HTTP server in local/dedicated environments
// Avoid calling app.listen() in serverless runtimes (Vercel, AWS Lambda) or Jest tests
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
);

if (process.env.NODE_ENV !== 'test' && !isServerless) {
  startServer();
}

// Export for serverless environments (Vercel)
export default app;
