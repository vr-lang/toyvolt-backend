import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/database.js';

let server;

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

// Start server if executed directly (not in Vercel or test)
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  startServer();
}

// Export for serverless environments (Vercel)
export default app;
