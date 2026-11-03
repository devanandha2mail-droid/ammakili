const Order = require('../models/Order');
const Product = require('../models/Product');
const { verifyWebhookSignature } = require('../services/razorpay');

exports.handleRazorpayWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body; // Buffer from express.raw()

  // Verify HMAC signature
  const isValid = verifyWebhookSignature(rawBody, signature);
  if (!isValid && process.env.NODE_ENV === 'production') {
    console.warn('[Webhook] Invalid Razorpay webhook signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    const event = payload.event;

    console.log(`[Webhook] Received Razorpay event: ${event}`);

    if (event === 'payment.captured') {
      const paymentEntity = payload.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;
      const razorpayPaymentId = paymentEntity?.id;

      if (razorpayOrderId) {
        const order = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
        if (order) {
          // Idempotent: only decrement if previously pending
          if (order.status !== 'paid' && order.status !== 'packed' && order.status !== 'shipped' && order.status !== 'delivered') {
            order.status = 'paid';
            order.payment.razorpayPaymentId = razorpayPaymentId;
            order.payment.status = 'captured';
            await order.save();

            // Decrement stock
            for (const item of order.items) {
              await Product.updateOne(
                {
                  _id: item.productId,
                  'sizes.size': item.size,
                  'sizes.stock': { $gte: item.quantity }
                },
                {
                  $inc: { 'sizes.$.stock': -item.quantity }
                }
              );
            }
            console.log(`[Webhook] Order ${order.orderId} marked as PAID via webhook.`);
          }
        }
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
          console.log(`[Webhook] Order ${order.orderId} marked as FAILED via webhook.`);
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Webhook Error]:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
};

