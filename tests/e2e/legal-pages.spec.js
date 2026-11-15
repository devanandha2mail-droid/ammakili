const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase } = require('../helpers/db');
const Settings = require('../../src/models/Settings');

test.describe('Section 3: Settings & 8 Public Legal Pages Verification', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  const legalUrls = [
    '/about',
    '/contact',
    '/pricing',
    '/shipping',
    '/terms',
    '/privacy',
    '/refund-policy',
    '/grievance'
  ];

  test('1. Every one of the eight URLs returns 200, contains trade name, contact email, and grievance officer name', async ({ page }) => {
    const settings = await Settings.getSettings();
    const tradeName = settings.tradeName;
    const contactEmail = settings.contactEmail;
    const officerName = settings.grievanceOfficer.name;

    expect(tradeName).toBeTruthy();
    expect(contactEmail).toBeTruthy();
    expect(officerName).toBeTruthy();

    for (const url of legalUrls) {
      const response = await page.goto(url);
      expect(response.status(), `Expected 200 for ${url}`).toBe(200);

      const content = await page.content();
      expect(content, `${url} must contain trade name "${tradeName}"`).toContain(tradeName);
      expect(content, `${url} must contain contact email "${contactEmail}"`).toContain(contactEmail);
      expect(content, `${url} must contain grievance officer "${officerName}"`).toContain(officerName);
    }
  });

  test('2. Legal pages switch language with language picker and display Malayalam text', async ({ page }) => {
    // Switch to Malayalam via language route
    await page.goto('/set-lang/ml?returnTo=/shipping');
    await expect(page).toHaveURL(/\/shipping/);

    // Verify Malayalam translation rendered
    await expect(page.locator('h2')).toContainText('ഷിപ്പിംഗ് & ഡെലിവറി വിവരങ്ങൾ');
    await expect(page.locator('body')).toContainText('ഷിപ്പിംഗ് നിരക്ക്');

    // Switch back to English
    await page.goto('/set-lang/en?returnTo=/shipping');
    await expect(page).toHaveURL(/\/shipping/);
    await expect(page.locator('h2')).toContainText('Shipping & Delivery Policy');
    await expect(page.locator('body')).toContainText('Flat ₹60 Shipping Storewide');
  });

  test('3. Warning banner appears for logged-in admin only when unconfirmed, and disappears once confirmed', async ({ browser }) => {
    // Ensure settings has legalPagesConfirmed = false
    await Settings.updateOne({}, { legalPagesConfirmed: false, legalPagesConfirmedAt: null, legalPagesConfirmedBy: null });

    // 1. Anonymous visitor does NOT see the warning banner
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto('/terms');
    await expect(anonPage.locator('.admin-template-warning')).toHaveCount(0);
    await anonContext.close();

    // 2. Admin logs in
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/admin/test-login?email=owner@nestammakkili.com&role=owner');
    await expect(adminPage).toHaveURL(/\/admin(?!\/login)/);

    // Admin visits /terms -> Warning banner is visible
    await adminPage.goto('/terms');
    await expect(adminPage.locator('.admin-template-warning')).toBeVisible();
    await expect(adminPage.locator('.admin-template-warning')).toContainText("Template text: replace with the client's approved wording");

    // 3. Admin confirms legal pages in Settings
    await adminPage.goto('/admin/settings');
    const csrfToken = await adminPage.locator('input[name="_csrf"]').first().getAttribute('value');
    await adminPage.request.post('/admin/settings', {
      headers: { 'x-csrf-token': csrfToken },
      form: {
        legalBusinessName: 'Nest by Ammakkili Apparel Private Limited',
        tradeName: 'Nest by Ammakkili',
        registeredAddress: 'Building 4B, Palace Road, Thrissur, Kerala - 680001',
        operatingAddress: 'Building 4B, Palace Road, Thrissur, Kerala - 680001',
        contactEmail: 'care@nestammakkili.com',
        contactPhone: '+91 98460 12345',
        whatsappNumber: '919846012345',
        businessHours: 'Monday to Saturday, 9:00 AM – 6:00 PM IST',
        grievanceOfficerName: 'Devanandha K. M.',
        grievanceOfficerDesignation: 'Grievance Redressal Officer',
        grievanceOfficerEmail: 'grievance@nestammakkili.com',
        grievanceOfficerPhone: '+91 98460 12345',
        shippingCharge: '60',
        minDeliveryDays: '3',
        maxDeliveryDays: '7',
        refundTimelineDays: '7',
        legalPagesConfirmed: 'true'
      }
    });

    // Verify Settings document updated with timestamp and admin email
    const updatedSettings = await Settings.getSettings();
    expect(updatedSettings.legalPagesConfirmed).toBe(true);
    expect(updatedSettings.legalPagesConfirmedAt).not.toBeNull();
    expect(updatedSettings.legalPagesConfirmedBy).toBe('owner@nestammakkili.com');

    // Admin visits /terms again -> Warning banner is gone!
    await adminPage.goto('/terms');
    await expect(adminPage.locator('.admin-template-warning')).toHaveCount(0);

    await adminContext.close();
  });

  test('4. Site footer links all eight legal pages and checkout links relevant legal pages', async ({ page }) => {
    await page.goto('/');

    const footer = page.locator('footer.site-footer');
    for (const url of legalUrls) {
      await expect(footer.locator(`a[href="${url}"]`), `Footer must link ${url}`).toBeVisible();
    }

    // Checkout page links terms, refund-policy, privacy, shipping
    await page.goto('/checkout');
    const checkoutContent = await page.content();
    expect(checkoutContent).toContain('href="/terms"');
    expect(checkoutContent).toContain('href="/refund-policy"');
    expect(checkoutContent).toContain('href="/privacy"');
    expect(checkoutContent).toContain('href="/shipping"');
  });
});

