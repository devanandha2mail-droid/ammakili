const { test, expect, request: playwrightRequest } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB } = require('../helpers/db');

test.describe('Rate Limiting Enforcement & Proxy Security Verification', () => {
  let rateLimitServer;
  let serverBaseURL;
  let savedEnv = {};

  test.beforeAll(async () => {
    await connectTestDB();
    await resetAndSeedDatabase();

    // Preserve original environment
    savedEnv = {
      NODE_ENV: process.env.NODE_ENV,
      ENABLE_RATE_LIMITS: process.env.ENABLE_RATE_LIMITS,
      PORT: process.env.PORT
    };

    // Enable all rate limiters explicitly
    process.env.ENABLE_RATE_LIMITS = 'true';
    process.env.NODE_ENV = 'test';
    if (global.__failedTrackingAttempts) {
      global.__failedTrackingAttempts.clear();
    }

    // Clear module cache to instantiate app with ENABLE_RATE_LIMITS = 'true'
    delete require.cache[require.resolve('../../src/app')];
    delete require.cache[require.resolve('../../src/routes/admin')];
    delete require.cache[require.resolve('../../src/routes/storefront')];
    delete require.cache[require.resolve('../../src/routes/checkout')];
    delete require.cache[require.resolve('../../src/routes/webhook')];
    delete require.cache[require.resolve('../../src/controllers/storefrontController')];
    delete require.cache[require.resolve('../../src/middleware/trackOrderLimiter')];

    const app = require('../../src/app');

    // Ephemeral server on port 3094
    const PORT = 3094;
    serverBaseURL = `http://localhost:${PORT}`;
    rateLimitServer = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  test.afterAll(async () => {
    if (rateLimitServer) {
      await new Promise((resolve) => rateLimitServer.close(resolve));
    }
    // Restore environment
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    if (savedEnv.ENABLE_RATE_LIMITS !== undefined) {
      process.env.ENABLE_RATE_LIMITS = savedEnv.ENABLE_RATE_LIMITS;
    } else {
      delete process.env.ENABLE_RATE_LIMITS;
    }
    if (savedEnv.PORT !== undefined) process.env.PORT = savedEnv.PORT;

    delete require.cache[require.resolve('../../src/app')];
    delete require.cache[require.resolve('../../src/routes/admin')];
    delete require.cache[require.resolve('../../src/routes/storefront')];
    delete require.cache[require.resolve('../../src/routes/checkout')];
    delete require.cache[require.resolve('../../src/routes/webhook')];
    delete require.cache[require.resolve('../../src/controllers/storefrontController')];
    delete require.cache[require.resolve('../../src/middleware/trackOrderLimiter')];

    await disconnectTestDB();
  });

  test('1. GET /admin/auth/google rate limiter: returns 429 on the 6th attempt (limit: 5)', async ({}, testInfo) => {
    const api = await playwrightRequest.newContext({ baseURL: serverBaseURL });
    const clientIp = testInfo.project.name === 'mobile' ? '10.99.1.11' : '10.99.1.1';

    // First 5 authentication initiation requests succeed (redirect to Google OAuth)
    for (let i = 1; i <= 5; i++) {
      const res = await api.get('/admin/auth/google', {
        headers: { 'x-forwarded-for': clientIp },
        maxRedirects: 0
      });
      expect(res.status(), `Attempt ${i} should not be 429`).not.toBe(429);
    }

    // 6th attempt must be rejected by adminAuthLimiter with 429
    const limitedRes = await api.get('/admin/auth/google', {
      headers: { 'x-forwarded-for': clientIp },
      maxRedirects: 0
    });

    expect(limitedRes.status()).toBe(429);
    const body = await limitedRes.text();
    expect(body).toContain('Too many login attempts');
    await api.dispose();
  });

  test('2. POST /track-order IP rate limiter: returns 429 on the 11th request from one IP (limit: 10)', async ({}, testInfo) => {
    const api = await playwrightRequest.newContext({ baseURL: serverBaseURL });
    const clientIp = testInfo.project.name === 'mobile' ? '10.99.1.22' : '10.99.1.2';

    // First 10 tracking requests are accepted
    for (let i = 1; i <= 10; i++) {
      const res = await api.post('/track-order', {
        headers: { 'x-forwarded-for': clientIp },
        form: {
          orderId: `NEST-TRACK-IP-${testInfo.project.name}-${i}`,
          phone: '9846012345'
        }
      });
      expect(res.status(), `Attempt ${i} should not be 429`).not.toBe(429);
    }

    // 11th attempt must be rejected by trackLimiter with 429
    const limitedRes = await api.post('/track-order', {
      headers: { 'x-forwarded-for': clientIp },
      form: {
        orderId: `NEST-TRACK-IP-${testInfo.project.name}-11`,
        phone: '9846012345'
      }
    });

    expect(limitedRes.status()).toBe(429);
    const body = await limitedRes.text();
    expect(body).toContain('Too many tracking attempts');
    await api.dispose();
  });

  test('3. Track-order per-order-id rate limiter: returns 429 on the 6th failed attempt for a specific order ID (limit: 5)', async ({}, testInfo) => {
    const api = await playwrightRequest.newContext({ baseURL: serverBaseURL });
    const targetedOrderId = `NEST-ATTACKED-TARGET-${testInfo.project.name}`;

    // 5 different clients attempt invalid lookups for the SAME order ID
    for (let i = 1; i <= 5; i++) {
      const clientIp = testInfo.project.name === 'mobile' ? `10.99.21.${i}` : `10.99.20.${i}`;
      const res = await api.post('/track-order', {
        headers: {
          'x-forwarded-for': clientIp,
          'Accept': 'application/json'
        },
        form: {
          orderId: targetedOrderId,
          phone: '984609999' + i // Wrong phone numbers
        }
      });
      expect(res.status()).not.toBe(429);
    }

    // 6th failed attempt for this order ID (even from another new IP) must be blocked by orderIdTrackLimiter
    const clientIp6 = testInfo.project.name === 'mobile' ? '10.99.21.99' : '10.99.20.99';
    const limitedRes = await api.post('/track-order', {
      headers: {
        'x-forwarded-for': clientIp6,
        'Accept': 'application/json'
      },
      form: {
        orderId: targetedOrderId,
        phone: '9846099996'
      }
    });

    expect(limitedRes.status()).toBe(429);
    const body = await limitedRes.json();
    expect(body.error).toContain('Too many tracking attempts for this order');
    await api.dispose();
  });

  test('4. Checkout create per-session limiter: returns 429 on the 11th create in a session (limit: 10)', async ({}, testInfo) => {
    const api = await playwrightRequest.newContext({ baseURL: serverBaseURL });
    const clientIp = testInfo.project.name === 'mobile' ? '10.99.30.2' : '10.99.30.1';

    // Visit /checkout first to issue signed guest cookie and CSRF token
    const checkoutPageRes = await api.get('/checkout');
    const html = await checkoutPageRes.text();
    const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    // Send 10 create requests sharing the same session/cookie context
    for (let i = 1; i <= 10; i++) {
      const res = await api.post('/checkout/create', {
        headers: {
          'x-forwarded-for': clientIp,
          'x-csrf-token': csrfToken,
          'Content-Type': 'application/json'
        },
        data: { items: [] }
      });
      expect(res.status(), `Session attempt ${i} should not be 429`).not.toBe(429);
    }

    // 11th request on the same session context must return 429
    const limitedRes = await api.post('/checkout/create', {
      headers: {
        'x-forwarded-for': clientIp,
        'x-csrf-token': csrfToken,
        'Content-Type': 'application/json'
      },
      data: { items: [] }
    });

    expect(limitedRes.status()).toBe(429);
    const body = await limitedRes.json();
    const errMsg = (body.error && body.error.message) || body.error;
    expect(errMsg).toContain('Too many checkout attempts for this session');
    await api.dispose();
  });

  test('5. Checkout create IP limiter: returns 429 on the 61st request from the same IP (limit: 60)', async ({}, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const clientIp = isMobile ? '10.99.41.1' : '10.99.40.1';

    // Send 60 requests with distinct cart tokens from clientIp
    for (let i = 1; i <= 60; i++) {
      const api = await playwrightRequest.newContext({ baseURL: serverBaseURL });
      const res = await api.post('/checkout/create', {
        headers: {
          'x-forwarded-for': clientIp,
          'x-cart-token': `cart_${testInfo.project.name}_${i}`,
          'Content-Type': 'application/json'
        },
        data: { items: [] }
      });
      expect(res.status(), `IP attempt ${i} should not be 429`).not.toBe(429);
      await api.dispose();
    }

    // 61st request from the same IP must hit checkoutIpLimiter with 429
    const limitedApi = await playwrightRequest.newContext({ baseURL: serverBaseURL });
    const limitedRes = await limitedApi.post('/checkout/create', {
      headers: {
        'x-forwarded-for': clientIp,
        'x-cart-token': `cart_${testInfo.project.name}_61`,
        'Content-Type': 'application/json'
      },
      data: { items: [] }
    });

    expect(limitedRes.status()).toBe(429);
    const body = await limitedRes.json();
    const errMsg = (body.error && body.error.message) || body.error;
    expect(errMsg).toContain('Too many checkout requests from this network');
    await limitedApi.dispose();
  });

  test('6. Trust proxy verification: spoofed X-Forwarded-For prefix does not bypass client IP limiter', async ({}, testInfo) => {
    // When trust proxy is 1, Express treats the connection as having 1 trusted proxy hop.
    // If a client sends "spoofed_ip, real_client_ip", Express evaluates real_client_ip (the rightmost hop).
    const realClientHop = testInfo.project.name === 'mobile' ? '10.99.50.2' : '10.99.50.1';

    // Run 5 login attempts with spoofed prefixes prepended to realClientHop
    for (let i = 1; i <= 5; i++) {
      const spoofedPrefix = `1.2.3.${i}`;
      const api = await playwrightRequest.newContext({ baseURL: serverBaseURL });
      const res = await api.get('/admin/auth/google', {
        headers: {
          'x-forwarded-for': `${spoofedPrefix}, ${realClientHop}`
        },
        maxRedirects: 0
      });
      expect(res.status()).not.toBe(429);
      await api.dispose();
    }

    // Attempt 6 with yet another spoofed prefix: because trust proxy is 1, Express correctly identifies realClientHop
    const api6 = await playwrightRequest.newContext({ baseURL: serverBaseURL });
    const limitedRes = await api6.get('/admin/auth/google', {
      headers: {
        'x-forwarded-for': `99.88.77.66, ${realClientHop}`
      },
      maxRedirects: 0
    });

    expect(limitedRes.status()).toBe(429);
    await api6.dispose();
  });

  test('7. Direct listening (TRUST_PROXY_HOPS=0): spoofed X-Forwarded-For headers do not bypass rate limit', async ({}) => {
    // Spin up an isolated test instance of the app with TRUST_PROXY_HOPS=0
    process.env.TRUST_PROXY_HOPS = '0';
    process.env.ENABLE_RATE_LIMITS = 'true';
    delete require.cache[require.resolve('../../src/app')];
    delete require.cache[require.resolve('../../src/routes/admin')];
    delete require.cache[require.resolve('../../src/routes/storefront')];
    delete require.cache[require.resolve('../../src/routes/checkout')];
    const directApp = require('../../src/app');

    const server = await new Promise((resolve) => {
      const s = directApp.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;
    const directBaseURL = `http://127.0.0.1:${port}`;

    try {
      const api = await playwrightRequest.newContext({ baseURL: directBaseURL });

      // Send 5 login requests, each with a different spoofed X-Forwarded-For header
      for (let i = 1; i <= 5; i++) {
        const res = await api.get('/admin/auth/google', {
          headers: {
            'x-forwarded-for': `198.51.100.${i}`
          },
          maxRedirects: 0
        });
        expect(res.status()).not.toBe(429);
      }

      // 6th request with yet another different X-Forwarded-For header:
      // Because TRUST_PROXY_HOPS is 0, Express ignores X-Forwarded-For and uses the socket IP (127.0.0.1).
      // The rate limiter therefore blocks the 6th attempt with 429!
      const limitedRes = await api.get('/admin/auth/google', {
        headers: {
          'x-forwarded-for': '203.0.113.99'
        },
        maxRedirects: 0
      });

      expect(limitedRes.status()).toBe(429);
      await api.dispose();
    } finally {
      await new Promise(resolve => server.close(resolve));
      delete process.env.TRUST_PROXY_HOPS;
    }
  });

  test('8. Admin OAuth callback rate limiter: returns 429 after 5 requests from the same IP (limit: 5)', async ({}, testInfo) => {
    const clientIp = testInfo.project.name === 'mobile' ? '10.99.70.2' : '10.99.70.1';
    for (let i = 1; i <= 5; i++) {
      const api = await playwrightRequest.newContext({ baseURL: serverBaseURL });
      const res = await api.get('/admin/auth/google/callback?code=fake&state=fake', {
        headers: { 'x-forwarded-for': clientIp },
        maxRedirects: 0
      });
      expect(res.status()).not.toBe(429);
      await api.dispose();
    }
    const api6 = await playwrightRequest.newContext({ baseURL: serverBaseURL });
    const limitedRes = await api6.get('/admin/auth/google/callback?code=fake&state=fake', {
      headers: { 'x-forwarded-for': clientIp },
      maxRedirects: 0
    });
    expect(limitedRes.status()).toBe(429);
    await api6.dispose();
  });
});
