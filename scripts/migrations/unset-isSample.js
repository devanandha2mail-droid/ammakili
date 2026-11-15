require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../../src/models/Product');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';

async function migrate() {
  try {
    console.log('Connecting to database:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // Unset isSample on all products
    const result = await Product.updateMany(
      { isSample: { $exists: true } },
      { $unset: { isSample: "" } }
    );

    console.log(`Migration complete: unset 'isSample' on ${result.modifiedCount} products.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();

