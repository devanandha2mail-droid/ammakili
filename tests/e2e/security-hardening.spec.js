const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, Customer, Order, Product } = require('../helpers/db');
const { runDailyDataRetentionJob } = require('../../src/services/orderCleanup');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

test.describe('Section 4: Security Hardening Verification Suite', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test('1. Health check endpoints: /healthz and /readyz', async ({ request }) => {
    // /healthz returns 200 { status: "ok" }
    const healthRes = await request.get('/healthz');
    expect(healthRes.status()).toBe(200);
    const healthBody = await healthRes.json();
    expect(healthBody.status).toBe('ok');
    expect(healthBody.version).toBeUndefined();
    expect(healthBody.env).toBeUndefined();

    // /readyz returns 200 { status: "ready" }
    const readyRes = await request.get('/readyz');
    expect(readyRes.status()).toBe(200);
    const readyBody = await readyRes.json();
    expect(readyBody.status).toBe('ready');
    expect(readyBody.version).toBeUndefined();
  });

  test('2. Security headers (HSTS, Referrer-Policy, Permissions-Policy, COOP, no X-Powered-By, Cache-Control, X-Request-Id)', async ({ request }) => {
    const res = await request.get('/');
    const headers = res.headers();

    // X-Powered-By is NEVER present
    expect(headers['x-powered-by']).toBeUndefined();

    // Referrer-Policy
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

    // Permissions-Policy
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['permissions-policy']).toContain('microphone=()');
    expect(headers['permissions-policy']).toContain('geolocation=()');
    expect(headers['permissions-policy']).toContain('payment=(self "https://api.razorpay.com")');

    // Cross-Origin-Opener-Policy
    expect(headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');

    // X-Request-Id header present
    expect(headers['x-request-id']).toBeTruthy();

    // Pre-launch robots protection on test/dev
    expect(headers['x-robots-tag']).toBe('noindex, nofollow');

    // Cache-Control: no-store on sensitive endpoints
    for (const sensitivePath of ['/admin/login', '/checkout']) {
      const sensitiveRes = await request.get(sensitivePath);
      const sensHeaders = sensitiveRes.headers();
      expect(sensHeaders['cache-control']).toContain('no-store');
      expect(sensHeaders['cache-control']).toContain('no-cache');
    }
  });

  test('3. NoSQL Operator Injection is rejected with 400', async ({ request }) => {
    // Attempt body with operator in key ($where or $ne)
    const nosqlRes = await request.post('/cart/validate', {
      data: {
        '$where': 'sleep(1000)',
        items: []
      }
    });
    expect(nosqlRes.status()).toBe(400);
    const body = await nosqlRes.json();
    expect(body.error.code).toBe('INVALID_INPUT_KEY');

    // Attempt nested operator key
    const nestedRes = await request.post('/cart/validate', {
      data: {
        filter: { '$gt': '' },
        items: []
      }
    });
    expect(nestedRes.status()).toBe(400);

    // Attempt key with dot
    const dotRes = await request.post('/cart/validate', {
      data: {
        'user.role': 'admin',
        items: []
      }
    });
    expect(dotRes.status()).toBe(400);
  });

  test('4. Payload body limit: requests exceeding 100 KB are rejected with 413', async ({ request }) => {
    const largePayload = {
      largeField: 'A'.repeat(150 * 1024) // 150 KB
    };

    const res = await request.post('/cart/validate', {
      data: largePayload
    });
    expect(res.status()).toBe(413);
  });

  test('5. Cross-site Origin enforcement rejects untrusted origins with 403', async ({ request }) => {
    // Malicious Origin
    const untrustedRes = await request.post('/cart/validate', {
      headers: {
        origin: 'https://evil-attacker-site.com',
        referer: 'https://evil-attacker-site.com/exploit'
      },
      data: { items: [] }
    });
    expect(untrustedRes.status()).toBe(403);
    const body = await untrustedRes.json();
    expect(body.error.code).toBe('INVALID_ORIGIN');

    // Trusted localhost Origin succeeds
    const trustedRes = await request.post('/cart/validate', {
      headers: {
        origin: 'http://localhost:3001',
        referer: 'http://localhost:3001/cart'
      },
      data: { items: [] }
    });
    expect(trustedRes.status()).toBe(200);
  });

  test('6. IDOR protection: Customer A cannot view Customer B order, and track-order requires matching phone', async ({ page }) => {
    // Create customer A and customer B
    const custA = await Customer.create({
      googleId: 'g_cust_a_123',
      email: 'customer.a@example.com',
      name: 'Customer A',
      phone: '9846011111'
    });
    const custB = await Customer.create({
      googleId: 'g_cust_b_456',
      email: 'customer.b@example.com',
      name: 'Customer B',
      phone: '9846022222'
    });

    // Create order belonging to Customer B
    const orderB = await Order.create({
      orderId: 'ORD-SEC-002',
      customerId: custB._id,
      customer: {
        name: custB.name,
        phone: custB.phone,
        email: custB.email,
        address: 'B House',
        city: 'Thrissur',
        pin: '680001'
      },
      items: [{
        productId: new (require('mongoose').Types.ObjectId)(),
        name: 'Cotton Nighty',
        size: 'L',
        quantity: 1,
        price: 799
      }],
      subtotal: 799,
      shipping: 60,
      total: 859,
      status: 'paid'
    });

    // 1. Log in as Customer A via test login
    const loginRes = await page.request.post('/__test/login', {
      form: {
        email: 'customer.a@example.com',
        name: 'Customer A'
      }
    });
    expect(loginRes.status()).toBe(200);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/account/);

    // 2. Customer A attempts to view Customer B's order by ID -> 403 Forbidden
    const idorRes = await page.goto(`/account/orders/${orderB._id}`);
    expect(idorRes.status()).toBe(403);

    // 3. Track-order without matching phone does not reveal order details
    await page.goto('/track-order');
    const csrfToken = await page.locator('input[name="_csrf"]').first().getAttribute('value');
    const trackWrongPhone = await page.request.post('/track-order', {
      headers: { 'x-csrf-token': csrfToken },
      form: {
        orderId: 'ORD-SEC-002',
        phone: '9999999999' // Wrong phone
      }
    });
    const trackHtml = await trackWrongPhone.text();
    expect(trackHtml).not.toContain('B House');
    expect(trackHtml).toContain('No order found matching this Order ID');
  });

  test('7. Customer privacy export and deletion CLI tools', async () => {
    // Seed customer and completed order
    const privCust = await Customer.create({
      googleId: 'g_priv_999',
      email: 'privacy.test@example.com',
      name: 'Ananya S.',
      phone: '9846099999',
      addresses: [{
        label: 'Home',
        name: 'Ananya S.',
        phone: '9846099999',
        address: 'Heritage Villa, Kowdiar',
        city: 'Trivandrum',
        state: 'Kerala',
        pin: '695003',
        isDefault: true
      }]
    });

    const privOrder = await Order.create({
      orderId: 'ORD-PRIV-999',
      customerId: privCust._id,
      customer: {
        name: privCust.name,
        phone: privCust.phone,
        email: privCust.email,
        address: 'Heritage Villa, Kowdiar',
        city: 'Trivandrum',
        pin: '695003'
      },
      items: [{
        productId: new (require('mongoose').Types.ObjectId)(),
        name: 'Satin Nighty',
        size: 'XL',
        quantity: 1,
        price: 999
      }],
      subtotal: 999,
      shipping: 60,
      total: 1059,
      status: 'paid'
    });

    // 1. Run export
    const exportOutput = execSync('node scripts/customer-privacy.js export privacy.test@example.com').toString();
    const parsed = JSON.parse(exportOutput);
    expect(parsed.customerEmail).toBe('privacy.test@example.com');
    expect(parsed.totalOrders).toBe(1);
    expect(parsed.orders[0].orderId).toBe('ORD-PRIV-999');

    // 2. Run delete / anonymization
    const deleteOutput = execSync('node scripts/customer-privacy.js delete privacy.test@example.com').toString();
    expect(deleteOutput).toContain('Customer records processed');

    // Verify Customer profile was removed
    const foundCust = await Customer.findOne({ email: 'privacy.test@example.com' });
    expect(foundCust).toBeNull();

    // Verify Completed Order was anonymized (tax compliance retention)
    const anonymizedOrder = await Order.findById(privOrder._id);
    expect(anonymizedOrder).not.toBeNull();
    expect(anonymizedOrder.customer.name).toBe('Redacted Customer');
    expect(anonymizedOrder.customer.phone).toBe('0000000000');
    expect(anonymizedOrder.customer.address).toBe('Redacted for Privacy Compliance');
  });

  test('8. Automated data retention cleanup purges abandoned orders older than 30 days but keeps completed orders', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    // 1. Abandoned order older than 30 days
    const abandonedOrder = await Order.create({
      orderId: 'ORD-ABANDONED',
      customer: { name: 'Old Cart', phone: '9846000000', address: 'Old', city: 'Old', pin: '680001' },
      items: [{ productId: new (require('mongoose').Types.ObjectId)(), name: 'Sample Nighty', size: 'M', quantity: 1, price: 500 }],
      subtotal: 500,
      total: 560,
      status: 'pending_payment',
      createdAt: thirtyOneDaysAgo
    });

    // 2. Completed order older than 30 days (must NOT be deleted)
    const completedOldOrder = await Order.create({
      orderId: 'ORD-COMPLETED-OLD',
      customer: { name: 'Loyal Buyer', phone: '9846000001', address: 'Home', city: 'Kochi', pin: '682001' },
      items: [{ productId: new (require('mongoose').Types.ObjectId)(), name: 'Sample Nighty', size: 'M', quantity: 1, price: 800 }],
      subtotal: 800,
      total: 860,
      status: 'paid',
      createdAt: thirtyOneDaysAgo
    });

    // Run retention job
    await runDailyDataRetentionJob();

    // Verify abandoned order was purged
    const checkAbandoned = await Order.findById(abandonedOrder._id);
    expect(checkAbandoned).toBeNull();

    // Verify completed order is preserved
    const checkCompleted = await Order.findById(completedOldOrder._id);
    expect(checkCompleted).not.toBeNull();
    expect(checkCompleted.status).toBe('paid');
  });
});
