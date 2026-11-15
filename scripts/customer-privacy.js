#!/usr/bin/env node
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Customer = require('../src/models/Customer');
const Order = require('../src/models/Order');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const email = (args[1] || '').trim().toLowerCase();

  if (!['export', 'delete'].includes(command) || !email) {
    console.error('Usage:');
    console.error('  npm run customer:export -- <customer-email>');
    console.error('  npm run customer:delete -- <customer-email>');
    process.exit(1);
  }

  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';
  await mongoose.connect(MONGODB_URI);

  try {
    if (command === 'export') {
      const customer = await Customer.findOne({ email }).lean();
      const orders = await Order.find({
        $or: [
          ...(customer ? [{ customerId: customer._id }] : []),
          { 'customer.email': email }
        ]
      }).lean();

      const exportData = {
        exportedAt: new Date().toISOString(),
        customerEmail: email,
        accountProfile: customer || null,
        totalOrders: orders.length,
        orders: orders.map(o => ({
          orderId: o.orderId,
          status: o.status,
          createdAt: o.createdAt,
          total: o.total,
          items: o.items,
          shippingAddress: o.customer
        }))
      };

      console.log(JSON.stringify(exportData, null, 2));
    } else if (command === 'delete') {
      const customer = await Customer.findOne({ email });

      // Anonymize completed / fulfilled / paid / refunded orders (statutory tax retention)
      const completedStatuses = ['paid', 'confirmed', 'packed', 'shipped', 'delivered', 'refunded'];
      const updateResult = await Order.updateMany(
        {
          $or: [
            ...(customer ? [{ customerId: customer._id }] : []),
            { 'customer.email': email }
          ],
          status: { $in: completedStatuses }
        },
        {
          $set: {
            'customer.name': 'Redacted Customer',
            'customer.phone': '0000000000',
            'customer.email': 'redacted@privacy.local',
            'customer.address': 'Redacted for Privacy Compliance',
            'customer.city': 'Redacted',
            'customer.pin': '000000'
          }
        }
      );

      // Permanently delete pending/unpaid/failed orders
      const deleteResult = await Order.deleteMany({
        $or: [
          ...(customer ? [{ customerId: customer._id }] : []),
          { 'customer.email': email }
        ],
        status: { $nin: completedStatuses }
      });

      // Delete customer account profile
      let customerDeleted = false;
      if (customer) {
        await Customer.deleteOne({ _id: customer._id });
        customerDeleted = true;
      }

      // Purge sessions from sessions collection
      try {
        const sessionsCollection = mongoose.connection.collection('sessions');
        await sessionsCollection.deleteMany({
          session: { $regex: email }
        });
      } catch (e) {}

      console.log(`[PRIVACY] Customer records processed for: ${email}`);
      console.log(`- Completed orders anonymized: ${updateResult.modifiedCount}`);
      console.log(`- Abandoned/pending orders purged: ${deleteResult.deletedCount}`);
      console.log(`- Customer profile account removed: ${customerDeleted ? 'YES' : 'NOT FOUND'}`);
      console.log(`- Associated active sessions purged.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('[PRIVACY ERROR]:', err);
  process.exit(1);
});

