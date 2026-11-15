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

    // 2. Login with wrong password is rejected
    await page.fill('#email', 'admin@nestammakkili.com');
    await page.fill('#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin\/login/);

    // 3. Repeated wrong login attempts are rate-limited
    let rateLimited = false;
    for (let i = 0; i < 10; i++) {
      const res = await request.post('/admin/login', {
        headers: {
          'x-forwarded-for': '192.168.2.99'
        },
        form: {
          email: 'admin@nestammakkili.com',
          password: 'IncorrectPass' + i
        }
      });
      if (res.status() === 429) {
        rateLimited = true;
        break;
      }
    }
    expect(rateLimited).toBe(true);

    // Log in with correct admin credentials via the login form
    await page.goto('/admin/login');
    await page.fill('#email', 'admin@nestammakkili.com');
    await page.fill('#password', 'AdminNest2026!');
    await Promise.all([
      page.waitForURL(/\/admin(?!\/login)/),
      page.click('button[type="submit"]')
    ]);
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

    // 9. "Delete all sample products" removes only sample items
    const samplesBefore = await Product.countDocuments({ isSample: true });
    expect(samplesBefore).toBeGreaterThan(0);

    await page.goto('/admin/products');
    page.once('dialog', dialog => dialog.accept());
    await page.click('button:has-text("Delete all sample products"), button[type="submit"]:has-text("Delete all samples")');

    const samplesAfter = await Product.countDocuments({ isSample: true });
    expect(samplesAfter).toBe(0);

    // Custom product must still exist
    const customStillExists = await Product.findById(customProd._id);
    expect(customStillExists).not.toBeNull();
  });
});

