const cron = require('node-cron');
const Order = require('../models/Order');

function startOrderCleanupJob() {
  // Run every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const result = await Order.updateMany(
        {
          status: 'pending_payment',
          createdAt: { $lt: thirtyMinutesAgo }
        },
        {
          $set: {
            status: 'failed',
            adminNotes: 'Auto-expired: pending payment exceeded 30 minutes.'
          }
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`[Order Cleanup] Marked ${result.modifiedCount} abandoned pending orders as failed.`);
      }
    } catch (err) {
      console.error('[Order Cleanup Job Error]:', err.message);
    }
  });

  console.log('[Scheduler] Pending order cleanup cron job initialized (runs every 10m).');
}

module.exports = { startOrderCleanupJob };
