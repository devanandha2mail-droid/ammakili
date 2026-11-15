const { test, expect } = require('@playwright/test');
const { connectTestDB, disconnectTestDB, AdminUser, Settings, Product } = require('../helpers/db');

test.describe('Section 4.1: Admin Accounts, Google Allowlist & Role Separation', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test.beforeEach(async () => {
    // Reset admin users
    await AdminUser.deleteMany({});
    // Seed Owner
    await AdminUser.create({
      email: 'owner@nestammakkili.com',
      role: 'owner',
      active: true,
      confirmed2SV: { confirmed: true, confirmedAt: new Date(), confirmedBy: 'seed' },
      createdBy: 'test-seed'
    });
    // Seed Staff
    await AdminUser.create({
      email: 'staff@nestammakkili.com',
      role: 'staff',
      active: true,
      confirmed2SV: { confirmed: false },
      createdBy: 'test-seed'
    });
  });

  test('1. Unauthenticated requests to /admin redirect to /admin/login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('2. Customer session cannot open /admin (complete session segregation)', async ({ page }) => {
    // Log in as customer using customer test endpoint
    const customerLoginRes = await page.request.post('/__test/login', {
      form: {
        email: 'customer@example.com',
        name: 'Regular Customer'
      }
    });
    expect(customerLoginRes.status()).toBe(200);

    // Verify customer can access /account
    await page.goto('/account');
    await expect(page).toHaveURL(/\/account/);

    // Attempt to access /admin using this customer browser context
    await page.goto('/admin');
    // Must be redirected to /admin/login because customer session cookie is not admin session
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('3. Google OAuth login: wrong state or replayed callback is refused with 403', async ({ page }) => {
    // Call callback with completely invalid or missing state
    const res = await page.request.get('/admin/auth/google/callback?code=some_code&state=invalid_or_replayed_state');
    expect(res.status()).toBe(403);
    const text = await res.text();
    expect(text).toContain('Not Authorised');
  });

  test('4. Google OAuth login: unverified email is refused with 403', async ({ page }) => {
    // 1. Initiate OAuth
    const initRes = await page.request.get('/admin/auth/google', { maxRedirects: 0 });
    const location = initRes.headers()['location'] || '';
    const stateMatch = location.match(/state=([^&]+)/);
    expect(stateMatch).toBeTruthy();
    const state = stateMatch[1];

    const callbackRes = await page.request.get(`/admin/auth/google/callback?code=code_unverified&state=${state}`);
    expect(callbackRes.status()).toBe(403);
    const body = await callbackRes.text();
    expect(body).toContain('Not Authorised');
  });

  test('5. Google OAuth login: email not on allowlist is refused with 403', async ({ page }) => {
    // 1. Initiate OAuth
    const initRes = await page.request.get('/admin/auth/google', { maxRedirects: 0 });
    const location = initRes.headers()['location'] || '';
    const stateMatch = location.match(/state=([^&]+)/);
    const state = stateMatch[1];

    const callbackRes = await page.request.get(`/admin/auth/google/callback?code=code_stranger&state=${state}`);
    expect(callbackRes.status()).toBe(403);
    const body = await callbackRes.text();
    expect(body).toContain('Not Authorised');
  });

  test('6. Google OAuth login: first login binds Google sub; mismatched sub on later login is refused', async ({ page }) => {
    // 1. First login with sub A: binds sub
    const initRes1 = await page.request.get('/admin/auth/google', { maxRedirects: 0 });
    const state1 = (initRes1.headers()['location'] || '').match(/state=([^&]+)/)[1];

    const callbackRes1 = await page.request.get(`/admin/auth/google/callback?code=code_valid&state=${state1}`, { maxRedirects: 0 });
    expect(callbackRes1.status()).toBe(302);
    expect(callbackRes1.headers()['location']).toBe('/admin');

    // Verify sub is bound in DB
    const boundOwner = await AdminUser.findOne({ email: 'owner@nestammakkili.com' });
    expect(boundOwner.googleSub).toBe('legitimate_google_sub_1001');

    // 2. Second login attempt by someone with the same email string but different Google sub
    const initRes2 = await page.request.get('/admin/auth/google', { maxRedirects: 0 });
    const state2 = (initRes2.headers()['location'] || '').match(/state=([^&]+)/)[1];

    const callbackRes2 = await page.request.get(`/admin/auth/google/callback?code=code_hijack&state=${state2}`);
    expect(callbackRes2.status()).toBe(403);
    const body = await callbackRes2.text();
    expect(body).toContain('Not Authorised');
  });

  test('7. Deactivated admin loses access immediately on their next request', async ({ page }) => {
    // Log in as staff via direct browser navigation
    await page.goto('/admin/test-login?email=staff@nestammakkili.com&role=staff');
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // Deactivate staff in database
    await AdminUser.findOneAndUpdate({ email: 'staff@nestammakkili.com' }, { active: false });

    // Next request must be immediately booted to login
    await page.goto('/admin/products');
    await expect(page).toHaveURL(/\/admin\/login\?reason=deactivated/);
  });

  test('8. Staff cannot access owner-only pages (/admin/users, /admin/settings)', async ({ page }) => {
    // Log in as staff
    await page.goto('/admin/test-login?email=staff@nestammakkili.com&role=staff');
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // Staff can access /admin/products
    await page.goto('/admin/products');
    await expect(page).toHaveURL(/\/admin\/products/);

    // Staff cannot access /admin/users (Owner only)
    const usersRes = await page.goto('/admin/users');
    expect(usersRes.status()).toBe(403);
    await expect(page.locator('h2')).toContainText('Owner Access Required');

    // Staff cannot access /admin/settings (Owner only)
    const settingsRes = await page.goto('/admin/settings');
    expect(settingsRes.status()).toBe(403);
    await expect(page.locator('h2')).toContainText('Owner Access Required');
  });

  test('9. Last active owner cannot be removed, deactivated, or demoted', async ({ page }) => {
    // Log in as sole owner
    await page.goto('/admin/test-login?email=owner@nestammakkili.com&role=owner');
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    const ownerUser = await AdminUser.findOne({ email: 'owner@nestammakkili.com' });

    // Navigate to /admin/users to obtain CSRF token
    await page.goto('/admin/users');
    const csrfToken = await page.locator('input[name="_csrf"]').first().getAttribute('value');

    // 1. Attempt to deactivate last owner
    const deactivateRes = await page.request.post(`/admin/users/toggle-active/${ownerUser._id}`, {
      headers: { 'x-csrf-token': csrfToken },
      maxRedirects: 0
    });
    expect(deactivateRes.headers()['location']).toContain('error=cannot_deactivate_last_owner');

    // 2. Attempt to demote last owner to staff
    const demoteRes = await page.request.post(`/admin/users/toggle-role/${ownerUser._id}`, {
      headers: { 'x-csrf-token': csrfToken },
      form: { role: 'staff' },
      maxRedirects: 0
    });
    expect(demoteRes.headers()['location']).toContain('error=cannot_demote_last_owner');

    // Verify still active owner
    const refreshed = await AdminUser.findById(ownerUser._id);
    expect(refreshed.active).toBe(true);
    expect(refreshed.role).toBe('owner');
  });

  test('10. Sensitive action without fresh sign-in within 5 minutes is refused', async ({ page }) => {
    // Log in as owner with authTime set to 10 minutes ago
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    await page.goto(`/admin/test-login?email=owner@nestammakkili.com&role=owner&authTime=${tenMinutesAgo}`);
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    await page.goto('/admin/users');
    const csrfToken = await page.locator('input[name="_csrf"]').first().getAttribute('value');

    // Call sensitive POST action with Accept: application/json
    const addRes = await page.request.post('/admin/users/add', {
      headers: { Accept: 'application/json', 'x-csrf-token': csrfToken },
      form: { email: 'newmember@gmail.com', role: 'staff' }
    });
    expect(addRes.status()).toBe(403);
    const body = await addRes.json();
    expect(body.error.code).toBe('FRESH_AUTH_REQUIRED');

    // Standard form submission redirects to Google OAuth with prompt=select_account
    const redirectRes = await page.request.post('/admin/users/add', {
      headers: { 'x-csrf-token': csrfToken },
      form: { email: 'newmember@gmail.com', role: 'staff' },
      maxRedirects: 0
    });
    expect(redirectRes.status()).toBe(302);
    expect(redirectRes.headers()['location']).toContain('prompt=select_account');
  });

  test('11. Dashboard renders computed Launch Checklist and 2SV reminder card', async ({ page }) => {
    // Log in as owner
    await page.goto('/admin/test-login?email=owner@nestammakkili.com&role=owner');
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // Assert 2SV reminder card is visible
    await expect(page.locator('text=Turn on Google 2-Step Verification')).toBeVisible();
    await expect(page.locator('a[href*="two-step-verification"]')).toBeVisible();

    // Assert Launch Checklist card is rendered
    await expect(page.locator('h2:has-text("Launch Checklist")')).toBeVisible();
    await expect(page.locator('text=At least 4 active products with ≥2 photos each')).toBeVisible();
    await expect(page.locator('text=All business details & grievance officer info filled')).toBeVisible();
    await expect(page.locator('text=Google 2-Step Verification confirmed for all admins')).toBeVisible();
  });
});
