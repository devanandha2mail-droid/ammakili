require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const AdminUser = require('../src/models/AdminUser');
const Settings = require('../src/models/Settings');
const Banner = require('../src/models/Banner');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';

async function seed() {
  try {
    console.log('Connecting to database:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('Database connected successfully.');

    // 1. Seed or Update Admin Owner
    const adminEmail = (process.env.ADMIN_OWNER_EMAIL || process.env.ADMIN_EMAIL || 'admin@nestammakkili.com').toLowerCase().trim();

    await AdminUser.findOneAndUpdate(
      { email: adminEmail },
      { email: adminEmail, role: 'owner', active: true, createdBy: 'system:seed' },
      { upsert: true, returnDocument: 'after' }
    );
    console.log(`Admin owner seeded: ${adminEmail}`);

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

    console.log('--- SEEDING COMPLETE ---');
    console.log(`Admin Login Email: ${adminEmail}`);
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
