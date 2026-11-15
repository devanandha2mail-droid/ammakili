const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Order, Product } = require('../helpers/db');

test.describe('J1: Guest purchase, happy path', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('completes full purchase journey from home to paid order confirmation', async ({ page }) => {
    // 1. Visit Home Page
    await page.goto('/');
    await expect(page).toHaveTitle(/Nest by Ammakkili/i);

    // 2. Navigate to Shop
    await page.click('nav.links a[href="/shop"], nav.ft-links a[href="/shop"], a[href="/shop"]');
    await expect(page).toHaveURL(/\/shop/);
    await expect(page.locator('h1, h2').first()).toBeVisible();

    // 3. Navigate to Product Page (Rose Garden Nighty)
    await page.goto('/product/rose-garden-nighty');
    await expect(page).toHaveTitle(/Rose Garden Nighty/i);

    // Initial stock verification for size M
    const initialProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeMInitial = initialProduct.sizes.find(s => s.size === 'M');
    expect(sizeMInitial).toBeDefined();
    const initialStock = sizeMInitial.stock;

    // 4. Choose size M (in stock)
    const sizeBtn = page.locator('.pdp-size-pill[data-size="M"], button[data-size="M"]').first();
    await sizeBtn.click();
    await expect(sizeBtn).toHaveAttribute('aria-checked', 'true');

    // 5. Add to Cart
    const addBtn = page.locator('#pdpAddToCartBtn');
    await addBtn.click();

    // Verify badge updates to 1 and is not data-zero
    const cartBadge = page.locator('#cartBadge, #cart-badge');
    await expect(cartBadge).toHaveText('1');
    await expect(cartBadge).toHaveAttribute('data-zero', 'false');

    // 6. Navigate to Cart page
    await page.goto('/cart');
    await expect(page.locator('#cart-container')).toContainText('Rose Garden Nighty');
    await expect(page.locator('#cart-container')).toContainText('Size: M');

    // 7. Proceed to Checkout
    const checkoutLink = page.locator('a[href="/checkout"]:has-text("Proceed to checkout")');
    await checkoutLink.click();
    await expect(page).toHaveURL(/\/checkout/);

    // 8. Fill delivery details
    await page.fill('#f-name', 'Anjali Nair');
    await page.fill('#f-phone', '9846012345');
    await page.fill('#f-email', 'anjali.nair@example.com');
    await page.fill('#f-addr', 'Flat 4B, Riverview Apartments, Marine Drive');
    await page.fill('#f-city', 'Kochi');
    await page.fill('#f-pin', '682031');

    // Check mandatory terms disclaimer
    await page.check('#f-ok');

    // 9. Submit Order
    await page.click('#submit-order-btn');

    // 10. Handle Razorpay Test Payment Modal
    const mockModal = page.locator('#razorpay-mock-modal');
    await expect(mockModal).toBeVisible({ timeout: 10000 });

    const upiInput = page.locator('#mock-upi-input');
    await upiInput.fill('success@razorpay');

    const payBtn = page.locator('#mock-pay-success-btn');
    await payBtn.click();

    // 11. Verify Confirmation Page
    await expect(page).toHaveURL(/\/checkout\/confirmation\/NEST-/i, { timeout: 15000 });
    const orderIdMatch = page.url().match(/NEST-\d+/);
    expect(orderIdMatch).not.toBeNull();
    const orderId = orderIdMatch[0];

    await expect(page.locator('body')).toContainText(orderId);
    await expect(page.locator('body')).toContainText('Anjali');

    // 12. Verify Database State
    const dbOrder = await Order.findOne({ orderId });
    expect(dbOrder).not.toBeNull();
    expect(dbOrder.status).toBe('paid');
    expect(dbOrder.subtotal).toBe(599);
    expect(dbOrder.shipping).toBe(60);
    expect(dbOrder.total).toBe(659);
    expect(dbOrder.customer.name).toBe('Anjali Nair');
    expect(dbOrder.customer.phone).toBe('9846012345');
    expect(dbOrder.customer.pin).toBe('682031');

    // 13. Verify Stock Dropped by Exactly 1
    const updatedProduct = await Product.findOne({ slug: 'rose-garden-nighty' });
    const sizeMUpdated = updatedProduct.sizes.find(s => s.size === 'M');
    expect(sizeMUpdated.stock).toBe(initialStock - 1);

    // 14. Verify Cart is Empty & Badge is Hidden
    await expect(cartBadge).toHaveAttribute('data-zero', 'true');

    // 15. Verify WhatsApp link details
    const waLink = page.locator('main a[href^="https://wa.me/"], .wrap a[href^="https://wa.me/"]').first();
    await expect(waLink).toBeVisible();
    const href = await waLink.getAttribute('href');
    const decodedWaUrl = decodeURIComponent(href);

    expect(decodedWaUrl).toContain(orderId);
    expect(decodedWaUrl).toContain('Rose Garden Nighty');
    expect(decodedWaUrl).toContain('659');
    expect(decodedWaUrl).toContain('Riverview Apartments');
  });
});

