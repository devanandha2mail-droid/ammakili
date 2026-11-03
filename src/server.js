require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { startOrderCleanupJob } = require('./services/orderCleanup');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 1. Connect to Database
    await connectDB();

    // 2. Start scheduled background tasks
    startOrderCleanupJob();

    // 3. Start HTTP Server
    const server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(` Nest by Ammakkili - Online Store & Admin Panel`);
      console.log(` Running on: http://localhost:${PORT}`);
      console.log(` Admin Portal: http://localhost:${PORT}/admin`);
      console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=================================================`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down server gracefully...');
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

