require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Product = require('../src/models/Product');
const Admin = require('../src/models/Admin');
const Settings = require('../src/models/Settings');
const Banner = require('../src/models/Banner');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';

async function seed() {
  try {
    console.log('Connecting to database:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('Database connected successfully.');

    // 1. Seed or Update Admin
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@nestammakkili.com').toLowerCase();
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminNest2026!';
    const passwordHash = await bcrypt.hash(adminPass, 10);

    await Admin.findOneAndUpdate(
      { email: adminEmail },
      { email: adminEmail, passwordHash, role: 'admin' },
      { upsert: true, returnDocument: 'after' }
    );
    console.log(`Admin user seeded: ${adminEmail}`);

    // 2. Seed Default Settings
    const whatsapp = process.env.WHATSAPP_NUMBER || '919876543210';
    await Settings.findOneAndUpdate(
      {},
      {
        shippingCharge: 60,
        whatsappNumber: whatsapp,
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
      },
      { upsert: true, returnDocument: 'after' }
    );
    console.log('Settings initialized.');

    // 3. Seed Sample Banner
    await Banner.deleteMany({});
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
    console.log('Banner seeded.');

    // 4. Seed Sample Products from products.sample.json
    const sampleFilePath = path.join(__dirname, 'products.sample.json');
    if (!fs.existsSync(sampleFilePath)) {
      throw new Error(`Sample products file not found at ${sampleFilePath}`);
    }
    const sampleProducts = JSON.parse(fs.readFileSync(sampleFilePath, 'utf8'));

    for (const p of sampleProducts) {
      await Product.findOneAndUpdate(
        { slug: p.slug },
        { ...p, isSample: true },
        { upsert: true, returnDocument: 'after' }
      );
    }
    console.log(`Upserted ${sampleProducts.length} sample products successfully.`);

    console.log('--- SEEDING COMPLETE ---');
    console.log(`Admin Login Email: ${adminEmail}`);
    console.log(`Admin Login Password: ${adminPass}`);
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
