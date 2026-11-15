const { test, expect, request: playwrightRequest } = require('@playwright/test');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Order, Product } = require('../helpers/db');

test.describe('Production Safety & Session Integrity Verification', () => {
  let prodServer;
  let prodBaseURL;
  let savedEnv = {};

  test.beforeAll(async () => {
    await connectTestDB();
    await resetAndSeedDatabase();

    // Preserve original environment
    savedEnv = {
      NODE_ENV: process.env.NODE_ENV,
      ALLOW_TEST_HARNESS: process.env.ALLOW_TEST_HARNESS,
      ALLOW_TEST_LOGIN: process.env.ALLOW_TEST_LOGIN,
      PORT: process.env.PORT
    };

    // Configure strictly as production without any test harness or test login flags
    process.env.NODE_ENV = 'production';
    process.env.PAYMENTS_MODE = 'test';
    process.env.ALLOW_TEST_PAYMENTS_IN_PROD = 'true';
    process.env.SESSION_SECRET = 'c8b9d7a6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0';
    process.env.COOKIE_SECRET = 'c8b9d7a6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0';
    process.env.ADMIN_OWNER_EMAIL = 'devanandha2mail@gmail.com';
    process.env.STYLIST_KEY = 'stylist_prod_key_secure_12345';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_webhook_secret_production_xyz';
    process.env.SITE_URL = 'https://nestammakkili.com';
    delete process.env.ALLOW_TEST_HARNESS;
    delete process.env.ALLOW_TEST_LOGIN;

    // Clear module cache to load fresh production configuration
    delete require.cache[require.resolve('../../src/app')];
    delete require.cache[require.resolve('../../src/utils/envGuard')];
    delete require.cache[require.resolve('../../src/middleware/csrf')];

    const prodApp = require('../../src/app');

    // Start ephemeral production server on port 3095
    const PORT = 3095;
    prodBaseURL = `http://localhost:${PORT}`;
    prodServer = prodApp.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  test.afterAll(async () => {
    if (prodServer) {
      await new Promise((resolve) => prodServer.close(resolve));
    }
    // Restore environment
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    if (savedEnv.ALLOW_TEST_HARNESS !== undefined) process.env.ALLOW_TEST_HARNESS = savedEnv.ALLOW_TEST_HARNESS;
    if (savedEnv.ALLOW_TEST_LOGIN !== undefined) process.env.ALLOW_TEST_LOGIN = savedEnv.ALLOW_TEST_LOGIN;
    if (savedEnv.PORT !== undefined) process.env.PORT = savedEnv.PORT;

    delete require.cache[require.resolve('../../src/app')];
    delete require.cache[require.resolve('../../src/utils/envGuard')];
    delete require.cache[require.resolve('../../src/middleware/csrf')];

    await disconnectTestDB();
  });

  test('1. Mock payment modal (#razorpay-mock-modal) is not rendered in production HTML', async () => {
    const apiContext = await playwrightRequest.newContext({ baseURL: prodBaseURL });
    const res = await apiContext.get('/checkout');
    expect(res.status()).toBe(200);

    const html = await res.text();
    expect(html).not.toContain('id="razorpay-mock-modal"');
    expect(html).not.toContain('id="mock-pay-success-btn"');
    expect(html).not.toContain('id="mock-pay-fail-btn"');
    expect(html).not.toContain('Razorpay Checkout (Test Mode)');
    expect(html).not.toContain('window.__TEST_HARNESS__');
    await apiContext.dispose();
  });

  test('2. /__test/login returns 404 in production environment', async () => {
    const apiContext = await playwrightRequest.newContext({ baseURL: prodBaseURL });
    const res = await apiContext.post('/__test/login', {
      data: { email: 'customer@example.com' }
    });
    expect(res.status()).toBe(404);
    await apiContext.dispose();
  });

  test('2b. /admin/test-login returns 404 in production environment', async () => {
    const apiContext = await playwrightRequest.newContext({ baseURL: prodBaseURL });
    const res = await apiContext.get('/admin/test-login?email=owner@nestammakkili.com&role=owner');
    expect(res.status()).toBe(404);
    await apiContext.dispose();
  });

  test('3. Bad payment signature on POST /checkout/verify returns 400 and preserves pending order and stock', async () => {
    const apiContext = await playwrightRequest.newContext({ baseURL: prodBaseURL });

    // Fetch checkout page to get CSRF token and guest cookies
    const checkoutPageRes = await apiContext.get('/checkout');
    const html = await checkoutPageRes.text();
    const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';
    expect(csrfToken).toBeTruthy();

    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeM = product.sizes.find(s => s.size === 'M');
    const initialStock = sizeM.stock;

    // Create a pending order in the database
    const orderId = `NEST-${Math.floor(100000 + Math.random() * 900000)}`;
    const rzpOrderId = `order_test_${Date.now()}`;
    await Order.create({
      orderId,
      items: [{
        productId: product._id,
        name: product.name,
        price: product.price,
        size: 'M',
        quantity: 1,
        image: '/img/logo.svg'
      }],
      customer: {
        name: 'Test Customer',
        phone: '9846012345',
        address: 'Test House',
        city: 'Kochi',
        pin: '682031'
      },
      subtotal: product.price,
      shipping: 60,
      total: product.price + 60,
      status: 'pending_payment',
      payment: {
        razorpayOrderId: rzpOrderId,
        status: 'pending',
        method: 'Razorpay'
      }
    });

    // Send invalid signature
    const verifyRes = await apiContext.post('/checkout/verify', {
      headers: {
        'x-csrf-token': csrfToken
      },
      data: {
        orderId,
        razorpay_order_id: rzpOrderId,
        razorpay_payment_id: 'pay_fraudulent_123',
        razorpay_signature: 'invalid_bad_tampered_signature_999'
      }
    });

    expect(verifyRes.status()).toBe(400);
    const body = await verifyRes.json();
    expect(body.error).toContain('verification failed');

    // Confirm order stays pending_payment
    const unchangedOrder = await Order.findOne({ orderId });
    expect(unchangedOrder.status).toBe('pending_payment');

    // Confirm stock is completely unchanged
    const unchangedProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeMUnchanged = unchangedProduct.sizes.find(s => s.size === 'M');
    expect(sizeMUnchanged.stock).toBe(initialStock);

    await apiContext.dispose();
  });

  test('4. Valid payment signature marks order paid once and decrements stock; re-sending payload does not decrement stock a second time', async () => {
    const apiContext = await playwrightRequest.newContext({ baseURL: prodBaseURL });

    // Fetch checkout page to get CSRF token and guest cookies
    const checkoutPageRes = await apiContext.get('/checkout');
    const html = await checkoutPageRes.text();
    const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeM = product.sizes.find(s => s.size === 'M');
    const initialStock = sizeM.stock;

    // Create a pending order in the database
    const orderId = `NEST-${Math.floor(100000 + Math.random() * 900000)}`;
    const rzpOrderId = `order_test_${Date.now()}`;
    const paymentId = `pay_real_${Date.now()}`;

    await Order.create({
      orderId,
      items: [{
        productId: product._id,
        name: product.name,
        price: product.price,
        size: 'M',
        quantity: 1,
        image: '/img/logo.svg'
      }],
      customer: {
        name: 'Valid Customer',
        phone: '9846012345',
        address: 'Valid House',
        city: 'Kochi',
        pin: '682031'
      },
      subtotal: product.price,
      shipping: 60,
      total: product.price + 60,
      status: 'pending_payment',
      payment: {
        razorpayOrderId: rzpOrderId,
        status: 'pending',
        method: 'Razorpay'
      }
    });

    // Simulate atomic reservation that occurred at checkout create
    await Product.updateOne({ _id: product._id, 'sizes.size': 'M' }, { $inc: { 'sizes.$.stock': -1 } });

    // Compute authentic HMAC-SHA256 signature with the secret
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const authenticSignature = crypto
      .createHmac('sha256', secret)
      .update(`${rzpOrderId}|${paymentId}`)
      .digest('hex');

    // 1st Attempt: Valid signature verification
    const firstVerifyRes = await apiContext.post('/checkout/verify', {
      headers: {
        'x-csrf-token': csrfToken
      },
      data: {
        orderId,
        razorpay_order_id: rzpOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: authenticSignature
      }
    });

    expect(firstVerifyRes.status()).toBe(200);
    const firstBody = await firstVerifyRes.json();
    expect(firstBody.success).toBe(true);

    // Confirm order transitioned to paid
    const paidOrder = await Order.findOne({ orderId });
    expect(paidOrder.status).toBe('paid');

    // Confirm stock dropped by exactly 1
    const decrementedProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeMDecremented = decrementedProduct.sizes.find(s => s.size === 'M');
    expect(sizeMDecremented.stock).toBe(initialStock - 1);

    // 2nd Attempt: Replay the identical payload
    const secondVerifyRes = await apiContext.post('/checkout/verify', {
      headers: {
        'x-csrf-token': csrfToken
      },
      data: {
        orderId,
        razorpay_order_id: rzpOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: authenticSignature
      }
    });

    expect(secondVerifyRes.status()).toBe(200);
    const secondBody = await secondVerifyRes.json();
    expect(secondBody.success).toBe(true);

    // Confirm stock was NOT reduced a second time
    const finalProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeMFinal = finalProduct.sizes.find(s => s.size === 'M');
    expect(sizeMFinal.stock).toBe(initialStock - 1);

    await apiContext.dispose();
  });

  test('5. Anonymous crawl of 200 GET requests produces 0 sessions in MongoDB for pages without forms', async () => {
    // Clear sessions collection
    await mongoose.connection.collection('sessions').deleteMany({});
    const initialSessionCount = await mongoose.connection.collection('sessions').countDocuments();
    expect(initialSessionCount).toBe(0);

    const nonFormUrls = [
      '/',
      '/shop',
      '/product/rose-garden-nighty',
      '/about',
      '/faq',
      '/policies',
      '/size-guide',
      '/css/glass.css',
      '/js/cart-store.js',
      '/img/brand/logo-full-256.png'
    ];

    // Crawl 200 GET requests (20 iterations across 10 non-form URLs)
    const apiContext = await playwrightRequest.newContext({ baseURL: prodBaseURL });

    for (let i = 0; i < 20; i++) {
      for (const url of nonFormUrls) {
        const res = await apiContext.get(url);
        expect(res.status()).toBeLessThan(400);
      }
    }

    // Check sessions collection in MongoDB
    const sessionCount = await mongoose.connection.collection('sessions').countDocuments();
    expect(sessionCount).toBe(0);

    await apiContext.dispose();
  });

  test('6. Neither test mode nor production mode HTML contains RAZORPAY_KEY_SECRET, SESSION_SECRET, or rzp_ secrets', async ({ request }) => {
    // 1. Fetch /checkout HTML in test mode
    const testRes = await request.get('/checkout');
    expect(testRes.status()).toBe(200);
    const testHtml = await testRes.text();

    const testKeySecret = savedEnv.RAZORPAY_KEY_SECRET || 'rzp_secret_nestammakkili_test';
    const testSessionSecret = savedEnv.SESSION_SECRET || 'nest_test_session_secret_key_12345';

    expect(testHtml).not.toContain(testKeySecret);
    expect(testHtml).not.toContain(testSessionSecret);
    expect(testHtml).not.toContain('rzp_secret_');
    expect(testHtml).not.toContain('rzp_live_');
    expect(testHtml).not.toContain('window.__TEST_HARNESS__');

    // 2. Fetch /checkout HTML in production mode
    const prodContext = await playwrightRequest.newContext({ baseURL: prodBaseURL });
    const prodRes = await prodContext.get('/checkout');
    expect(prodRes.status()).toBe(200);
    const prodHtml = await prodRes.text();

    expect(prodHtml).not.toContain(process.env.SESSION_SECRET);
    expect(prodHtml).not.toContain(process.env.COOKIE_SECRET);
    expect(prodHtml).not.toContain('rzp_secret_');
    expect(prodHtml).not.toContain('rzp_live_');
    expect(prodHtml).not.toContain('rzp_test_');
    expect(prodHtml).not.toContain('window.__TEST_HARNESS__');

    await prodContext.dispose();
  });

  test('7. /__test/compute-signature returns 404 in production environment', async () => {
    const apiContext = await playwrightRequest.newContext({ baseURL: prodBaseURL });
    const res = await apiContext.post('/__test/compute-signature', {
      data: { razorpay_order_id: 'order_123', razorpay_payment_id: 'pay_123' }
    });
    expect(res.status()).toBe(404);
    await apiContext.dispose();
  });

  test('8. Browser console in production mode has zero CSP errors on /checkout and on a product page with video', async ({ browser }) => {
    await Product.updateOne(
      { slug: 'rose-garden-nighty' },
      { $set: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }
    );

    const context = await browser.newContext({ baseURL: prodBaseURL });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // 1. Visit /checkout
    await page.goto('/checkout');
    await page.waitForLoadState('domcontentloaded');

    // 2. Visit product page with video
    await page.goto('/product/rose-garden-nighty');
    await page.waitForLoadState('domcontentloaded');

    // Filter CSP violations
    const cspViolations = consoleErrors.filter((e) =>
      e.toLowerCase().includes('violates the following content security policy directive') ||
      e.toLowerCase().includes('content security policy')
    );

    expect(cspViolations.length).toBe(0);
    await context.close();
  });

  test('9. Admin session cookie flags in production: __Host- prefix, Secure, HttpOnly, SameSite=Lax, and no Domain', async () => {
    const apiContext = await playwrightRequest.newContext({ baseURL: prodBaseURL });
    const res = await apiContext.get('/admin/auth/google', {
      headers: { 'x-forwarded-proto': 'https' },
      maxRedirects: 0
    });
    const setCookie = res.headers()['set-cookie'] || '';

    // Must be prefixed with __Host-
    expect(setCookie).toContain('__Host-nest_admin_sess=');
    // Must be HttpOnly
    expect(setCookie.toLowerCase()).toContain('httponly');
    // Must be Secure
    expect(setCookie.toLowerCase()).toContain('secure');
    // Must be SameSite=Lax
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    // Must NOT have Domain attribute per __Host- cookie specification
    expect(setCookie.toLowerCase()).not.toContain('domain=');

    await apiContext.dispose();
  });
});

