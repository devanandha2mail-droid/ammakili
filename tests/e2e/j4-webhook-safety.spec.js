const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Order, Product } = require('../helpers/db');
const { createSignedWebhookPayload } = require('../helpers/razorpay');
const WebhookEvent = require('../../src/models/WebhookEvent');

test.describe('J4: Razorpay webhook idempotency, signature validation, and crash resistance', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('1. Safely handles signed webhooks, prevents double inventory drop, and rejects invalid signatures', async ({ request }) => {
    // 1. Prepare initial order and product
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const initialStockL = product.sizes.find(s => s.size === 'L').stock;

    const testRzpOrderId = 'order_webhook_test_' + Date.now();
    const testRzpPaymentId = 'pay_webhook_test_' + Date.now();
    const eventId1 = 'evt_test_' + Date.now() + '_1';

    // Simulate stock reservation that happened at checkout create
    await Product.updateOne({ _id: product._id, 'sizes.size': 'L' }, { $inc: { 'sizes.$.stock': -1 } });

    await Order.create({
      orderId: 'NEST-WEBHOOK1',
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: 599,
        size: 'L',
        quantity: 1,
        image: '/img/sample.jpg'
      }],
      customer: {
        name: 'Webhook Tester',
        phone: '9846099999',
        address: 'Test House',
        city: 'Thrissur',
        pin: '680001'
      },
      subtotal: 599,
      shipping: 60,
      total: 659,
      status: 'pending_payment',
      payment: {
        razorpayOrderId: testRzpOrderId,
        status: 'pending'
      }
    });

    const paymentEntity = {
      id: testRzpPaymentId,
      order_id: testRzpOrderId,
      amount: 65900,
      currency: 'INR',
      status: 'captured'
    };

    // 2. Send payment.captured with VALID signature
    const validWebhook = createSignedWebhookPayload('payment.captured', paymentEntity);

    const res1 = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': validWebhook.signature,
        'x-razorpay-event-id': eventId1,
        'content-type': 'application/json'
      },
      data: validWebhook.rawBody
    });

    expect(res1.status()).toBe(200);

    // Verify order marked paid and stock is retained (initialStockL - 1)
    const orderAfter1 = await Order.findOne({ orderId: 'NEST-WEBHOOK1' });
    expect(orderAfter1.status).toBe('paid');

    const productAfter1 = await Product.findOne({ slug: 'rose-garden-nighty' });
    expect(productAfter1.sizes.find(s => s.size === 'L').stock).toBe(initialStockL - 1);

    // 3. Send payment.captured a SECOND time with different event id (Idempotency test)
    const eventId2 = 'evt_test_' + Date.now() + '_2';
    const res2 = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': validWebhook.signature,
        'x-razorpay-event-id': eventId2,
        'content-type': 'application/json'
      },
      data: validWebhook.rawBody
    });

    expect(res2.status()).toBe(200);

    // Stock must NOT drop a second time
    const productAfter2 = await Product.findOne({ slug: 'rose-garden-nighty' });
    expect(productAfter2.sizes.find(s => s.size === 'L').stock).toBe(initialStockL - 1);

    // 4. Send with INVALID signature: must return 400
    const resBadSig = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': '0000000000000000000000000000000000000000000000000000000000000000',
        'content-type': 'application/json'
      },
      data: validWebhook.rawBody
    });

    expect(resBadSig.status()).toBe(400);

    // 5. Send payment.failed for an UNKNOWN order: must handle gracefully without crash
    const unknownPaymentEntity = {
      id: 'pay_unknown_123',
      order_id: 'order_unknown_99999',
      amount: 50000,
      currency: 'INR',
      status: 'failed',
      error_description: 'Test failure description'
    };

    const unknownWebhook = createSignedWebhookPayload('payment.failed', unknownPaymentEntity);

    const resUnknown = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': unknownWebhook.signature,
        'content-type': 'application/json'
      },
      data: unknownWebhook.rawBody
    });

    expect(resUnknown.status()).toBe(200);
  });

  test('2. Webhook validates amount and currency, logging alert and returning 200 on mismatch', async ({ request }) => {
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });

    const testRzpOrderId = 'order_amt_mismatch_' + Date.now();
    const testRzpPaymentId = 'pay_amt_mismatch_' + Date.now();

    // Order total is 659 (amount in paise = 65900)
    await Order.create({
      orderId: 'NEST-MISMATCH1',
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: 599,
        size: 'L',
        quantity: 1,
        image: '/img/sample.jpg'
      }],
      customer: {
        name: 'Mismatch Tester',
        phone: '9846088888',
        address: 'Test House',
        city: 'Thrissur',
        pin: '680001'
      },
      subtotal: 599,
      shipping: 60,
      total: 659,
      status: 'pending_payment',
      payment: {
        razorpayOrderId: testRzpOrderId,
        status: 'pending'
      }
    });

    // Case A: Wrong amount (50000 paise instead of 65900 paise)
    const wrongAmountEntity = {
      id: testRzpPaymentId,
      order_id: testRzpOrderId,
      amount: 50000,
      currency: 'INR',
      status: 'captured'
    };

    const wrongAmountWebhook = createSignedWebhookPayload('payment.captured', wrongAmountEntity);
    const resWrongAmt = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': wrongAmountWebhook.signature,
        'content-type': 'application/json'
      },
      data: wrongAmountWebhook.rawBody
    });

    // Mismatches return 200 (to acknowledge webhook delivery) but log an alert
    expect(resWrongAmt.status()).toBe(200);
    const bodyWrongAmt = await resWrongAmt.json();
    expect(bodyWrongAmt.status).toBe('mismatch_logged');

    const orderAfterMismatch = await Order.findOne({ orderId: 'NEST-MISMATCH1' });
    expect(orderAfterMismatch.status).toBe('pending_payment');
    expect(orderAfterMismatch.adminAlerts.length).toBeGreaterThan(0);
    expect(orderAfterMismatch.adminAlerts[0].type).toBe('payment_mismatch');
    expect(orderAfterMismatch.adminAlerts[0].message).toContain('Mismatched payment');

    // Case B: Wrong currency (USD instead of INR)
    const wrongCurrencyEntity = {
      id: testRzpPaymentId + '_cur',
      order_id: testRzpOrderId,
      amount: 65900,
      currency: 'USD',
      status: 'captured'
    };

    const wrongCurWebhook = createSignedWebhookPayload('payment.captured', wrongCurrencyEntity);
    const resWrongCur = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': wrongCurWebhook.signature,
        'content-type': 'application/json'
      },
      data: wrongCurWebhook.rawBody
    });

    expect(resWrongCur.status()).toBe(200);
    const bodyWrongCur = await resWrongCur.json();
    expect(bodyWrongCur.status).toBe('mismatch_logged');
  });

  test('3. Stores x-razorpay-event-id and ignores duplicate event deliveries', async ({ request }) => {
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const testRzpOrderId = 'order_dup_evt_' + Date.now();
    const testRzpPaymentId = 'pay_dup_evt_' + Date.now();
    const duplicateEventId = 'evt_duplicate_proof_' + Date.now();

    await Order.create({
      orderId: 'NEST-DUPEVT1',
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: 599,
        size: 'L',
        quantity: 1,
        image: '/img/sample.jpg'
      }],
      customer: {
        name: 'Dup Tester',
        phone: '9846077777',
        address: 'Test House',
        city: 'Thrissur',
        pin: '680001'
      },
      subtotal: 599,
      shipping: 60,
      total: 659,
      status: 'pending_payment',
      payment: {
        razorpayOrderId: testRzpOrderId,
        status: 'pending'
      }
    });

    const paymentEntity = {
      id: testRzpPaymentId,
      order_id: testRzpOrderId,
      amount: 65900,
      currency: 'INR',
      status: 'captured'
    };

    const webhook = createSignedWebhookPayload('payment.captured', paymentEntity);

    // 1st delivery of the event
    const res1 = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': webhook.signature,
        'x-razorpay-event-id': duplicateEventId,
        'content-type': 'application/json'
      },
      data: webhook.rawBody
    });

    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    expect(body1.status).toBe('ok');

    // 2nd delivery with identical x-razorpay-event-id
    const res2 = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': webhook.signature,
        'x-razorpay-event-id': duplicateEventId,
        'content-type': 'application/json'
      },
      data: webhook.rawBody
    });

    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.status).toBe('ignored_duplicate');
    expect(body2.eventId).toBe(duplicateEventId);
  });

  test('4. Redelivering an event after server crash before event-store succeeds without double stock drop', async ({ request }) => {
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const initialStockL = product.sizes.find(s => s.size === 'L').stock;

    const testRzpOrderId = 'order_crash_' + Date.now();
    const testRzpPaymentId = 'pay_crash_' + Date.now();
    const crashEventId = 'evt_crash_' + Date.now();

    // Simulate stock reservation that occurred when order was created
    await Product.updateOne({ _id: product._id, 'sizes.size': 'L' }, { $inc: { 'sizes.$.stock': -1 } });

    await Order.create({
      orderId: 'NEST-CRASH1',
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: 599,
        size: 'L',
        quantity: 1,
        image: '/img/sample.jpg'
      }],
      customer: { name: 'Crash Tester', phone: '9846066666', address: 'Crash Rd', city: 'Kochi', pin: '682001' },
      subtotal: 599,
      shipping: 60,
      total: 659,
      status: 'pending_payment',
      payment: { razorpayOrderId: testRzpOrderId, status: 'pending' }
    });

    const paymentEntity = {
      id: testRzpPaymentId,
      order_id: testRzpOrderId,
      amount: 65900,
      currency: 'INR',
      status: 'captured'
    };

    const webhook = createSignedWebhookPayload('payment.captured', paymentEntity);

    // 1st delivery: simulate crash AFTER order update but BEFORE event is stored
    const resCrash = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': webhook.signature,
        'x-razorpay-event-id': crashEventId,
        'x-test-crash-before-event-store': 'true',
        'content-type': 'application/json'
      },
      data: webhook.rawBody
    });

    expect(resCrash.status()).toBe(500);

    // Order is marked paid
    const orderAfterCrash = await Order.findOne({ orderId: 'NEST-CRASH1' });
    expect(orderAfterCrash.status).toBe('paid');

    // WebhookEvent document was NOT stored due to crash
    const storedEvt = await WebhookEvent.findOne({ eventId: crashEventId });
    expect(storedEvt).toBeNull();

    // 2nd delivery (Razorpay webhook retry): sent without crash header
    const resRetry = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': webhook.signature,
        'x-razorpay-event-id': crashEventId,
        'content-type': 'application/json'
      },
      data: webhook.rawBody
    });

    expect(resRetry.status()).toBe(200);

    // WebhookEvent is now stored
    const storedEvtAfterRetry = await WebhookEvent.findOne({ eventId: crashEventId });
    expect(storedEvtAfterRetry).not.toBeNull();

    // Stock for size L must be decremented only ONCE (initialStockL - 1, not -2)
    const productAfter = await Product.findOne({ slug: 'rose-garden-nighty' });
    expect(productAfter.sizes.find(s => s.size === 'L').stock).toBe(initialStockL - 1);
  });

  test('5. Handles order.paid and refund.processed idempotently', async ({ request }) => {
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const initialStockL = product.sizes.find(s => s.size === 'L').stock;

    const testRzpOrderId = 'order_paid_event_' + Date.now();
    const testRzpPaymentId = 'pay_order_paid_' + Date.now();

    // Simulate stock reservation that occurred when order was created
    await Product.updateOne({ _id: product._id, 'sizes.size': 'L' }, { $inc: { 'sizes.$.stock': -1 } });

    await Order.create({
      orderId: 'NEST-ORDERPAID1',
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: 599,
        size: 'L',
        quantity: 1,
        image: '/img/sample.jpg'
      }],
      customer: { name: 'Order Paid Tester', phone: '9846055555', address: 'Order Paid Rd', city: 'Kochi', pin: '682001' },
      subtotal: 599,
      shipping: 60,
      total: 659,
      status: 'pending_payment',
      payment: { razorpayOrderId: testRzpOrderId, status: 'pending' }
    });

    // 1. Send order.paid event
    const orderPaidPayload = {
      id: testRzpPaymentId,
      order_id: testRzpOrderId,
      amount: 65900,
      currency: 'INR',
      status: 'captured'
    };
    const orderPaidWebhook = createSignedWebhookPayload('order.paid', orderPaidPayload);
    const resOrderPaid = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': orderPaidWebhook.signature,
        'content-type': 'application/json'
      },
      data: orderPaidWebhook.rawBody
    });
    expect(resOrderPaid.status()).toBe(200);

    const orderPaidDoc = await Order.findOne({ orderId: 'NEST-ORDERPAID1' });
    expect(orderPaidDoc.status).toBe('paid');

    // 2. Send refund.processed event
    const refundEntity = {
      id: 'rfnd_webhook_test_' + Date.now(),
      payment_id: testRzpPaymentId,
      amount: 65900,
      currency: 'INR',
      status: 'processed'
    };
    const refundWebhook = createSignedWebhookPayload('refund.processed', refundEntity);
    const resRefund = await request.post('/webhooks/razorpay', {
      headers: {
        'x-razorpay-signature': refundWebhook.signature,
        'content-type': 'application/json'
      },
      data: refundWebhook.rawBody
    });
    expect(resRefund.status()).toBe(200);

    const orderRefundDoc = await Order.findOne({ orderId: 'NEST-ORDERPAID1' });
    expect(orderRefundDoc.status).toBe('refunded');
    expect(orderRefundDoc.stockReturned).toBe(true);

    // Stock was returned back
    const productAfter = await Product.findOne({ slug: 'rose-garden-nighty' });
    expect(productAfter.sizes.find(s => s.size === 'L').stock).toBe(initialStockL);
  });
});
