const mongoose = require('mongoose');
const net = require('net');

function checkLocalPort(host, port, timeout = 150) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return;
  }
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';
  const isLocal = !process.env.MONGODB_URI || uri.includes('127.0.0.1') || uri.includes('localhost');

  if (isLocal && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const isRunning = await checkLocalPort('127.0.0.1', 27017);
    if (!isRunning) {
      console.warn('[MongoDB] Local MongoDB (127.0.0.1:27017) is offline. Starting in resilient preview mode.');
      return;
    }
  }

  try {

    // Safety guard: Never run tests against real/production database
    if (process.env.NODE_ENV === 'test') {
      if (!uri.includes('_test')) {
        const errMsg = 'FATAL: In test mode, MONGODB_URI must contain "_test" to prevent modifying production database!';
        console.error(errMsg);
        throw new Error(errMsg);
      }
      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
        const errMsg = 'FATAL: Razorpay key id must start with "rzp_test_" for testing!';
        console.error(errMsg);
        throw new Error(errMsg);
      }
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000
    });
    console.log(`[MongoDB] Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

    // Ensure TTL index on sessions collection
    try {
      await mongoose.connection.collection('sessions').createIndex(
        { expires: 1 },
        { expireAfterSeconds: 0, background: true }
      );
    } catch (e) {
      // index may already exist
    }
  } catch (err) {
    console.error('[MongoDB] Connection error:', err.message);
    if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
      process.exit(1);
    }
    throw err;
  }
};

module.exports = connectDB;
