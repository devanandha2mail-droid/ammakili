const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Order, Product } = require('../helpers/db');

test.describe('J2: Payment failure and retry', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('handles failed payment, preserves stock and cart, and allows retry', async ({ page }) => {
    // 1. Add product to cart
    await page.goto('/product/rose-garden-nighty');
    const initialProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeMInitial = initialProduct.sizes.find(s => s.size === 'M');
    const initialStock = sizeMInitial.stock;

    const sizeBtn = page.locator('.pdp-size-pill[data-size="M"], button[data-size="M"]').first();
    await sizeBtn.click();
    await page.click('#pdpAddToCartBtn');

    // 2. Go to checkout
    await page.goto('/checkout');
    await page.fill('#f-name', 'Rohit Varma');
    await page.fill('#f-phone', '9847054321');
    await page.fill('#f-email', 'rohit.varma@example.com');
    await page.fill('#f-addr', 'House No 12, Lake View Road');
    await page.fill('#f-city', 'Kozhikode');
    await page.fill('#f-pin', '673001');
    await page.check('#f-ok');

    // 3. Submit Order
    await page.click('#submit-order-btn');

    // 4. Modal opens
    const mockModal = page.locator('#razorpay-mock-modal');
    await expect(mockModal).toBeVisible({ timeout: 10000 });

    // 5. Simulate UPI Failure with failure@razorpay
    const upiInput = page.locator('#mock-upi-input');
    await upiInput.fill('failure@razorpay');

    const payBtn = page.locator('#mock-pay-success-btn');
    await payBtn.click();

    // 6. Verify modal closes and failure UI is surfaced
    await expect(mockModal).toBeHidden();
    const submitBtn = page.locator('#submit-order-btn');
    await expect(submitBtn).toBeEnabled();
    await expect(submitBtn).toContainText(/try again/i);

    // 7. Verify Order state in DB
    const latestOrder = await Order.findOne({ 'customer.phone': '9847054321' }).sort({ createdAt: -1 });
    expect(latestOrder).not.toBeNull();
    expect(latestOrder.status).toBe('failed');

    // 8. Verify stock is completely unchanged
    const currentProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const currentSizeM = currentProduct.sizes.find(s => s.size === 'M');
    expect(currentSizeM.stock).toBe(initialStock);

    // 9. Verify Cart is preserved in browser and header badge is still visible
    const cartBadge = page.locator('#cartBadge, #cart-badge');
    await expect(cartBadge).toHaveText('1');
    await expect(cartBadge).toHaveAttribute('data-zero', 'false');

    // 10. Verify customer can retry payment
    await expect(submitBtn).toBeEnabled();
  });
});

