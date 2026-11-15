const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';

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

    await mongoose.connect(uri);
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
    process.exit(1);
  }
};

module.exports = connectDB;
