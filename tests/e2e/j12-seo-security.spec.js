const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Product } = require('../helpers/db');

test.describe('J12: SEO metadata, structured data, security headers, CSRF & XSS prevention', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('1. Unique titles and meta descriptions across public pages', async ({ page }) => {
    const checkPages = [
      '/',
      '/shop',
      '/product/rose-garden-nighty',
      '/size-guide',
      '/about',
      '/contact',
      '/faq',
      '/policies',
      '/track-order',
      '/login'
    ];

    const titles = new Set();
    const descriptions = new Set();

    for (const p of checkPages) {
      await page.goto(p);
      const title = await page.title();
      expect(title).toBeTruthy();
      expect(titles.has(title)).toBe(false);
      titles.add(title);

      const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(metaDesc).toBeTruthy();
      expect(descriptions.has(metaDesc)).toBe(false);
      descriptions.add(metaDesc);
    }
  });

  test('2. sitemap.xml and robots.txt validation', async ({ request }) => {
    // sitemap.xml is valid and lists products
    const sitemapRes = await request.get('/sitemap.xml');
    expect(sitemapRes.status()).toBe(200);
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).toContain('<?xml');
    expect(sitemapXml).toContain('<urlset');
    expect(sitemapXml).toContain('/product/rose-garden-nighty');

    // robots.txt blocks /admin
    const robotsRes = await request.get('/robots.txt');
    expect(robotsRes.status()).toBe(200);
    const robotsTxt = await robotsRes.text();
    expect(robotsTxt).toContain('Disallow: /admin');
  });

  test('3. Product page has valid Product JSON-LD structured data', async ({ page }) => {
    await page.goto('/product/rose-garden-nighty');
    const jsonLdScript = await page.locator('script[type="application/ld+json"]').allTextContents();
    const productSchemaText = jsonLdScript.find(t => t.includes('"Product"'));
    expect(productSchemaText).toBeTruthy();

    const productSchema = JSON.parse(productSchemaText);
    expect(productSchema['@type']).toBe('Product');
    expect(productSchema.name).toContain('Rose Garden Nighty');
    expect(productSchema.offers).toBeDefined();
    expect(Number(productSchema.offers.price)).toBe(599);
  });

  test('4. Security headers (CSP, nosniff, strict directives)', async ({ request }) => {
    const homeRes = await request.get('/');
    const headers = homeRes.headers();
    const csp = headers['content-security-policy'] || '';

    expect(csp).toBeTruthy();
    expect(headers['x-content-type-options']).toBe('nosniff');

    // Confirm strict directives
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://www.youtube-nocookie.com");
    expect(csp).not.toContain("images.unsplash.com");

    const checkoutRes = await request.get('/checkout');
    const checkoutCsp = checkoutRes.headers()['content-security-policy'] || '';
    expect(checkoutCsp).toContain("default-src 'self'");
    expect(checkoutCsp).toContain("object-src 'none'");
  });

  test('5. CSRF protection: POST without CSRF token is rejected with 403', async ({ request }) => {
    const csrfFailRes = await request.post('/checkout/create', {
      headers: {
        'content-type': 'application/json'
        // omitting x-csrf-token
      },
      data: { items: [], customer: {} }
    });
    expect(csrfFailRes.status()).toBe(403);
  });

  test('6. XSS sanitization in contact form and checkout input fields', async ({ page }) => {
    // Contact form XSS check
    await page.goto('/contact');
    await page.fill('#c-name', '<script id="xss-test">window.__xssRun = true;</script>');
    await page.fill('#c-msg', 'Hello this is an XSS test message');
    const xssContactExecuted = await page.evaluate(() => window.__xssRun === true);
    expect(xssContactExecuted).toBe(false);

    // Checkout form XSS check
    await page.goto('/product/rose-garden-nighty');
    const sizeBtn = page.locator('.pdp-size-pill[data-size="M"], button[data-size="M"]').first();
    await sizeBtn.click();
    await page.click('#pdpAddToCartBtn');
    await expect(page.locator('#cartBadge, #cart-badge')).toHaveText('1');

    await page.goto('/checkout');
    await page.waitForSelector('#f-name');
    await page.fill('#f-name', '<script id="xss-checkout">window.__xssRun = true;</script>');
    const xssCheckoutExecuted = await page.evaluate(() => window.__xssRun === true);
    expect(xssCheckoutExecuted).toBe(false);
  });

  test('7. Test-only login route returns 404 in production environment', async ({ request }) => {
    const originalEnv = { ...process.env };

    try {
      process.env.NODE_ENV = 'production';
      process.env.PAYMENTS_MODE = 'test';
      process.env.ALLOW_TEST_PAYMENTS_IN_PROD = 'true';
      process.env.SESSION_SECRET = 'c8b9d7a6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0';
      process.env.COOKIE_SECRET = 'c8b9d7a6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0';
      process.env.ADMIN_OWNER_EMAIL = 'devanandha2mail@gmail.com';
      process.env.STYLIST_KEY = 'stylist_prod_key_secure_12345';
      process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_webhook_secret_production_xyz';
      process.env.SITE_URL = 'https://nestammakkili.com';
      delete process.env.ALLOW_TEST_LOGIN;
      delete process.env.ALLOW_TEST_HARNESS;
      delete require.cache[require.resolve('../../src/app')];
      delete require.cache[require.resolve('../../src/utils/envGuard')];
      const prodApp = require('../../src/app');

      const server = prodApp.listen(3099);
      await new Promise(r => setTimeout(r, 200));
      const prodRes = await request.post('http://localhost:3099/__test/login');
      expect(prodRes.status()).toBe(404);
      await new Promise(r => server.close(r));
    } finally {
      process.env = originalEnv;
      delete require.cache[require.resolve('../../src/app')];
      delete require.cache[require.resolve('../../src/utils/envGuard')];
    }
  });

  test('8. Strict CSP verification: script-src has nonce, excludes unsafe-inline and api.razorpay.com, and yields 0 console violations', async ({ page, request }) => {
    // 1. Inspect HTTP header directives
    const homeRes = await request.get('/');
    const csp = homeRes.headers()['content-security-policy'] || '';

    // Verify script-src directives
    const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/);
    expect(scriptSrcMatch).not.toBeNull();
    const scriptSrcDirectives = scriptSrcMatch[1];

    expect(scriptSrcDirectives).toContain("'self'");
    expect(scriptSrcDirectives).toContain("'nonce-");
    expect(scriptSrcDirectives).toContain('https://checkout.razorpay.com');
    expect(scriptSrcDirectives).not.toContain("'unsafe-inline'");
    expect(scriptSrcDirectives).not.toContain('https://api.razorpay.com');

    // script-src-attr must be 'none'
    expect(csp).toContain("script-src-attr 'none'");

    // 2. Audit browser console violations on key pages
    const pagesToAudit = [
      '/',
      '/shop',
      '/product/rose-garden-nighty',
      '/cart',
      '/checkout',
      '/login',
      '/admin/login'
    ];

    const cspViolations = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Content Security Policy') || text.includes('violates the following') || text.includes('CSP')) {
        cspViolations.push(`${page.url()}: ${text}`);
      }
    });

    for (const p of pagesToAudit) {
      await page.goto(p);
      await expect(page.locator('body')).toBeVisible();
    }

    expect(cspViolations).toEqual([]);
  });
});

