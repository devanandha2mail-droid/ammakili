const { test, expect, request: playwrightRequest } = require('@playwright/test');
const crypto = require('crypto');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Product, Order } = require('../helpers/db');

test.describe('Real Client Checkout (NODE_ENV=development, mock harness OFF)', () => {
  let devServer;
  let devBaseURL;
  let savedEnv = {};

  test.beforeAll(async () => {
    await connectTestDB();
    await resetAndSeedDatabase();

    savedEnv = {
      NODE_ENV: process.env.NODE_ENV,
      ALLOW_TEST_HARNESS: process.env.ALLOW_TEST_HARNESS,
      ALLOW_TEST_LOGIN: process.env.ALLOW_TEST_LOGIN,
      PORT: process.env.PORT
    };

    // Strictly run in development mode with test harness turned OFF
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_TEST_HARNESS;
    delete process.env.ALLOW_TEST_LOGIN;

    // Clear module cache to load fresh development application
    delete require.cache[require.resolve('../../src/app')];
    delete require.cache[require.resolve('../../src/routes/checkout')];
    delete require.cache[require.resolve('../../src/controllers/checkoutController')];
    delete require.cache[require.resolve('../../src/middleware/csrf')];

    const app = require('../../src/app');

    const PORT = 3097;
    devBaseURL = `http://localhost:${PORT}`;
    devServer = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  test.afterAll(async () => {
    if (devServer) {
      await new Promise((resolve) => devServer.close(resolve));
    }
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    if (savedEnv.ALLOW_TEST_HARNESS !== undefined) process.env.ALLOW_TEST_HARNESS = savedEnv.ALLOW_TEST_HARNESS;
    if (savedEnv.ALLOW_TEST_LOGIN !== undefined) process.env.ALLOW_TEST_LOGIN = savedEnv.ALLOW_TEST_LOGIN;
    if (savedEnv.PORT !== undefined) process.env.PORT = savedEnv.PORT;

    delete require.cache[require.resolve('../../src/app')];
    delete require.cache[require.resolve('../../src/routes/checkout')];
    delete require.cache[require.resolve('../../src/controllers/checkoutController')];
    delete require.cache[require.resolve('../../src/middleware/csrf')];

    await disconnectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  // Helper to add product and navigate to checkout in development mode
  async function setupCheckout(page, size = 'M') {
    await page.goto(`${devBaseURL}/product/rose-garden-nighty`);
    const sizePill = page.locator(`.pdp-size-pill[data-size="${size}"], button[data-size="${size}"]`).first();
    await sizePill.click();
    await page.click('#pdpAddToCartBtn');

    await page.goto(`${devBaseURL}/checkout`);
    await page.fill('#f-name', 'Devika Nambiar');
    await page.fill('#f-phone', '9846012345');
    await page.fill('#f-email', 'devika@example.com');
    await page.fill('#f-addr', 'TC 14/201, Kowdiar Gardens');
    await page.fill('#f-city', 'Thiruvananthapuram');
    await page.fill('#f-pin', '695003');
    await page.check('#f-ok');
  }

  test('1. Real client checkout: stubbed Razorpay opens with exact options; payment handler completes order without console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known benign network/loopback image CORS warning in test environment
        if (!text.includes('loopback') && !text.includes('web-share')) {
          consoleErrors.push(text);
        }
      }
    });

    // Replace https://checkout.razorpay.com/v1/checkout.js with test stub
    await page.route('https://checkout.razorpay.com/v1/checkout.js', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.Razorpay = function(options) {
            this.options = options;
            window.__rzpOptions = options;
            window.__rzpInstance = this;
          };
          window.Razorpay.prototype.open = function() {
            window.__rzpOpened = true;
          };
          window.Razorpay.prototype.on = function(event, callback) {
            if (!window.__rzpEvents) window.__rzpEvents = {};
            window.__rzpEvents[event] = callback;
          };
        `
      });
    });

    await setupCheckout(page, 'M');

    // Confirm mock harness modal is NOT in the HTML
    const mockModal = page.locator('#razorpay-mock-modal');
    await expect(mockModal).toHaveCount(0);

    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const expectedAmountPaise = (product.price + 60) * 100;

    // Submit order
    const submitBtn = page.locator('#submit-order-btn');
    await submitBtn.click();

    // Wait until stub records options and open() is invoked
    await page.waitForFunction(() => window.__rzpOpened === true && window.__rzpOptions !== undefined, { timeout: 10000 });

    const rzpOptions = await page.evaluate(() => window.__rzpOptions);
    expect(rzpOptions).toBeTruthy();
    expect(rzpOptions.key).toBeTruthy();
    expect(rzpOptions.currency).toBe('INR');
    expect(rzpOptions.amount).toBe(expectedAmountPaise);
    expect(rzpOptions.order_id).toMatch(/^order_/);

    // Order document in MongoDB must match
    const orderDoc = await Order.findOne({ 'payment.razorpayOrderId': rzpOptions.order_id });
    expect(orderDoc).not.toBeNull();
    expect(orderDoc.status).toBe('pending_payment');

    // Compute valid HMAC-SHA256 signature for verification
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const testPaymentId = 'pay_real_client_' + Date.now();
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${rzpOptions.order_id}|${testPaymentId}`)
      .digest('hex');

    // Call options.handler(...) to simulate successful payment from gateway
    await page.evaluate(({ pid, sig }) => {
      window.__rzpOptions.handler({
        razorpay_order_id: window.__rzpOptions.order_id,
        razorpay_payment_id: pid,
        razorpay_signature: sig
      });
    }, { pid: testPaymentId, sig: signature });

    // Assert redirect to confirmation page
    await expect(page).toHaveURL(new RegExp(`/checkout/confirmation/${orderDoc.orderId}`), { timeout: 15000 });

    // Verify order in database is now 'paid'
    const paidOrder = await Order.findOne({ orderId: orderDoc.orderId });
    expect(paidOrder.status).toBe('paid');
    expect(paidOrder.payment.razorpayPaymentId).toBe(testPaymentId);

    // Verify no console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('2. Script failure handling: when Razorpay script fails to load, shows specific inline error and re-enables button', async ({ page }) => {
    // Abort loading of Razorpay checkout.js
    await page.route('https://checkout.razorpay.com/v1/checkout.js', (route) => {
      route.abort();
    });

    await setupCheckout(page, 'M');

    const submitBtn = page.locator('#submit-order-btn');
    await submitBtn.click();

    // Verify exact inline error message is displayed
    const errBox = page.locator('#checkout-order-error');
    await expect(errBox).toBeVisible({ timeout: 10000 });
    await expect(errBox).toContainText('Payment window could not load. Please check your connection and try again.');

    // Verify button is re-enabled for user retry
    await expect(submitBtn).toBeEnabled();
  });

  test('3. Stock hold release: dismissing popup calls POST /checkout/cancel and releases stock at once', async ({ page }) => {
    await page.route('https://checkout.razorpay.com/v1/checkout.js', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.Razorpay = function(options) {
            this.options = options;
            window.__rzpOptions = options;
          };
          window.Razorpay.prototype.open = function() {
            window.__rzpOpened = true;
          };
          window.Razorpay.prototype.on = function() {};
        `
      });
    });

    const initialProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const initialStock = initialProduct.sizes.find(s => s.size === 'M').stock;

    await setupCheckout(page, 'M');

    const submitBtn = page.locator('#submit-order-btn');
    await submitBtn.click();

    await page.waitForFunction(() => window.__rzpOpened === true, { timeout: 10000 });

    // Verify stock is held while modal is open
    const midProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const midStock = midProduct.sizes.find(s => s.size === 'M').stock;
    expect(midStock).toBe(initialStock - 1);

    // Dismiss modal from client
    await page.evaluate(() => {
      window.__rzpOptions.modal.ondismiss();
    });

    // Wait briefly for cancel fetch to complete and verify stock is immediately restored in DB
    await expect.poll(async () => {
      const p = await Product.findOne({ slug: 'rose-garden-nighty' });
      return p.sizes.find(s => s.size === 'M').stock;
    }, { timeout: 5000 }).toBe(initialStock);

    // Verify order marked failed and stockReturned is true
    const rzpOrderId = await page.evaluate(() => window.__rzpOptions.order_id);
    const cancelledOrder = await Order.findOne({ 'payment.razorpayOrderId': rzpOrderId });
    expect(cancelledOrder.status).toBe('failed');
    expect(cancelledOrder.stockReturned).toBe(true);

    // Submit button is re-enabled
    await expect(submitBtn).toBeEnabled();
  });

  test('4. Idempotency: submitting twice quickly creates only ONE order and does not decrement stock twice', async () => {
    const apiContext = await playwrightRequest.newContext({ baseURL: devBaseURL });

    // 1. Visit /checkout to acquire session/guest cookie and CSRF token
    const checkoutPageRes = await apiContext.get('/checkout');
    const html = await checkoutPageRes.text();
    const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const initialStock = product.sizes.find(s => s.size === 'L').stock;

    const payload = {
      items: [{
        productId: product._id.toString(),
        size: 'L',
        quantity: 1
      }],
      customer: {
        name: 'Suresh Kumar',
        phone: '9847123456',
        address: 'Hill View 12',
        city: 'Kochi',
        pin: '682001'
      },
      agreeNoReturns: true
    };

    // Send two rapid POST /checkout/create requests within the same session
    const [res1, res2] = await Promise.all([
      apiContext.post('/checkout/create', {
        headers: { 'x-csrf-token': csrfToken },
        data: payload
      }),
      apiContext.post('/checkout/create', {
        headers: { 'x-csrf-token': csrfToken },
        data: payload
      })
    ]);

    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Idempotent: both must return the identical order ID and Razorpay Order ID
    expect(body1.orderId).toBe(body2.orderId);
    expect(body1.razorpayOrderId).toBe(body2.razorpayOrderId);
    expect(body1.orderToken).toBe(body2.orderToken);

    // Only 1 order document in MongoDB
    const orderCount = await Order.countDocuments({ orderId: body1.orderId });
    expect(orderCount).toBe(1);

    // Stock was decremented by 1 (NOT 2)
    const finalProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const finalStock = finalProduct.sizes.find(s => s.size === 'L').stock;
    expect(finalStock).toBe(initialStock - 1);

    await apiContext.dispose();
  });

  test('5. Retry after dismiss: last item in stock can be retried and purchased by the same customer after dismissing', async ({ page }) => {
    await page.route('https://checkout.razorpay.com/v1/checkout.js', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.Razorpay = function(options) {
            this.options = options;
            window.__rzpOptions = options;
          };
          window.Razorpay.prototype.open = function() {
            window.__rzpOpened = true;
          };
          window.Razorpay.prototype.on = function() {};
        `
      });
    });

    // Set stock of size XL to exactly 1
    await Product.updateOne(
      { slug: 'rose-garden-nighty', 'sizes.size': 'XL' },
      { $set: { 'sizes.$.stock': 1 } }
    );

    await setupCheckout(page, 'XL');

    const submitBtn = page.locator('#submit-order-btn');

    // 1st Attempt: submit order -> reserves last item (stock becomes 0)
    await submitBtn.click();
    await page.waitForFunction(() => window.__rzpOpened === true, { timeout: 10000 });

    let pCheck = await Product.findOne({ slug: 'rose-garden-nighty' });
    expect(pCheck.sizes.find(s => s.size === 'XL').stock).toBe(0);

    // Dismiss modal -> cancels order and releases stock back to 1
    await page.evaluate(() => {
      window.__rzpOptions.modal.ondismiss();
    });

    await expect.poll(async () => {
      const p = await Product.findOne({ slug: 'rose-garden-nighty' });
      return p.sizes.find(s => s.size === 'XL').stock;
    }, { timeout: 5000 }).toBe(1);

    // 2nd Attempt: customer retries on the same page
    await expect(submitBtn).toBeEnabled();
    await page.evaluate(() => { window.__rzpOpened = false; });
    await submitBtn.click();

    await page.waitForFunction(() => window.__rzpOpened === true, { timeout: 10000 });

    // Stock reserved again (now 0)
    pCheck = await Product.findOne({ slug: 'rose-garden-nighty' });
    expect(pCheck.sizes.find(s => s.size === 'XL').stock).toBe(0);

    // Complete payment
    const rzpOptions = await page.evaluate(() => window.__rzpOptions);
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const testPaymentId = 'pay_retry_success_' + Date.now();
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${rzpOptions.order_id}|${testPaymentId}`)
      .digest('hex');

    await page.evaluate(({ pid, sig }) => {
      window.__rzpOptions.handler({
        razorpay_order_id: window.__rzpOptions.order_id,
        razorpay_payment_id: pid,
        razorpay_signature: sig
      });
    }, { pid: testPaymentId, sig: signature });

    await expect(page).toHaveURL(/\/checkout\/confirmation\/NEST-/i, { timeout: 15000 });

    // Final order in DB is paid
    const finalOrder = await Order.findOne({ 'payment.razorpayPaymentId': testPaymentId });
    expect(finalOrder).not.toBeNull();
    expect(finalOrder.status).toBe('paid');
  });
});

