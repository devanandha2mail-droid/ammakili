const nockLib = require('nock');
const nock = nockLib.default || nockLib;

nock('https://api.razorpay.com')
  .persist()
  .get(/\/v1\/orders(\?.*)?$/)
  .reply(200, () => {
    return {
      entity: 'collection',
      count: 0,
      items: []
    };
  });

// Mock official Razorpay HTTP API endpoints for test runs
nock('https://api.razorpay.com')
  .persist()
  .post('/v1/orders')
  .reply(200, () => {
    const orderId = 'order_rzp_' + Date.now() + Math.random().toString(36).substring(2, 7);
    return {
      id: orderId,
      entity: 'order',
      amount: 65900,
      amount_paid: 0,
      amount_due: 65900,
      currency: 'INR',
      receipt: 'test_receipt',
      offer_id: null,
      status: 'created',
      attempts: 0,
      notes: {},
      created_at: Math.floor(Date.now() / 1000)
    };
  });

nock('https://api.razorpay.com')
  .persist()
  .post(/\/v1\/payments\/[^\/]+\/refund/)
  .reply(200, (request) => {
    const refundId = 'rfnd_mock_' + Date.now() + Math.random().toString(36).substring(2, 7);
    return {
      id: refundId,
      entity: 'refund',
      amount: 65900,
      currency: 'INR',
      payment_id: 'pay_mock_' + Date.now(),
      status: 'processed',
      speed_processed: 'normal',
      notes: {},
      created_at: Math.floor(Date.now() / 1000)
    };
  });

// In-memory registry for mock payments to allow test overrides
const mockPayments = new Map();

function setMockPayment(paymentId, paymentData) {
  mockPayments.set(paymentId, paymentData);
}

function clearMockPayments() {
  mockPayments.clear();
}

nock('https://api.razorpay.com')
  .persist()
  .get(/\/v1\/payments\/([^\/]+)/)
  .reply(200, async (request) => {
    const rawUrl = typeof request === 'string' ? request : (request.url || '');
    const match = rawUrl.match(/\/v1\/payments\/([^\/\?]+)/);
    const paymentId = match ? match[1] : 'pay_mock_' + Date.now();
    if (mockPayments.has(paymentId)) {
      return mockPayments.get(paymentId);
    }
    // Dynamic defaults based on payment ID prefixes
    let status = 'captured';
    let amount = 65900;
    let currency = 'INR';
    let order_id = 'order_' + paymentId;

    if (paymentId.includes('uncaptured') || paymentId.includes('failed')) {
      status = 'failed';
    } else if (paymentId.includes('authorized')) {
      status = 'authorized';
    } else if (paymentId.includes('mismatch_amount') || paymentId.includes('mismatch')) {
      amount = 50000;
    }

    // Resolve order_id
    if (paymentId.includes('mismatch_order') || paymentId.includes('badorder')) {
      order_id = 'order_mismatched_' + Date.now();
    } else {
      const orderMatch = paymentId.match(/(order_[a-zA-Z0-9_]+)/);
      if (orderMatch) {
        order_id = orderMatch[1];
      }
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.models && mongoose.models.Order) {
          const Order = mongoose.models.Order;
          let order = null;
          if (orderMatch) {
            order = await Order.findOne({ 'payment.razorpayOrderId': orderMatch[1] });
          }
          if (!order) {
            order = await Order.findOne({ status: { $in: ['pending_payment', 'refund_pending', 'refunded', 'paid'] } }).sort({ createdAt: -1 });
          }
          if (order && order.payment && order.payment.razorpayOrderId) {
            order_id = order.payment.razorpayOrderId;
            if (!paymentId.includes('mismatch_amount') && !paymentId.includes('mismatch')) {
              amount = Math.round(order.total * 100);
            }
          }
        }
      } catch (err) {}
    }

    return {
      id: paymentId,
      entity: 'payment',
      amount,
      currency,
      status,
      order_id,
      method: 'card',
      captured: status === 'captured',
      created_at: Math.floor(Date.now() / 1000)
    };
  });

nock('https://api.razorpay.com')
  .persist()
  .post(/\/v1\/payments\/([^\/]+)\/capture/)
  .reply(200, (request) => {
    const rawUrl = typeof request === 'string' ? request : (request.url || '');
    const match = rawUrl.match(/\/v1\/payments\/([^\/]+)\/capture/);
    const paymentId = match ? match[1] : 'pay_mock_' + Date.now();
    return {
      id: paymentId,
      entity: 'payment',
      amount: 65900,
      currency: 'INR',
      status: 'captured',
      order_id: 'order_' + paymentId,
      captured: true,
      created_at: Math.floor(Date.now() / 1000)
    };
  });

nock('https://api.razorpay.com')
  .persist()
  .get(/\/v1\/orders\/([^\/]+)\/payments/)
  .reply(200, async (request) => {
    const rawUrl = typeof request === 'string' ? request : (request.url || '');
    const match = rawUrl.match(/\/v1\/orders\/([^\/\?]+)\/payments/);
    const orderId = match ? match[1] : 'order_mock_' + Date.now();
    if (mockPayments.has(orderId)) {
      return {
        entity: 'collection',
        count: 1,
        items: [mockPayments.get(orderId)]
      };
    }
    return {
      entity: 'collection',
      count: 1,
      items: [
        {
          id: 'pay_rec_' + orderId,
          entity: 'payment',
          amount: 65900,
          currency: 'INR',
          status: 'captured',
          order_id: orderId,
          created_at: Math.floor(Date.now() / 1000)
        }
      ]
    };
  });

module.exports = {
  setMockPayment,
  clearMockPayments
};

console.log('[Test Harness] Razorpay HTTP API interceptor active via nock.');
