const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Order, Product } = require('../helpers/db');
const { generatePaymentSignature } = require('../helpers/razorpay');
const { runOrderReconciliation } = require('../../src/services/orderCleanup');

test.describe('J3: Stock holds, concurrency protection, and auto-refund for expired orders', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('1. Two simultaneous checkouts for the last item: the second is told "sold out" via inline error', async ({ browser }) => {
    // Verify initial stock of size XL is exactly 1
    const pInitial = await Product.findOne({ slug: 'rose-garden-nighty' });
    const xlInitial = pInitial.sizes.find(s => s.size === 'XL');
    expect(xlInitial.stock).toBe(1);

    // Create two isolated browser contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Context A adds size XL (stock 1) to cart
    await pageA.goto('/product/rose-garden-nighty');
    await pageA.locator('.pdp-size-pill[data-size="XL"], button[data-size="XL"]').first().click();
    await pageA.click('#pdpAddToCartBtn');

    // Context B adds size XL (stock 1) to cart
    await pageB.goto('/product/rose-garden-nighty');
    await pageB.locator('.pdp-size-pill[data-size="XL"], button[data-size="XL"]').first().click();
    await pageB.click('#pdpAddToCartBtn');

    // Context A fills checkout form
    await pageA.goto('/checkout');
    await pageA.fill('#f-name', 'Customer Alpha');
    await pageA.fill('#f-phone', '9846011111');
    await pageA.fill('#f-addr', 'Alpha Villa, Beach Road');
    await pageA.fill('#f-city', 'Alappuzha');
    await pageA.fill('#f-pin', '688001');
    await pageA.check('#f-ok');

    // Context B fills checkout form
    await pageB.goto('/checkout');
    await pageB.fill('#f-name', 'Customer Beta');
    await pageB.fill('#f-phone', '9846022222');
    await pageB.fill('#f-addr', 'Beta Cottage, Hill Station');
    await pageB.fill('#f-city', 'Munnar');
    await pageB.fill('#f-pin', '685612');
    await pageB.check('#f-ok');

    // Both click submit order creation simultaneously
    await Promise.all([
      pageA.click('#submit-order-btn'),
      pageB.click('#submit-order-btn')
    ]);

    // Wait without waitForTimeout until one gets the modal and one gets the inline error
    await Promise.race([
      pageA.waitForSelector('#razorpay-mock-modal:not([style*="display:none"])', { timeout: 15000 }),
      pageB.waitForSelector('#razorpay-mock-modal:not([style*="display:none"])', { timeout: 15000 })
    ]);

    const modalAVisible = await pageA.locator('#razorpay-mock-modal').isVisible().catch(() => false);
    const modalBVisible = await pageB.locator('#razorpay-mock-modal').isVisible().catch(() => false);

    // Exactly ONE context must receive the payment modal; the other must receive "Sold out" inline error
    expect((modalAVisible && !modalBVisible) || (!modalAVisible && modalBVisible)).toBe(true);

    const winningPage = modalAVisible ? pageA : pageB;
    const losingPage = modalAVisible ? pageB : pageA;

    // The losing customer must see the inline "Sold out" message under the Place order button (#checkout-order-error)
    const errBox = losingPage.locator('#checkout-order-error');
    await expect(errBox).toBeVisible({ timeout: 10000 });
    await expect(errBox).toContainText(/sold out/i);

    // Winning customer completes payment
    await winningPage.locator('#mock-pay-success-btn').click();
    await expect(winningPage).toHaveURL(/\/checkout\/confirmation\/NEST-/i, { timeout: 15000 });

    // Verify database state: exactly one order placed, marked 'paid'
    const ordersA = await Order.find({ 'customer.phone': '9846011111' });
    const ordersB = await Order.find({ 'customer.phone': '9846022222' });

    const totalOrders = ordersA.length + ordersB.length;
    expect(totalOrders).toBe(1);

    const winningOrder = ordersA.length > 0 ? ordersA[0] : ordersB[0];
    expect(winningOrder.status).toBe('paid');

    // Stock for size XL must be exactly 0 (never negative)
    const pFinal = await Product.findOne({ slug: 'rose-garden-nighty' });
    const xlFinal = pFinal.sizes.find(s => s.size === 'XL');
    expect(xlFinal.stock).toBe(0);

    await contextA.close();
    await contextB.close();
  });

  test('2. Late-payment case: a captured payment arrives for an expired order, a refund is issued and status ends as refunded', async ({ request }) => {
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeL = product.sizes.find(s => s.size === 'L');
    const initialStockL = sizeL.stock;

    const orderId = `NEST-EXPIRED-${Date.now()}`;
    const rzpOrderId = `order_exp_${Date.now()}`;
    const rzpPaymentId = `pay_late_${Date.now()}`;

    // Create an order whose 15-minute reservation expired 10 minutes ago
    const expiredReservationTime = new Date(Date.now() - 10 * 60 * 1000);
    const expiredOrder = await Order.create({
      orderId,
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: product.price,
        size: 'L',
        quantity: 1,
        image: '/img/logo.svg'
      }],
      customer: {
        name: 'Late Shopper',
        phone: '9846033333',
        address: 'Sunset Bay, Beach Road',
        city: 'Kochi',
        pin: '682001'
      },
      subtotal: product.price,
      shipping: 60,
      total: product.price + 60,
      status: 'pending_payment',
      reservedUntil: expiredReservationTime,
      payment: {
        razorpayOrderId: rzpOrderId,
        status: 'pending',
        method: 'Razorpay'
      }
    });

    // Simulate stock decrement that occurred when order was originally reserved
    await Product.updateOne({ _id: product._id, 'sizes.size': 'L' }, { $inc: { 'sizes.$.stock': -1 } });

    expect(expiredOrder.reservedUntil.getTime()).toBeLessThan(Date.now());

    // Generate valid HMAC signature
    const signature = generatePaymentSignature(rzpOrderId, rzpPaymentId);

    // Fetch /checkout to get CSRF token
    const checkoutPageRes = await request.get('/checkout');
    const html = await checkoutPageRes.text();
    const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    // Verify late payment through verification route
    const verifyRes = await request.post('/checkout/verify', {
      headers: {
        'x-csrf-token': csrfToken
      },
      data: {
        orderId,
        razorpay_order_id: rzpOrderId,
        razorpay_payment_id: rzpPaymentId,
        razorpay_signature: signature
      }
    });

    // Endpoint must return 409 Conflict with auto-refund indication
    expect(verifyRes.status()).toBe(409);
    const body = await verifyRes.json();
    expect(body.refunded).toBe(true);

    // Order status in database must end as 'refunded'
    const finalOrder = await Order.findOne({ orderId });
    expect(finalOrder.status).toBe('refunded');
    expect(finalOrder.refund).toBeDefined();
    expect(finalOrder.refund.id).toMatch(/^rfnd_/);
    expect(finalOrder.refund.status).toBe('processed');
    expect(finalOrder.adminNotes).toContain('Full refund issued');

    // Physical stock was preserved and NOT decremented for the expired order
    const pCheck = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeLAfter = pCheck.sizes.find(s => s.size === 'L');
    expect(sizeLAfter.stock).toBe(initialStockL);
  });

  test('3. 20 parallel POST /checkout/create calls for stock 3: exactly 3 succeed and stock never goes below 0', async ({ playwright }) => {
    // Set stock of size M to exactly 3
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    await Product.updateOne(
      { _id: product._id, 'sizes.size': 'M' },
      { $set: { 'sizes.$.stock': 3 } }
    );

    // Prepare 20 parallel requests with separate request contexts
    const results = await Promise.all(
      Array.from({ length: 20 }, async (_, index) => {
        const reqContext = await playwright.request.newContext({
          baseURL: 'http://localhost:3001'
        });

        // Fetch /checkout to get CSRF token and cookie
        const getRes = await reqContext.get('/checkout');
        const html = await getRes.text();
        const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : '';

        const res = await reqContext.post('/checkout/create', {
          headers: {
            'x-csrf-token': csrfToken
          },
          data: {
            items: [{
              productId: product._id.toString(),
              name: 'Rose Garden Nighty',
              size: 'M',
              quantity: 1,
              price: product.price
            }],
            customer: {
              name: `Concurrent Shopper ${index}`,
              phone: `98460${String(10000 + index).slice(-5)}`,
              address: `Apartment ${index}, High Street`,
              city: 'Kochi',
              pin: '682001'
            },
            agreeNoReturns: true
          }
        });

        const status = res.status();
        const body = await res.json().catch(() => ({}));
        await reqContext.dispose();
        return { status, body };
      })
    );

    const successful = results.filter(r => r.status === 200 && r.body.success === true);
    const failed = results.filter(r => (r.status === 400 || r.status === 409) && (
      (typeof r.body.error === 'string' && r.body.error.toLowerCase().includes('sold out')) ||
      (r.body.error && (r.body.error.code === 'SOLD_OUT' || (r.body.error.message && r.body.error.message.toLowerCase().includes('sold out'))))
    ));

    expect(successful.length).toBe(3);
    expect(failed.length).toBe(17);

    // Verify stock in database is exactly 0 and never below 0
    const finalProduct = await Product.findOne({ _id: product._id });
    const finalSizeM = finalProduct.sizes.find(s => s.size === 'M');
    expect(finalSizeM.stock).toBe(0);
  });

  test('4. Verify route bound strictly to order: order mismatch, amount mismatch, and uncaptured payments are rejected', async ({ request }) => {
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });

    // Create Order A
    const orderIdA = `NEST-ORDER-A-${Date.now()}`;
    const rzpOrderA = `order_rzp_A_${Date.now()}`;
    await Order.create({
      orderId: orderIdA,
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: product.price,
        size: 'L',
        quantity: 1,
        image: '/img/logo.svg'
      }],
      customer: { name: 'Customer A', phone: '9846011111', address: 'Road A', city: 'Kochi', pin: '682001' },
      subtotal: product.price,
      shipping: 60,
      total: product.price + 60,
      status: 'pending_payment',
      reservedUntil: new Date(Date.now() + 15 * 60 * 1000),
      payment: { razorpayOrderId: rzpOrderA, status: 'pending', method: 'Razorpay' }
    });

    // Create Order B
    const orderIdB = `NEST-ORDER-B-${Date.now()}`;
    const rzpOrderB = `order_rzp_B_${Date.now()}`;
    await Order.create({
      orderId: orderIdB,
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: product.price,
        size: 'L',
        quantity: 1,
        image: '/img/logo.svg'
      }],
      customer: { name: 'Customer B', phone: '9846022222', address: 'Road B', city: 'Kochi', pin: '682001' },
      subtotal: product.price,
      shipping: 60,
      total: product.price + 60,
      status: 'pending_payment',
      reservedUntil: new Date(Date.now() + 15 * 60 * 1000),
      payment: { razorpayOrderId: rzpOrderB, status: 'pending', method: 'Razorpay' }
    });

    // Get CSRF token
    const checkoutPageRes = await request.get('/checkout');
    const html = await checkoutPageRes.text();
    const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    // Case 1: Unknown Razorpay order id -> returns 404
    const unknownRes = await request.post('/checkout/verify', {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        orderId: orderIdA,
        razorpay_order_id: 'order_nonexistent_999999',
        razorpay_payment_id: 'pay_test_123',
        razorpay_signature: generatePaymentSignature('order_nonexistent_999999', 'pay_test_123')
      }
    });
    expect(unknownRes.status()).toBe(404);

    // Case 2: Signature valid for order A, but client sends razorpay_order_id of Order B with payment ID of Order A
    const mismatchedSig = generatePaymentSignature(rzpOrderA, 'pay_mock_' + rzpOrderA);
    const mismatchRes = await request.post('/checkout/verify', {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        orderId: orderIdB,
        razorpay_order_id: rzpOrderB,
        razorpay_payment_id: 'pay_mock_' + rzpOrderA,
        razorpay_signature: mismatchedSig
      }
    });
    expect(mismatchRes.status()).toBe(400);

    // Case 3: Amount mismatch (mock payment returns mismatched amount 50000 paise vs order 65900)
    const payMismatchId = `pay_mismatch_amount_${rzpOrderA}`;
    const mismatchAmountSig = generatePaymentSignature(rzpOrderA, payMismatchId);
    const mismatchAmountRes = await request.post('/checkout/verify', {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        orderId: orderIdA,
        razorpay_order_id: rzpOrderA,
        razorpay_payment_id: payMismatchId,
        razorpay_signature: mismatchAmountSig
      }
    });
    expect(mismatchAmountRes.status()).toBe(400);
    const mismatchBody = await mismatchAmountRes.json();
    expect(mismatchBody.error).toContain('Payment validation failed');

    // Case 4: Payment not captured (mock payment returns failed/uncaptured)
    const payUncapturedId = `pay_uncaptured_${rzpOrderA}`;
    const uncapturedSig = generatePaymentSignature(rzpOrderA, payUncapturedId);
    const uncapturedRes = await request.post('/checkout/verify', {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        orderId: orderIdA,
        razorpay_order_id: rzpOrderA,
        razorpay_payment_id: payUncapturedId,
        razorpay_signature: uncapturedSig
      }
    });
    expect(uncapturedRes.status()).toBe(400);

    // Case 5: Authorized payment is automatically captured and succeeds
    const payAuthorizedId = `pay_authorized_${rzpOrderA}`;
    const authorizedSig = generatePaymentSignature(rzpOrderA, payAuthorizedId);
    const authorizedRes = await request.post('/checkout/verify', {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        orderId: orderIdA,
        razorpay_order_id: rzpOrderA,
        razorpay_payment_id: payAuthorizedId,
        razorpay_signature: authorizedSig
      }
    });
    expect(authorizedRes.status()).toBe(200);
    const authBody = await authorizedRes.json();
    expect(authBody.success).toBe(true);

    const checkOrderA = await Order.findOne({ orderId: orderIdA });
    expect(checkOrderA.status).toBe('paid');
  });

  test('5. Reconciliation job: finds pending_payment orders and marks them paid when payment captured in Razorpay', async () => {
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const orderId = `NEST-RECON-${Date.now()}`;
    const rzpOrderId = `order_recon_${Date.now()}`;

    // Create an order in pending_payment within the last 24 hours
    await Order.create({
      orderId,
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: product.price,
        size: 'L',
        quantity: 1,
        image: '/img/logo.svg'
      }],
      customer: { name: 'Recon Customer', phone: '9846099999', address: 'Recon Road', city: 'Kochi', pin: '682001' },
      subtotal: product.price,
      shipping: 60,
      total: product.price + 60,
      status: 'pending_payment',
      reservedUntil: new Date(Date.now() + 10 * 60 * 1000),
      payment: { razorpayOrderId: rzpOrderId, status: 'pending', method: 'Razorpay' }
    });

    // Run reconciliation job
    await runOrderReconciliation();

    // Verify order was reconciled and marked 'paid'
    const reconciledOrder = await Order.findOne({ orderId });
    expect(reconciledOrder.status).toBe('paid');
    expect(reconciledOrder.payment.status).toBe('captured');
    expect(reconciledOrder.payment.razorpayPaymentId).toContain('pay_rec_');
  });
});
