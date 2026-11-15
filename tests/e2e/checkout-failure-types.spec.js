const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Product, Order } = require('../helpers/db');

test.describe('Checkout Failure Handling & Inline UI Verification (No Alerts, Button Re-enabled, Support Request ID)', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  // Helper to add product to cart and navigate to checkout
  async function setupCheckoutCart(page, size = 'M') {
    await page.goto('/product/rose-garden-nighty');
    const sizePill = page.locator(`.pdp-size-pill[data-size="${size}"], button[data-size="${size}"]`).first();
    await sizePill.click();
    await page.click('#pdpAddToCartBtn');

    await page.goto('/checkout');
    await page.fill('#f-name', 'Ananya Menon');
    await page.fill('#f-phone', '9846012345');
    await page.fill('#f-email', 'ananya.menon@example.com');
    await page.fill('#f-addr', 'Flat 4B, Marine Drive Towers');
    await page.fill('#f-city', 'Kochi');
    await page.fill('#f-pin', '682031');
    await page.check('#f-ok');
  }

  test('1. Failure Type 1: Sold out (409/400) displays inline error, re-enables button, shows requestId, and triggers no alert', async ({ page }) => {
    let alertPopped = false;
    page.on('dialog', async (dialog) => {
      alertPopped = true;
      await dialog.dismiss();
    });

    await setupCheckoutCart(page, 'M');

    // Simulate item becoming sold out right before checkout submission
    await Product.updateOne(
      { slug: 'rose-garden-nighty', 'sizes.size': 'M' },
      { $set: { 'sizes.$.stock': 0 } }
    );

    const submitBtn = page.locator('#submit-order-btn');
    await submitBtn.click();

    // 1. Verify inline error is visible
    const errBox = page.locator('#checkout-order-error');
    await expect(errBox).toBeVisible({ timeout: 10000 });
    await expect(errBox).toContainText(/sold out/i);

    // 2. Verify support reference / request id is displayed in small text
    await expect(errBox).toContainText(/support reference/i);
    await expect(errBox.locator('code')).toHaveText(/req_/);

    // 3. Verify submit button is immediately re-enabled (not stuck disabled on "SECURING ORDER...")
    await expect(submitBtn).toBeEnabled();

    // 4. Verify no window.alert dialog was shown
    expect(alertPopped).toBe(false);
  });

  test('2. Failure Type 2: Too many attempts (429) displays rate-limit message, re-enables button, and shows requestId', async ({ page }) => {
    let alertPopped = false;
    page.on('dialog', async (dialog) => {
      alertPopped = true;
      await dialog.dismiss();
    });

    await setupCheckoutCart(page, 'M');

    // Intercept /checkout/create to simulate 429 Rate Limit from server
    await page.route('**/checkout/create', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: {
          'x-request-id': 'req_rate_limit_test_123'
        },
        body: JSON.stringify({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many checkout attempts for this session. Please try again in 15 minutes.'
          },
          requestId: 'req_rate_limit_test_123'
        })
      });
    });

    const submitBtn = page.locator('#submit-order-btn');
    await submitBtn.click();

    // 1. Verify inline error displays specific rate limit text
    const errBox = page.locator('#checkout-order-error');
    await expect(errBox).toBeVisible({ timeout: 10000 });
    await expect(errBox).toContainText(/too many.*attempts/i);

    // 2. Verify support reference / requestId is rendered in small text
    await expect(errBox).toContainText(/support reference/i);
    await expect(errBox.locator('code')).toHaveText('req_rate_limit_test_123');

    // 3. Verify submit button is re-enabled
    await expect(submitBtn).toBeEnabled();

    // 4. Verify no window.alert
    expect(alertPopped).toBe(false);
  });

  test('3. Failure Type 3: Session expired (403) prompts reload to refresh token, re-enables button, and shows requestId', async ({ page }) => {
    let alertPopped = false;
    page.on('dialog', async (dialog) => {
      alertPopped = true;
      await dialog.dismiss();
    });

    await setupCheckoutCart(page, 'M');

    // Intercept /checkout/create to simulate 403 CSRF / Session expiration
    await page.route('**/checkout/create', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: {
          'x-request-id': 'req_csrf_expired_456'
        },
        body: JSON.stringify({
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Your session has expired. Please reload the page to refresh your token.'
          },
          requestId: 'req_csrf_expired_456'
        })
      });
    });

    const submitBtn = page.locator('#submit-order-btn');
    await submitBtn.click();

    // 1. Verify inline error displays reload to refresh token message
    const errBox = page.locator('#checkout-order-error');
    await expect(errBox).toBeVisible({ timeout: 10000 });
    await expect(errBox).toContainText(/your session has expired\. please reload the page to refresh your token\./i);

    // 2. Verify support reference / requestId is rendered in small text
    await expect(errBox).toContainText(/support reference/i);
    await expect(errBox.locator('code')).toHaveText('req_csrf_expired_456');

    // 3. Verify submit button is re-enabled
    await expect(submitBtn).toBeEnabled();

    // 4. Verify no window.alert
    expect(alertPopped).toBe(false);
  });

  test('4. Failure Type 4: Payment service unavailable (500/502) shows service unavailable, re-enables button, and shows requestId', async ({ page }) => {
    let alertPopped = false;
    page.on('dialog', async (dialog) => {
      alertPopped = true;
      await dialog.dismiss();
    });

    await setupCheckoutCart(page, 'M');

    // Intercept /checkout/create to simulate gateway error 502 / 500
    await page.route('**/checkout/create', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        headers: {
          'x-request-id': 'req_gateway_err_789'
        },
        body: JSON.stringify({
          error: {
            code: 'PAYMENT_SERVICE_UNAVAILABLE',
            message: 'Payment service is temporarily unavailable. Please try again in a few moments.'
          },
          requestId: 'req_gateway_err_789'
        })
      });
    });

    const submitBtn = page.locator('#submit-order-btn');
    await submitBtn.click();

    // 1. Verify inline error displays payment service unavailable message
    const errBox = page.locator('#checkout-order-error');
    await expect(errBox).toBeVisible({ timeout: 10000 });
    await expect(errBox).toContainText(/payment service is temporarily unavailable/i);

    // 2. Verify support reference / requestId is rendered in small text
    await expect(errBox).toContainText(/support reference/i);
    await expect(errBox.locator('code')).toHaveText('req_gateway_err_789');

    // 3. Verify submit button is re-enabled
    await expect(submitBtn).toBeEnabled();

    // 4. Verify no window.alert
    expect(alertPopped).toBe(false);
  });
});
