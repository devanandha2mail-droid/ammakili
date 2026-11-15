const { test, expect } = require('@playwright/test');
const { connectTestDB, disconnectTestDB, Product, Settings } = require('../helpers/db');

test.describe('Section 2.3: Empty-Store Experience vs Active Catalog', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('1. Empty store state: Home and Shop show polished placeholder, sitemap has no product URLs', async ({ page, request }) => {
    // Ensure database has zero active products
    await Product.deleteMany({});
    await Settings.deleteMany({});
    await Settings.create({
      shippingCharge: 60,
      whatsappNumber: '919876543210'
    });

    // 1. Home page when products = 0
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Nest by Ammakkili');
    await expect(page.locator('.opening-soon-wrap')).toBeVisible();
    await expect(page.locator('.opening-soon-wrap')).toContainText('Opening soon');
    // Ensure YouTube and WhatsApp links are visible in opening soon section
    await expect(page.locator('.opening-soon-wrap a[href*="youtube.com"]')).toBeVisible();
    await expect(page.locator('.opening-soon-wrap a[href*="wa.me/919876543210"]')).toBeVisible();
    // No empty/broken product cards
    await expect(page.locator('.p-card')).toHaveCount(0);

    // 2. Shop page when products = 0
    await page.goto('/shop');
    await expect(page.locator('.shop-empty-state h2')).toContainText('New designs are on the way');
    await expect(page.locator('.shop-empty-state a[href*="youtube.com"]')).toBeVisible();
    await expect(page.locator('.shop-empty-state a[href*="wa.me/919876543210"]')).toBeVisible();
    await expect(page.locator('.p-card')).toHaveCount(0);

    // 3. Sitemap has no product URLs
    const sitemapRes = await request.get('/sitemap.xml');
    expect(sitemapRes.status()).toBe(200);
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).not.toContain('/product/');
  });

  test('2. Populated store state: normal pages and sitemap appear as soon as one active product exists', async ({ page, request }) => {
    // Add one active product with 2 photos
    await Product.create({
      slug: 'malabar-cotton-nighty-launch',
      name: {
        en: 'Malabar Cotton Nighty',
        ml: 'മലബാർ കോട്ടൺ നൈറ്റി'
      },
      description: {
        en: 'Pure breathable cotton nighty with delicate neck embroidery.',
        ml: 'നല്ല കോട്ടൺ നൈറ്റി'
      },
      price: 599,
      style: 'Cotton',
      sizes: [
        { size: 'M', stock: 5 },
        { size: 'L', stock: 5 }
      ],
      photos: [
        '/img/brand/logo-full-512.png',
        '/img/brand/logo-mark-256.png'
      ],
      active: true,
      featured: true
    });

    // 1. Home page now renders product card
    await page.goto('/');
    await expect(page.locator('.opening-soon-wrap')).toHaveCount(0);
    await expect(page.locator('.p-card').first()).toBeVisible();
    await expect(page.locator('.p-card').first()).toContainText('Malabar Cotton Nighty');

    // 2. Shop page renders product card
    await page.goto('/shop');
    await expect(page.locator('h2:has-text("New designs are on the way")')).toHaveCount(0);
    await expect(page.locator('.p-card').first()).toBeVisible();
    await expect(page.locator('.p-card').first()).toContainText('Malabar Cotton Nighty');

    // 3. Sitemap contains product URL
    const sitemapRes = await request.get('/sitemap.xml');
    expect(sitemapRes.status()).toBe(200);
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).toContain('/product/malabar-cotton-nighty-launch');
  });
});
