const path = require('path');
const mongoose = require('mongoose');

// Trace non-JS static/template dependencies for Vercel bundler
path.join(process.cwd(), 'src', 'views');
path.join(process.cwd(), 'locales');
path.join(process.cwd(), 'tests', 'fixtures');

let app = null;
let appInitError = null;

try {
  app = require('../src/app');
} catch (err) {
  console.error('[Vercel Serverless] App initialization error:', err);
  appInitError = err;
}

const connectDB = require('../src/config/db');

let isConnecting = false;
let lastDbAttempt = 0;
const DB_RETRY_INTERVAL = 60000; // 60 seconds

module.exports = async (req, res) => {
  // If app failed to initialize
  if (appInitError || !app) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Configuration Required - Nest by Ammakkili</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; box-sizing: border-box; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2rem; max-width: 650px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          h2 { color: #f87171; margin-top: 0; display: flex; align-items: center; gap: 8px; }
          pre { background: #0f172a; padding: 1rem; border-radius: 8px; overflow-x: auto; color: #fca5a5; font-size: 0.85rem; border: 1px solid #ef4444; }
          p { line-height: 1.6; color: #cbd5e1; }
          ul, ol { color: #94a3b8; line-height: 1.8; }
          code { background: #334155; padding: 2px 6px; border-radius: 4px; color: #e2e8f0; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>⚠️ Vercel Initialization Error</h2>
          <pre>${appInitError ? appInitError.message : 'Application could not be loaded.'}</pre>
        </div>
      </body>
      </html>
    `);
  }

  // Attempt database connection with throttling to prevent 30-second blocking on unreachable DB
  if (mongoose.connection.readyState === 0 && !isConnecting) {
    const isLocalDb = !process.env.MONGODB_URI || process.env.MONGODB_URI.includes('127.0.0.1') || process.env.MONGODB_URI.includes('localhost');
    if (!isLocalDb) {
      const now = Date.now();
      if (now - lastDbAttempt > DB_RETRY_INTERVAL) {
        lastDbAttempt = now;
        isConnecting = true;
        try {
          await connectDB();
        } catch (dbErr) {
          console.warn('[Vercel Serverless] Cloud database connection attempt failed:', dbErr.message);
        } finally {
          isConnecting = false;
        }
      }
    } else {
      console.log('[Vercel Serverless] Running in preview mode with sample products.');
    }
  }

  // Forward to Express
  return app(req, res);
};
