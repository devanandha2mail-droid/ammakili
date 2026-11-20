const path = require('path');
const fs = require('fs');
const envFile = process.env.ENV_FILE || (process.env.NODE_ENV === 'test' ? '.env.test' : '.env');
const envPath = fs.existsSync(path.resolve(process.cwd(), envFile))
  ? path.resolve(process.cwd(), envFile)
  : path.resolve(__dirname, '..', envFile);
require('dotenv').config({ path: envPath });
const { validateEnvironment } = require('./utils/envGuard');
validateEnvironment();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');
const { ensureInitialOwner } = require('./services/adminInit');
const { startOrderCleanupJob } = require('./services/orderCleanup');
const { startWorker, stopWorker } = require('./services/photoJobWorker');
const { migrateProductImages } = require('./utils/migrateImages');
const { validateRazorpayKeys } = require('./services/razorpay');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 1. Connect to Database
    await connectDB();
  } catch (err) {
    if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
      process.exit(1);
    }
    console.warn(`[Server] Note: MongoDB connection to "${process.env.MONGODB_URI || '127.0.0.1:27017'}" was not established.`);
  }

  const dbConnected = (mongoose.connection.readyState === 1);
  if (!dbConnected) {
    console.log('[Server] Starting in Resilient Development / Preview Mode (Mock catalog, PDP, sizes, cart, policies).');
  } else {
    try {
      // 2. Run data migrations and background jobs
      await ensureInitialOwner();
      await migrateProductImages();
      startOrderCleanupJob();
      startWorker();
    } catch (e) {
      console.warn('[Server] Background task warning:', e.message);
    }
  }

  try {
    // 4. Start HTTP Server
    const server = http.createServer(app);
    server.listen(PORT, async () => {
      console.log(`=================================================`);
      console.log(` Nest by Ammakkili - Online Store & Admin Panel`);
      console.log(` Running on: http://localhost:${PORT}`);
      console.log(` Admin Portal: http://localhost:${PORT}/admin`);
      console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=================================================`);

      // In non-production, perform harmless API check on Razorpay keys
      if (process.env.NODE_ENV !== 'production') {
        try {
          await validateRazorpayKeys();
        } catch (rzpErr) {
          console.log(`Razorpay keys INVALID: ${rzpErr.message || 'Validation failed'}`);
        }
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down server gracefully...');
      stopWorker();
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    });
  } catch (err) {
    console.error('Fatal server startup failure:', err);
    process.exit(1);
  }
}

startServer();

