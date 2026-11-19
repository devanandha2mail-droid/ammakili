const path = require('path');
const mongoose = require('mongoose');

// Trace non-JS static/template dependencies for Vercel bundler
path.join(process.cwd(), 'src', 'views');
path.join(process.cwd(), 'locales');

let app = null;
let appInitError = null;

try {
  app = require('../src/app');
} catch (err) {
  console.error('[Vercel Serverless] App initialization error:', err);
  appInitError = err;
}

const connectDB = require('../src/config/db');

module.exports = async (req, res) => {
  // If app failed to initialize (e.g., missing critical environment variables)
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
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; background: #991b1b; color: #fff; font-size: 12px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2><span class="badge">Vercel Setup</span> Environment Configuration Needed</h2>
          <p>The Express application requires its production environment variables to be configured in Vercel:</p>
          <pre>${appInitError ? appInitError.message : 'Application could not be loaded.'}</pre>
          <p><strong>To resolve this:</strong></p>
          <ol>
            <li>Open your <strong>Vercel Dashboard &rarr; Project (ammakili) &rarr; Settings &rarr; Environment Variables</strong></li>
            <li>Add your <code>MONGODB_URI</code> (e.g. your cloud MongoDB Atlas connection string)</li>
            <li>Add <code>SESSION_SECRET</code> (at least 32 characters)</li>
            <li>Add <code>CSRF_SECRET</code> (at least 32 characters)</li>
            <li>Add <code>ALLOW_TEST_PAYMENTS_IN_PROD=true</code> (if testing with Razorpay test keys in production)</li>
            <li>Redeploy the project</li>
          </ol>
        </div>
      </body>
      </html>
    `);
  }

  // Ensure cloud database is connected
  try {
    await connectDB();
  } catch (dbErr) {
    console.error('[Vercel Serverless] Database connection error:', dbErr);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Database Connection Error - Nest by Ammakkili</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; box-sizing: border-box; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2rem; max-width: 650px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          h2 { color: #fbbf24; margin-top: 0; }
          pre { background: #0f172a; padding: 1rem; border-radius: 8px; overflow-x: auto; color: #fde68a; font-size: 0.85rem; border: 1px solid #f59e0b; }
          p { line-height: 1.6; color: #cbd5e1; }
          code { background: #334155; padding: 2px 6px; border-radius: 4px; color: #e2e8f0; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>📡 Database Connection Failed</h2>
          <p>Vercel serverless functions cannot connect to <code>localhost</code> (127.0.0.1). You must provide a cloud MongoDB database connection string (e.g. from MongoDB Atlas).</p>
          <pre>${dbErr.message}</pre>
          <p>Please configure <code>MONGODB_URI</code> in <strong>Vercel Dashboard &rarr; Settings &rarr; Environment Variables</strong>, and make sure your MongoDB Atlas Network Access whitelist allows connections from anywhere (<code>0.0.0.0/0</code>).</p>
        </div>
      </body>
      </html>
    `);
  }

  // Forward to Express
  return app(req, res);
};
