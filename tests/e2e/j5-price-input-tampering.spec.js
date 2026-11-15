const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Product } = require('../helpers/db');

test.describe('J5: Price and input tampering resistance', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('rejects tampered quantities, invalid sizes, sold out stock, and recalculates server-authoritative prices', async ({ page }) => {
    // 1. Visit checkout to get CSRF token and session cookies
    await page.goto('/checkout');
    const csrfToken = await page.locator('meta[name="csrf-token"]').getAttribute('content');
    expect(csrfToken).toBeTruthy();

    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    expect(product).not.toBeNull();

    const baseCustomer = {
      name: 'Tamper Tester',
      phone: '9846012345',
      address: 'Test Address Line 1',
      city: 'Thrissur',
      pin: '680001'
    };

    // Helper to send POST /checkout/create through page context to retain cookies & headers
    async function postCheckoutCreate(payload) {
      return page.evaluate(async ({ payload, csrfToken }) => {
        const res = await fetch('/checkout/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        return { status: res.status, data };
      }, { payload, csrfToken });
    }

    // A. Price Tampering: Client claims price is ₹1 instead of ₹599
    const tamperPriceResult = await postCheckoutCreate({
      items: [{
        productId: String(product._id),
        size: 'M',
        qty: 1,
        price: 1 // Attempted tampering
      }],
      customer: baseCustomer,
      agreeNoReturns: true
    });

    expect(tamperPriceResult.status).toBe(200);
    // Server must ignore ₹1 and calculate 599 + 60 shipping = ₹659 (65900 paise)
    expect(tamperPriceResult.data.amount).toBe(65900);

    // B. Quantity = 0: must be rejected with 400
    const zeroQtyResult = await postCheckoutCreate({
      items: [{
        productId: String(product._id),
        size: 'M',
        qty: 0
      }],
      customer: baseCustomer,
      agreeNoReturns: true
    });
    expect(zeroQtyResult.status).toBe(400);

    // C. Quantity = -1: must be rejected with 400
    const negQtyResult = await postCheckoutCreate({
      items: [{
        productId: String(product._id),
        size: 'M',
        qty: -1
      }],
      customer: baseCustomer,
      agreeNoReturns: true
    });
    expect(negQtyResult.status).toBe(400);

    // D. Quantity = 999: exceeds stock, must be rejected with 400
    const hugeQtyResult = await postCheckoutCreate({
      items: [{
        productId: String(product._id),
        size: 'M',
        qty: 999
      }],
      customer: baseCustomer,
      agreeNoReturns: true
    });
    expect(hugeQtyResult.status).toBe(400);
    expect(hugeQtyResult.data.error).toMatch(/Insufficient stock/i);

    // E. Inactive product: must be rejected with 400
    const inactiveProd = await Product.create({
      slug: 'inactive-test-nighty-' + Date.now(),
      name: { en: 'Inactive Nighty', ml: '' },
      description: { en: 'Test description', ml: '' },
      style: 'Cotton',
      price: 499,
      sizes: [{ size: 'M', stock: 10 }],
      active: false
    });

    const inactiveResult = await postCheckoutCreate({
      items: [{
        productId: String(inactiveProd._id),
        size: 'M',
        qty: 1
      }],
      customer: baseCustomer,
      agreeNoReturns: true
    });
    expect(inactiveResult.status).toBe(400);
    expect(inactiveResult.data.error).toMatch(/no longer available/i);

    // F. Missing size: must be rejected with 400
    const missingSizeResult = await postCheckoutCreate({
      items: [{
        productId: String(product._id),
        size: '',
        qty: 1
      }],
      customer: baseCustomer,
      agreeNoReturns: true
    });
    expect(missingSizeResult.status).toBe(400);
    expect(missingSizeResult.data.error).toMatch(/select a size/i);

    // G. Sold out size (3XL has stock 0 in seeded data): must be rejected with 400
    const soldOutResult = await postCheckoutCreate({
      items: [{
        productId: String(product._id),
        size: '3XL',
        qty: 1
      }],
      customer: baseCustomer,
      agreeNoReturns: true
    });
    expect(soldOutResult.status).toBe(400);
    expect(soldOutResult.data.error).toMatch(/Insufficient stock/i);
  });
});

