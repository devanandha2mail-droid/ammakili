const Order = require('../models/Order');
const Product = require('../models/Product');
const WebhookEvent = require('../models/WebhookEvent');
const { verifyWebhookSignature, refundRazorpayPayment } = require('../services/razorpay');
const { returnStockForOrder } = require('./checkoutController');

exports.handleRazorpayWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body; // Buffer from express.raw()

  // Verify HMAC signature strictly using timingSafeEqual
  const isValid = verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    console.warn('[Webhook] Invalid Razorpay webhook signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    const event = payload.event;

    // Idempotency check: check if eventId was already stored in previous successful processing
    const eventId = req.headers['x-razorpay-event-id'] || payload.event_id || payload.id;
    if (eventId) {
      const existingEvent = await WebhookEvent.findOne({ eventId });
      if (existingEvent) {
        console.log(`[Webhook] Duplicate event ID detected (${eventId}). Ignoring duplicate processing.`);
        return res.status(200).json({ status: 'ignored_duplicate', eventId });
      }
    }

    console.log(`[Webhook] Received Razorpay event: ${event}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id || payload.payload?.order?.entity?.id;
      const razorpayPaymentId = paymentEntity?.id;
      const paymentAmount = paymentEntity?.amount;
      const paymentCurrency = paymentEntity?.currency;

      if (razorpayOrderId) {
        const order = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
        if (order) {
          // Strictly verify that payload payment amount equals order total in paise and currency is INR
          const expectedAmountInPaise = Math.round(order.total * 100);
          if (paymentAmount && (paymentAmount !== expectedAmountInPaise || paymentCurrency !== 'INR')) {
            console.error(
              `[Webhook] Amount or currency mismatch for order ${order.orderId}: expected ${expectedAmountInPaise} INR, received ${paymentAmount} ${paymentCurrency}`
            );
            // Log alert in order visible in admin, and return 200 to acknowledge webhook
            await Order.updateOne(
              { _id: order._id },
              {
                $push: {
                  adminAlerts: {
                    type: 'payment_mismatch',
                    message: `Mismatched payment received via webhook: expected ${expectedAmountInPaise} INR, received ${paymentAmount} ${paymentCurrency}`,
                    createdAt: new Date()
                  }
                }
              }
            );
            return res.status(200).json({ status: 'mismatch_logged' });
          }

          const now = new Date();
          const isExpired = order.status === 'failed' || order.status === 'cancelled' || (order.reservedUntil && order.reservedUntil <= now) || order.stockReturned === true;

          // If reservation expired or order cancelled, return stock & auto-refund
          if (isExpired) {
            console.warn(`[Webhook] Order ${order.orderId} cannot be fulfilled (expired/cancelled). Restoring stock & issuing refund...`);
            await returnStockForOrder(order);

            order.status = 'refund_pending';
            if (razorpayPaymentId) order.payment.razorpayPaymentId = razorpayPaymentId;
            await order.save();

            try {
              const refundRes = await refundRazorpayPayment({
                paymentId: razorpayPaymentId,
                amountInPaise: expectedAmountInPaise,
                notes: {
                  orderId: order.orderId,
                  reason: 'Webhook: order expired or cancelled before capture'
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
              order.adminNotes = `Payment captured on expired order. Full refund issued: ${refundRes.id}`;
              await order.save();
              console.log(`[Webhook] Order ${order.orderId} marked as REFUNDED. Refund ID: ${refundRes.id}`);
            } catch (refundErr) {
              console.error(`[Webhook] Refund API call failed for order ${order.orderId}:`, refundErr);
              order.status = 'refund_needed';
              order.refund = {
                failureReason: refundErr.message,
                status: 'failed',
                initiatedAt: new Date()
              };
              order.payment.status = 'refund_needed';
              order.adminNotes = `Refund needed: Automatic refund failed (${refundErr.message}). Please refund manually in Razorpay dashboard.`;
              await order.save();
            }
          } else {
            // Mark the order paid with ONE conditional update:
            // findOneAndUpdate({ _id, status: { $in: ['pending_payment'] } }, { $set: { status: 'paid', ... } })
            // If nothing matched, treat it as already processed and continue
            const updated = await Order.findOneAndUpdate(
              {
                _id: order._id,
                status: { $in: ['pending_payment'] }
              },
              {
                $set: {
                  status: 'paid',
                  'payment.status': 'captured',
                  'payment.razorpayPaymentId': razorpayPaymentId || order.payment.razorpayPaymentId,
                  reservedUntil: null,
                  paidAt: new Date()
                }
              },
              { returnDocument: 'after' }
            );

            if (updated) {
              console.log(`[Webhook] Order ${order.orderId} marked as PAID via webhook.`);
            }
          }
        }
      }
    } else if (event === 'refund.processed') {
      const refundEntity = payload.payload?.refund?.entity;
      const refundId = refundEntity?.id;
      const razorpayPaymentId = refundEntity?.payment_id;

      const order = await Order.findOne({
        $or: [
          { 'refund.id': refundId },
          { 'payment.razorpayPaymentId': razorpayPaymentId }
        ]
      });

      if (order) {
        await Order.findOneAndUpdate(
          { _id: order._id },
          {
            $set: {
              status: 'refunded',
              'refund.status': 'processed',
              'payment.status': 'refunded'
            }
          }
        );
        await returnStockForOrder(order);
        console.log(`[Webhook] Order ${order.orderId} refund processed acknowledged.`);
      }
    } else if (event === 'payment.failed') {
      const paymentEntity = payload.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;

      if (razorpayOrderId) {
        const order = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
        if (order && order.status === 'pending_payment') {
          order.status = 'failed';
          order.adminNotes = `Payment failed via webhook: ${paymentEntity.error_description || 'Unknown error'}`;
          await order.save();
          await returnStockForOrder(order);
          console.log(`[Webhook] Order ${order.orderId} marked as FAILED via webhook.`);
        }
      }
    }

    // Optional test hook: simulate crash before event is stored
    if (req.headers['x-test-crash-before-event-store'] === 'true') {
      throw new Error('Simulated crash before storing webhook event');
    }

    // Record the webhook event id ONLY AFTER the order update succeeds
    if (eventId) {
      try {
        await WebhookEvent.create({ eventId, event });
      } catch (createErr) {
        if (createErr.code !== 11000) {
          console.warn('[Webhook] Could not record eventId:', createErr.message);
        }
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Webhook Error]:', err.message);
    res.status(500).json({ error: 'Webhook processing error' });
  }
};
