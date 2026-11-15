const cron = require('node-cron');
const Order = require('../models/Order');
const { fetchOrderPayments, refundRazorpayPayment } = require('./razorpay');
const { returnStockForOrder } = require('../controllers/checkoutController');

/**
 * Releases expired 15-minute stock reservations and returns inventory exactly once
 */
async function releaseExpiredReservationsJob() {
  try {
    const now = new Date();
    const expiredOrders = await Order.find({
      status: 'pending_payment',
      $or: [
        { reservedUntil: { $lte: now } },
        { reservedUntil: null, createdAt: { $lt: new Date(now.getTime() - 15 * 60 * 1000) } }
      ]
    });

    let releasedCount = 0;
    for (const order of expiredOrders) {
      const updated = await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: 'pending_payment'
        },
        {
          $set: {
            status: 'failed',
            adminNotes: 'Reservation expired after 15 minutes without payment.'
          }
        }
      );

      if (updated) {
        await returnStockForOrder(order);
        releasedCount++;
      }
    }

    if (releasedCount > 0) {
      console.log(`[Order Cleanup] Released ${releasedCount} expired order reservation(s) and restored stock.`);
    }
  } catch (err) {
    console.error('[Order Cleanup Job Error]:', err.message);
  }
}

/**
 * Reconciliation job (every 10m):
 * Inspects pending_payment orders created in the last 24 hours.
 * Calls Razorpay API orders.fetchPayments(razorpayOrderId).
 * If payment was captured:
 * - If order expired/failed: triggers automatic refund.
 * - If still active: marks paid idempotently.
 */
async function runOrderReconciliation() {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pendingOrders = await Order.find({
      status: 'pending_payment',
      createdAt: { $gte: twentyFourHoursAgo },
      'payment.razorpayOrderId': { $exists: true, $ne: '' }
    });

    for (const order of pendingOrders) {
      try {
        const paymentsRes = await fetchOrderPayments(order.payment.razorpayOrderId);
        const paymentsList = paymentsRes.items || [];
        const captured = paymentsList.find(p => p.status === 'captured');

        if (captured) {
          const now = new Date();
          const isExpired = (order.reservedUntil && order.reservedUntil <= now) || order.stockReturned === true;

          if (isExpired) {
            // Cannot fulfill: ensure stock is restored and issue full refund
            await returnStockForOrder(order);
            const refundRes = await refundRazorpayPayment({
              paymentId: captured.id,
              amountInPaise: captured.amount,
              notes: {
                orderId: order.orderId,
                reason: 'Reconciliation: payment captured on expired reservation'
              }
            });

            order.status = 'refunded';
            order.refund = {
              id: refundRes.id,
              amount: refundRes.amount ? refundRes.amount / 100 : order.total,
              status: 'processed',
              initiatedAt: new Date()
            };
            order.payment.status = 'refunded';
            order.adminNotes = `Reconciliation refund issued: ${refundRes.id}`;
            await order.save();
            console.log(`[Reconciliation] Order ${order.orderId} was expired; refunded payment ${captured.id}.`);
          } else {
            // Valid: mark paid idempotently using single conditional update
            const markedPaid = await Order.findOneAndUpdate(
              {
                _id: order._id,
                status: { $in: ['pending_payment'] }
              },
              {
                $set: {
                  status: 'paid',
                  'payment.status': 'captured',
                  'payment.razorpayPaymentId': captured.id,
                  reservedUntil: null,
                  paidAt: new Date()
                }
              },
              { returnDocument: 'after' }
            );

            if (markedPaid) {
              console.log(`[Reconciliation] Order ${order.orderId} marked as PAID via reconciliation.`);
            }
          }
        }
      } catch (orderErr) {
        console.warn(`[Reconciliation] Error reconciling order ${order.orderId}:`, orderErr.message);
      }
    }
  } catch (err) {
    console.error('[Order Reconciliation Error]:', err.message);
  }
}

async function runDailyDataRetentionJob() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Remove abandoned unpaid/failed orders older than 30 days
    const delRes = await Order.deleteMany({
      status: { $in: ['pending_payment', 'failed'] },
      createdAt: { $lt: thirtyDaysAgo }
    });
    if (delRes.deletedCount > 0) {
      console.log(`[Data Retention] Purged ${delRes.deletedCount} abandoned/failed orders older than 30 days.`);
    }

    // Expired sessions cleanup
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      const now = new Date();
      try {
        await mongoose.connection.collection('sessions').deleteMany({
          expires: { $lt: now }
        });
      } catch (e) {}
      try {
        await mongoose.connection.collection('admin_sessions').deleteMany({
          expires: { $lt: now }
        });
      } catch (e) {}
    }
  } catch (err) {
    console.error('[Data Retention Cleanup Error]:', err.message);
  }
}

function startOrderCleanupJob() {
  // Run every 1 minute to release expired 15-minute stock reservations promptly
  cron.schedule('* * * * *', releaseExpiredReservationsJob);

  // Run reconciliation every 10 minutes
  cron.schedule('*/10 * * * *', runOrderReconciliation);

  // Run daily data retention cleanup at 03:00 AM
  cron.schedule('0 3 * * *', runDailyDataRetentionJob);

  console.log('[Scheduler] Stock cleanup (1m), reconciliation (10m), & daily retention (03:00) initialized.');
}

module.exports = {
  startOrderCleanupJob,
  releaseExpiredReservationsJob,
  runOrderReconciliation,
  runDailyDataRetentionJob
};
