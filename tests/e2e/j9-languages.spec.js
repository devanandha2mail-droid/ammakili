const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Product } = require('../helpers/db');

test.describe('J9: Bilingual support (English & Malayalam) and fallback behavior', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('toggles language to Malayalam, falls back to English when Malayalam is absent, persists across reload, and toggles back', async ({ page }) => {
    // 1. Create a product with ONLY English name to test fallback
    await Product.create({
      slug: 'english-only-nighty-' + Date.now(),
      name: { en: 'English Only Cotton Nighty', ml: '' },
      description: { en: 'Pure cotton nightwear', ml: '' },
      style: 'Cotton',
      price: 499,
      sizes: [{ size: 'M', stock: 5 }],
      active: true,
      isSample: false
    });

    // 2. Visit Shop in English (default)
    await page.goto('/shop');
    await expect(page.locator('body')).toContainText('Rose Garden Nighty');
    await expect(page.locator('body')).toContainText('English Only Cotton Nighty');

    // 3. Switch to Malayalam via header link
    const menuBtn = page.locator('#menuToggle, button[aria-label="Open menu"]');
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await expect(page.locator('a[href^="/lang/ml"]:visible').first()).toBeVisible({ timeout: 5000 });
    }
    const mlLink = page.locator('a[href^="/lang/ml"]:visible').first();
    await mlLink.click();

    // Verify URL remains or redirects back, language is now Malayalam
    await expect(page).toHaveURL(/\/shop/);

    // Header, filters and titles should update to Malayalam
    await expect(page.locator('body')).toContainText('റോസ് ഗാർഡൻ നൈറ്റി');

    // 4. Verify fallback: English Only product still renders in English without blank spaces
    await expect(page.locator('body')).toContainText('English Only Cotton Nighty');

    // 5. Choice survives a page reload
    await page.reload();
    await expect(page.locator('body')).toContainText('റോസ് ഗാർഡൻ നൈറ്റി');
    await expect(page.locator('body')).toContainText('English Only Cotton Nighty');

    // 6. Switch back to English
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await expect(page.locator('a[href^="/lang/en"]:visible').first()).toBeVisible({ timeout: 5000 });
    }
    const enLink = page.locator('a[href^="/lang/en"]:visible').first();
    await enLink.click();

    // Verify English restored
    await expect(page.locator('body')).toContainText('Rose Garden Nighty');
    await expect(page.locator('body')).not.toContainText('റോസ് ഗാർഡൻ നൈറ്റി');
  });
});

