const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Product } = require('../helpers/db');

test.describe('J10: Cart single-source-of-truth integrity, badge sync, corruption recovery, and offline fallback', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('validates badge sum, persists changes, drops deleted products, recovers from corrupt storage, and shows retry when offline', async ({ page, context }) => {
    const cartBadge = page.locator('#cartBadge, #cart-badge');

    // 1. Initial State: Empty cart, badge is hidden
    await page.goto('/');
    await expect(cartBadge).toHaveAttribute('data-zero', 'true');

    // 2. Add Rose Garden Nighty (size M, qty 1)
    await page.goto('/product/rose-garden-nighty');
    await page.locator('.pdp-size-pill[data-size="M"], button[data-size="M"]').first().click();
    await page.click('#pdpAddToCartBtn');
    await expect(cartBadge).toHaveText('1');

    // 3. Open Cart, increase quantity using + button
    await page.goto('/cart');
    await expect(page.locator('#cart-container')).toContainText('Rose Garden Nighty');
    const plusBtn = page.locator('.qty button[aria-label="Increase quantity"]');
    await plusBtn.click();
    await expect(page.locator('.qty span')).toHaveText('2');
    await expect(cartBadge).toHaveText('2');

    // 4. Add second product: Blush Cotton Nighty (size L, qty 1)
    await page.goto('/product/blush-cotton-nighty');
    await page.locator('.pdp-size-pill[data-size="L"], button[data-size="L"]').first().click();
    await page.click('#pdpAddToCartBtn');
    // Total badge sum is 2 + 1 = 3
    await expect(cartBadge).toHaveText('3');

    // 5. Reload cart page: state and quantities persist
    await page.goto('/cart');
    await expect(cartBadge).toHaveText('3');
    await expect(page.locator('#cart-container')).toContainText('Rose Garden Nighty');
    await expect(page.locator('#cart-container')).toContainText('Blush Cotton Nighty');

    // 6. Remove Blush Cotton Nighty
    const removeBtns = page.locator('button:has-text("Remove")');
    await removeBtns.last().click();
    await expect(cartBadge).toHaveText('2');

    // 7. Admin deletes Rose Garden Nighty from database
    await Product.deleteOne({ slug: 'rose-garden-nighty' });

    // Reload cart: server validation drops the deleted product and notifies user
    await page.reload();
    await expect(cartBadge).toHaveAttribute('data-zero', 'true');
    const toast = page.locator('#toast');
    await expect(toast).toContainText(/(no longer available|removed)/i);

    // 8. Corrupt localStorage cart by hand
    await page.evaluate(() => {
      localStorage.setItem('nest_cart', 'MALFORMED_JSON_%%%{{{');
    });
    // Reload: must recover without unhandled JavaScript exceptions
    await page.reload();
    await expect(page.locator('#cart-container')).toContainText(/Your cart is empty/i);

    // 9. Go Offline: Mock network failure on POST /cart/validate
    // Add an item to cart in storage first
    const blush = await Product.findOne({ slug: 'blush-cotton-nighty' });
    await page.evaluate(({ prodId }) => {
      localStorage.setItem('nest_cart', JSON.stringify([{ productId: prodId, size: 'M', qty: 1 }]));
    }, { prodId: String(blush._id) });

    // Abort network request to simulate offline
    await page.route('**/cart/validate', route => route.abort());

    await page.reload();
    // Must show "We could not load your cart" with a retry button, NEVER "Your cart is empty"
    await expect(page.locator('#cart-container')).toContainText(/could not load your cart/i);
    await expect(page.locator('#cart-container')).not.toContainText(/Your cart is empty/i);
    await expect(page.locator('#cart-container button:has-text("Try again")')).toBeVisible();
  });
});

