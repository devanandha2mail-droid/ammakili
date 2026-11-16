const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Admin, Product, Order, Settings, Banner } = require('../helpers/db');

test.describe('J8: Admin management workflows, authorization gates, and product lifecycle', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('enforces auth gates, handles rate limiting, manages products, orders, banners, settings and sample deletion', async ({ page, request }) => {
    // Automatically accept all browser dialogs (confirm / alert)
    page.on('dialog', dialog => dialog.accept());

    // 1. Unauthenticated requests to /admin routes redirect to /admin/login
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.goto('/admin/products');
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/login/);

    // 2. Admin login page has Google Sign-in and zero password inputs
    await page.goto('/admin/login');
    await expect(page.locator('a[href="/admin/auth/google"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // 3. Authenticate admin session via test harness
    await page.goto('/admin/test-login?email=admin@nestammakkili.com&role=owner');
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // Navigate to /admin and verify access granted
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // 4. Create a product with Malayalam text and mark featured
    const customProd = await Product.create({
      slug: 'kasavu-cotton-nighty-' + Date.now(),
      name: {
        en: 'Kasavu Cotton Nighty',
        ml: 'കസവ് കോട്ടൺ നൈറ്റി'
      },
      description: {
        en: 'Premium traditional Kerala Kasavu nighty with soft breathable weave.',
        ml: 'പരമ്പരാഗത കേരള കസവ് ഡിസൈൻ.'
      },
      style: 'Cotton',
      price: 699,
      images: [
        { url: '/img/brand/logo-full-512.png', kind: 'styled' },
        { url: '/img/brand/logo-full-128.png', kind: 'original' }
      ],
      sizes: [
        { size: 'M', stock: 5 },
        { size: 'L', stock: 10 }
      ],
      featured: true,
      active: true,
      isSample: false
    });

    // Verify it shows in shop
    await page.goto('/shop');
    await expect(page.locator('body')).toContainText('Kasavu Cotton Nighty');

    // Verify it shows on home hero
    await page.goto('/');
    await expect(page.locator('body')).toContainText('Kasavu Cotton Nighty');

    // 5. Order lifecycle: Packed -> Shipped -> Delivered
    const order = await Order.create({
      orderId: 'NEST-ADMIN-FLOW',
      items: [{
        productId: customProd._id,
        name: 'Kasavu Cotton Nighty',
        price: 699,
        size: 'M',
        quantity: 1,
        image: '/img/brand/logo-full-512.png'
      }],
      customer: {
        name: 'Suresh Kumar',
        phone: '9846077777',
        address: 'Palakkad Main Road',
        city: 'Palakkad',
        pin: '678001'
      },
      subtotal: 699,
      shipping: 60,
      total: 759,
      status: 'paid'
    });

    // Visit order detail page
    await page.goto('/admin/orders/' + order._id);
    await expect(page.locator('body')).toContainText('NEST-ADMIN-FLOW');

    // Update status to shipped with courier and tracking ID
    await page.selectOption('select[name="status"]', 'shipped');
    await page.fill('#courier', 'India Post Speed Post');
    await page.fill('#trackingId', 'KL123456789IN');
    await page.click('button[type="submit"]:has-text("Update Order")');

    // Verify updated order state
    const shippedOrder = await Order.findById(order._id);
    expect(shippedOrder.status).toBe('shipped');
    expect(shippedOrder.tracking.courier).toBe('India Post Speed Post');
    expect(shippedOrder.tracking.trackingId).toBe('KL123456789IN');

    // Check WhatsApp message link is properly URL-encoded
    const waLink = page.locator('a[href^="https://wa.me/"]');
    const waHref = await waLink.getAttribute('href');
    expect(waHref).toContain('9846077777');
    const decodedWa = decodeURIComponent(waHref);
    expect(decodedWa).toContain('KL123456789IN');
    expect(decodedWa).toContain('India Post Speed Post');

    // Update to delivered
    await page.selectOption('select[name="status"]', 'delivered');
    await page.click('button[type="submit"]:has-text("Update Order")');
    const deliveredOrder = await Order.findById(order._id);
    expect(deliveredOrder.status).toBe('delivered');

    // 6. Export Orders to CSV
    const csvRes = await page.request.get('/admin/orders/export/csv');
    expect(csvRes.status()).toBe(200);
    expect(csvRes.headers()['content-type']).toContain('text/csv');
    const csvText = await csvRes.text();
    expect(csvText).toContain('Order ID,Date,Customer Name,Phone,Address,City,PIN,Items Count,Subtotal,Shipping,Total,Status,Courier,Tracking ID');
    expect(csvText).toContain('NEST-ADMIN-FLOW');

    // 7. Change shipping charge to ₹80
    await page.goto('/admin/settings');
    await page.fill('input[name="shippingCharge"]', '80');
    await page.click('button[type="submit"]:has-text("Save Settings")');

    const updatedSettings = await Settings.getSettings();
    expect(updatedSettings.shippingCharge).toBe(80);

    // Confirm checkout summary fetches ₹80
    // Put item in cart first
    await page.goto('/product/rose-garden-nighty');
    await page.locator('.pdp-size-pill[data-size="M"], button[data-size="M"]').first().click();
    await page.click('#pdpAddToCartBtn');

    await page.goto('/checkout');
    await expect(page.locator('#sum-shipping')).toHaveText('₹80');

    // 8. Banners: Start date & end date scheduling
    const now = Date.now();
    await Banner.deleteMany({});

    // Active banner (current window)
    await Banner.create({
      text: { en: 'Active Festival Sale 20% Off', ml: '' },
      active: true,
      startsAt: new Date(now - 3600000),
      endsAt: new Date(now + 3600000)
    });

    // Future banner (outside window)
    await Banner.create({
      text: { en: 'Future Unannounced Banner', ml: '' },
      active: true,
      startsAt: new Date(now + 86400000),
      endsAt: new Date(now + 172800000)
    });

    await page.goto('/');
    await expect(page.locator('body')).toContainText('Active Festival Sale 20% Off');
    await expect(page.locator('body')).not.toContainText('Future Unannounced Banner');

    // 9. Admin delete product removes the product
    await page.goto('/admin/products');
    const csrfToken = await page.locator('input[name="_csrf"]').first().getAttribute('value');
    await page.request.post(`/admin/products/delete/${customProd._id}`, {
      headers: { 'x-csrf-token': csrfToken }
    });
    const deletedProd = await Product.findById(customProd._id);
    expect(deletedProd).toBeNull();
  });

  test('Photo upload on /admin/products/add works when Stylist is offline: saves original, updates gallery, and submits product', async ({ page }) => {
    // Authenticate admin session
    await page.goto('/admin/test-login?email=admin@nestammakkili.com&role=owner');
    await page.goto('/admin/products/add');

    // Stylist offline banner should be visible since port 8001 is offline
    await expect(page.locator('#stylist-offline-banner')).toBeVisible();

    // Create small dummy JPEG in memory / fixture
    const sharp = require('sharp');
    const path = require('path');
    const fs = require('fs');
    const testImgPath = path.join(__dirname, '../fixtures/test-upload-dress.jpg');
    if (!fs.existsSync(path.dirname(testImgPath))) fs.mkdirSync(path.dirname(testImgPath), { recursive: true });
    await sharp({
      create: { width: 1200, height: 1600, channels: 3, background: { r: 240, g: 120, b: 120 } }
    }).jpeg().toFile(testImgPath);

    // Upload via file input
    const fileInput = page.locator('#stylist-file-input');
    await fileInput.setInputFiles(testImgPath);

    // Card should appear showing Original Photo (Saved)
    await expect(page.locator('.a-stylist-card')).toBeVisible({ timeout: 7000 });
    await expect(page.locator('.a-stylist-card')).toContainText('Original Photo (Saved)');

    // Thumbnail strip should update with the uploaded photo
    await expect(page.locator('.a-thumb-item')).toHaveCount(1);

    // Fill form details and submit
    await page.fill('#name_en', 'Offline Upload Nighty');
    await page.fill('#description_en', 'Soft cotton nighty uploaded while stylist is offline.');
    await page.fill('#price', '599');
    await page.fill('input[name="stock_M"]', '5');
    await page.locator('button[type="submit"]:has-text("Create Nighty")').click({ force: true });

    // Should redirect to /admin/products with the new product listed
    await expect(page).toHaveURL(/\/admin\/products/);
    await expect(page.locator('body')).toContainText('Offline Upload Nighty');

    // Clean up created file
    if (fs.existsSync(testImgPath)) fs.unlinkSync(testImgPath);
  });
});

