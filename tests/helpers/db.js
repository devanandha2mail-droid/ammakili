const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Load test env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

const Product = require('../../src/models/Product');
const Order = require('../../src/models/Order');
const Customer = require('../../src/models/Customer');
const Settings = require('../../src/models/Settings');
const Banner = require('../../src/models/Banner');
const Admin = require('../../src/models/Admin');

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_test';

// Strict Safety Guard
function assertTestDatabase() {
  if (!TEST_DB_URI.includes('_test')) {
    throw new Error(`FATAL: MONGODB_URI ("${TEST_DB_URI}") does not contain "_test". Aborting to protect real data.`);
  }
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
    throw new Error('FATAL: RAZORPAY_KEY_ID must start with "rzp_test_". Aborting to prevent live transaction calls.');
  }
}

async function connectTestDB() {
  assertTestDatabase();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB_URI);
  }
}

async function resetAndSeedDatabase() {
  assertTestDatabase();
  await connectTestDB();

  // Clear existing collections
  await Promise.all([
    Product.deleteMany({}),
    Order.deleteMany({}),
    Customer.deleteMany({}),
    Settings.deleteMany({}),
    Banner.deleteMany({}),
    Admin.deleteMany({})
  ]);

  // 1. Seed Admin
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@nestammakkili.com').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'AdminNest2026!';
  const passwordHash = await bcrypt.hash(adminPass, 10);
  await Admin.create({
    email: adminEmail,
    passwordHash,
    role: 'admin'
  });

  // 2. Seed Settings
  await Settings.create({
    shippingCharge: 60,
    whatsappNumber: process.env.WHATSAPP_NUMBER || '919876543210',
    announcementText: {
      en: 'Soft, breathable nighties crafted for restful comfort. Prepaid orders only • Flat ₹60 shipping.',
      ml: 'സുഖകരവും ഗുണമേന്മയുള്ളതുമായ നൈറ്റികൾ. പ്രീപെയ്ഡ് ഓർഡറുകൾ മാത്രം • ഷിപ്പിംഗ് ₹60.'
    },
    lowStockThreshold: 3,
    social: {
      youtube: 'https://www.youtube.com/@nestammakkili',
      instagram: 'https://instagram.com/nestammakkili',
      facebook: ''
    }
  });

  // 3. Seed Sample Banner
  await Banner.create({
    text: {
      en: 'New season nightwear collection now available. Watch fabrics & drape on YouTube before ordering.',
      ml: 'പുതിയ കളക്ഷൻ ഇപ്പോൾ ലഭ്യമാണ്. ഓർഡർ ചെയ്യുന്നതിന് മുൻപ് യൂട്യൂബിൽ കാണുക.'
    },
    link: '/shop',
    active: true,
    startsAt: new Date(Date.now() - 86400000),
    endsAt: new Date(Date.now() + 30 * 86400000)
  });

  // 4. Seed 8 test products from test fixture
  const fixtureFilePath = path.resolve(__dirname, '../fixtures/test-products.json');
  if (!fs.existsSync(fixtureFilePath)) {
    throw new Error(`Test products fixture missing at ${fixtureFilePath}`);
  }
  const sampleProducts = JSON.parse(fs.readFileSync(fixtureFilePath, 'utf8'));

  for (let i = 0; i < sampleProducts.length; i++) {
    const p = { ...sampleProducts[i] };
    if (i === 0) {
      // Ensure specific sizes for tests: one sold out (0), one with 2 left (2), one with 1 left (1 for overselling)
      p.sizes = p.sizes.map(s => {
        if (s.size === '3XL') return { size: s.size, stock: 0 };
        if (s.size === 'XXL') return { size: s.size, stock: 2 };
        if (s.size === 'XL') return { size: s.size, stock: 1 };
        return s;
      });
    }
    await Product.create(p);
  }

  return {
    adminEmail,
    adminPass
  };
}

async function disconnectTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  assertTestDatabase,
  connectTestDB,
  resetAndSeedDatabase,
  disconnectTestDB,
  Product,
  Order,
  Customer,
  Settings,
  Banner,
  Admin
};
