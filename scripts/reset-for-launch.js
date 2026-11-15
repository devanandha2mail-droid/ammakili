#!/usr/bin/env node
/**
 * scripts/reset-for-launch.js
 *
 * Drops all collections in the target database and recreates indexes,
 * session TTL index, and initial empty launch settings.
 *
 * Safety rules:
 * 1. Must never run automatically (CLI only).
 * 2. Refuses if database name contains 'test', unless --allow-test-db is passed.
 * 3. Requires exact database confirmation: --confirm-database-name=EXACT_NAME.
 * 4. Supports --dry-run to display collections and document counts without executing drops.
 * 5. Full auditing and logging of all operations.
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import all models to register schemas for index recreation
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const Customer = require('../src/models/Customer');
const AdminUser = require('../src/models/AdminUser');
const AdminAuditLog = require('../src/models/AdminAuditLog');
const Settings = require('../src/models/Settings');
const Banner = require('../src/models/Banner');
const PhotoJob = require('../src/models/PhotoJob');
const WebhookEvent = require('../src/models/WebhookEvent');

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const allowTestDb = args.includes('--allow-test-db');

  const confirmArg = args.find(a => a.startsWith('--confirm-database-name='));
  const confirmedDbName = confirmArg ? confirmArg.split('=')[1].trim() : '';

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';

  console.log('====================================================');
  console.log('       Nest by Ammakkili - Launch Reset Script      ');
  console.log('====================================================');
  console.log(`Connecting to: ${mongoUri.replace(/:([^@]+)@/, ':****@')}`);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const actualDbName = db.databaseName;

  console.log(`Target Database Name: "${actualDbName}"`);

  // Safety check 1: Reject test database unless explicitly overridden
  if (actualDbName.toLowerCase().includes('test') && !allowTestDb) {
    console.error(`\n❌ ERROR: Target database "${actualDbName}" contains "test".`);
    console.error('If you genuinely intend to reset this test database, pass the --allow-test-db flag.\n');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Safety check 2: Verify confirmation argument
  if (!confirmedDbName || confirmedDbName !== actualDbName) {
    console.error(`\n❌ ERROR: Confirmation mismatch or missing.`);
    console.error(`You must pass: --confirm-database-name=${actualDbName}`);
    console.error(`Provided: "${confirmedDbName || '<none>'}"\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Inspect existing collections
  const collections = await db.listCollections().toArray();
  console.log(`\nFound ${collections.length} collections:`);

  const summary = [];
  for (const colInfo of collections) {
    const colName = colInfo.name;
    const count = await db.collection(colName).countDocuments();
    summary.push({ collection: colName, documents: count });
    console.log(` - ${colName}: ${count} document(s)`);
  }

  if (isDryRun) {
    console.log('\n[DRY RUN]: No collections dropped. Database left untouched.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log('\nProceeding with full launch database purge...');

  // 1. Drop all collections
  for (const { collection: colName } of summary) {
    try {
      await db.collection(colName).drop();
      console.log(` ✓ Dropped collection: ${colName}`);
    } catch (dropErr) {
      console.warn(` ⚠️ Could not drop collection ${colName}: ${dropErr.message}`);
    }
  }

  // 2. Recreate schema indexes
  console.log('\nRecreating schema indexes on all models...');
  const models = [
    Product,
    Order,
    Customer,
    AdminUser,
    AdminAuditLog,
    Settings,
    Banner,
    PhotoJob,
    WebhookEvent
  ];

  for (const model of models) {
    await model.createIndexes();
    console.log(` ✓ Recreated indexes for: ${model.modelName}`);
  }

  // 3. Recreate session TTL index
  console.log('\nRecreating session TTL index on "sessions" collection...');
  await db.collection('sessions').createIndex(
    { expires: 1 },
    { expireAfterSeconds: 0, name: 'sessions_ttl_idx' }
  );
  console.log(' ✓ Session TTL index created.');

  // 4. Seed baseline Settings (no products, no orders, no customers, no banners)
  console.log('\nInitializing fresh Settings for launch...');
  const ownerEmail = (process.env.ADMIN_OWNER_EMAIL || '').trim().toLowerCase();
  const whatsapp = (process.env.WHATSAPP_NUMBER || '').trim();

  await Settings.create({
    shippingCharge: 60,
    whatsappNumber: whatsapp || '919876543210',
    announcementText: {
      en: 'Soft, breathable nighties crafted for restful comfort. Prepaid orders only • Flat ₹60 shipping.',
      ml: 'സുഖകരവും ഗുണമേന്മയുള്ളതുമായ നൈറ്റികൾ. പ്രീപെയ്ഡ് ഓർഡറുകൾ മാത്രം • ഷിപ്പിംഗ് ₹60.'
    },
    lowStockThreshold: 3,
    minDeliveryDays: 3,
    maxDeliveryDays: 7,
    refundTimelineDays: 5,
    orderRetentionYears: 8,
    social: {
      youtube: 'https://www.youtube.com/@nestammakkili',
      instagram: 'https://instagram.com/nestammakkili',
      facebook: ''
    }
  });
  console.log(' ✓ Baseline Settings created.');

  // 5. Seed Initial Admin Owner if configured
  if (ownerEmail) {
    console.log(`Seeding initial Admin Owner: ${ownerEmail}`);
    await AdminUser.create({
      email: ownerEmail,
      role: 'owner',
      active: true,
      createdBy: 'reset-for-launch'
    });
    console.log(` ✓ Owner seeded in AdminUser collection.`);
  } else {
    console.warn(' ⚠️ ADMIN_OWNER_EMAIL not set in environment. Remember to set it before launch!');
  }

  console.log('\n====================================================');
  console.log(' ✓ LAUNCH RESET COMPLETE: Database is clean and ready');
  console.log(` - Collections purged: ${summary.length}`);
  console.log(` - Products: 0`);
  console.log(` - Orders: 0`);
  console.log(` - Customers: 0`);
  console.log(` - Banners: 0`);
  console.log(` - Admin Owner: ${ownerEmail || 'Pending'}`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Launch reset script fatal error:', err);
    process.exit(1);
  });
} else {
  module.exports = main;
}

