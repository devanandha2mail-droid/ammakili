const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Customer, Order, Product } = require('../helpers/db');

test.describe('J6: Customer account features, security boundaries, and lifecycle', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('signs in, saves address, prefills checkout, checks orders, syncs wishlist, isolates admin, and deletes account', async ({ page }) => {
    const testEmail = 'priya.test.' + Date.now() + '@example.com';

    // 1. Sign in via test-only login route
    await page.goto('/');
    const loginRes = await page.request.post('/__test/login', {
      form: {
        email: testEmail,
        name: 'Priya Menon',
        phone: '9846055555'
      }
    });
    expect(loginRes.status()).toBe(200);

    // Fetch session cookies into page
    await page.goto('/account');
    await expect(page).toHaveURL(/\/account/);
    await expect(page.locator('body')).toContainText('Priya Menon');

    // 2. Add an address via account form
    await page.goto('/account?tab=addresses');
    await page.fill('input[name="label"]', 'Work');
    await page.fill('input[name="name"]', 'Priya Menon');
    await page.fill('input[name="phone"]', '9846055555');
    await page.fill('textarea[name="address"]', 'Infopark Phase 2, Smart City');
    await page.fill('input[name="city"]', 'Kochi');
    await page.fill('input[name="pin"]', '682042');
    await page.click('button:has-text("Save address"), button[type="submit"]:has-text("Save")');

    // Verify address is in DB
    const cust = await Customer.findOne({ email: testEmail });
    expect(cust).not.toBeNull();
    expect(cust.addresses.length).toBeGreaterThan(0);

    // 3. Put an item in cart and go to checkout
    await page.goto('/product/rose-garden-nighty');
    await page.locator('.pdp-size-pill[data-size="M"], button[data-size="M"]').first().click();
    await page.click('#pdpAddToCartBtn');

    await page.goto('/checkout');
    // Name and email should be prefilled
    await expect(page.locator('#f-name')).toHaveValue('Priya Menon');
    await expect(page.locator('#f-email')).toHaveValue(testEmail);

    // Address selector should exist and contain saved address
    const addressSelect = page.locator('#address-selector');
    if (await addressSelect.isVisible()) {
      await expect(addressSelect).toContainText('Kochi');
    }

    // 4. Place order
    await page.fill('#f-addr', 'Infopark Phase 2, Smart City');
    await page.fill('#f-city', 'Kochi');
    await page.fill('#f-pin', '682042');
    await page.check('#f-ok');
    await page.click('#submit-order-btn');

    // Complete mock payment
    await expect(page.locator('#razorpay-mock-modal')).toBeVisible({ timeout: 10000 });
    await page.locator('#mock-pay-success-btn').click();
    await expect(page).toHaveURL(/\/checkout\/confirmation\/NEST-/i, { timeout: 15000 });

    const orderId = page.url().match(/NEST-\d+/)[0];

    // Verify order in customer order history
    await page.goto('/account?tab=orders');
    await expect(page.locator('body')).toContainText(orderId);

    // 5. Sync Wishlist
    await page.goto('/wishlist');
    const syncRes = await page.request.post('/account/wishlist/sync', {
      data: {
        items: ['rose-garden-nighty', 'blush-cotton-nighty']
      }
    });
    expect(syncRes.status()).toBe(200);

    const prod = await Product.findOne({ slug: 'rose-garden-nighty' });
    const custWithWish = await Customer.findOne({ email: testEmail });
    expect(custWithWish.wishlist.map(id => id.toString())).toContain(String(prod._id));

    // 6. Security Boundary: Customer session CANNOT open /admin
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);

    // 7. Security: returnTo open redirect prevention
    const evil1 = await page.request.post('/__test/login', {
      form: { email: testEmail, returnTo: 'https://evil.example.com' },
      maxRedirects: 0
    });
    const loc1 = evil1.headers()['location'];
    expect(loc1).toBe('/account');

    const evil2 = await page.request.post('/__test/login', {
      form: { email: testEmail, returnTo: '//evil.example.com' },
      maxRedirects: 0
    });
    const loc2 = evil2.headers()['location'];
    expect(loc2).toBe('/account');

    // 8. Delete Account
    await page.goto('/account?tab=profile');
    // Post directly to account delete
    const delRes = await page.request.post('/account/delete');
    expect(delRes.status()).toBe(200);

    // Verify profile removed from DB
    const deletedCust = await Customer.findOne({ email: testEmail });
    expect(deletedCust).toBeNull();

    // Verify order is detached (not deleted)
    const detachedOrder = await Order.findOne({ orderId });
    expect(detachedOrder).not.toBeNull();
    expect(detachedOrder.customerId).toBeNull();
  });
});

