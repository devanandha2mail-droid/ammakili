const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const path = require('path');
const fs = require('fs');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB } = require('../helpers/db');

const PUBLIC_PAGES = [
  { path: '/', name: 'home' },
  { path: '/shop', name: 'shop' },
  { path: '/product/rose-garden-nighty', name: 'product' },
  { path: '/cart', name: 'cart' },
  { path: '/wishlist', name: 'wishlist' },
  { path: '/size-guide', name: 'size-guide' },
  { path: '/about', name: 'about' },
  { path: '/contact', name: 'contact' },
  { path: '/faq', name: 'faq' },
  { path: '/policies', name: 'policies' },
  { path: '/track-order', name: 'track-order' },
  { path: '/login', name: 'login' },
  { path: '/non-existent-page-404', name: '404' }
];

test.describe('J11: Quality gates on public pages', () => {
  test.beforeAll(async () => {
    await connectTestDB();
    const screenshotDir = path.resolve(__dirname, '../screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  for (const pg of PUBLIC_PAGES) {
    test(`Quality gate for ${pg.name} (${pg.path}) in light and dark mode`, async ({ page }, testInfo) => {
      const consoleErrors = [];
      const failedRequests = [];

      page.on('console', msg => {
        if (msg.type() === 'error') {
          // Navigating directly to a 404 URL causes the browser to log a 404 resource failure to console
          if (pg.name === '404' && (msg.text().includes('404') || msg.text().includes('Failed to load resource'))) {
            return;
          }
          consoleErrors.push(msg.text());
        }
      });

      page.on('response', res => {
        // Exclude intentional 404 response on 404 test page
        if (res.status() >= 400 && !(pg.name === '404' && res.status() === 404)) {
          failedRequests.push(`${res.status()} ${res.url()}`);
        }
      });

      // 1. Test in Light mode
      await page.goto(pg.path);
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

      // Check no failed network requests
      expect(failedRequests).toEqual([]);

      // Check no unhandled console errors
      expect(consoleErrors).toEqual([]);

      // Check no raw code visible on page
      const bodyText = await page.innerText('body');
      expect(bodyText).not.toContain('addEventListener');
      expect(bodyText).not.toContain('</script>');
      expect(bodyText).not.toContain('function()');

      // Check no horizontal scroll (allow 1px for fractional subpixel rounding)
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasHorizontalScroll).toBe(false);

      // Check images are loaded and not broken
      const brokenImages = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src);
      });
      expect(brokenImages).toEqual([]);

      // Check sticky footer on short pages
      const footerBottom = await page.evaluate(() => {
        const ft = document.querySelector('.site-footer');
        return ft ? ft.getBoundingClientRect().bottom : 0;
      });
      const viewportHeight = page.viewportSize()?.height || 900;
      expect(footerBottom).toBeGreaterThanOrEqual(viewportHeight - 2);

      // Save screenshot
      const shotPath = path.resolve(__dirname, `../screenshots/${pg.name}-light-${testInfo.project.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      // Accessibility gate: zero serious or critical violations
      const axeScan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      const severeViolations = axeScan.violations.filter(
        v => v.impact === 'serious' || v.impact === 'critical'
      );
      expect(severeViolations).toEqual([]);

      // 2. Test in Dark mode
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      const shotDarkPath = path.resolve(__dirname, `../screenshots/${pg.name}-dark-${testInfo.project.name}.png`);
      await page.screenshot({ path: shotDarkPath, fullPage: false });
    });
  }

  test('Header never wraps at responsive breakpoints (1440, 1100, 1024, 768, 390, 360px)', async ({ page }) => {
    const breakpoints = [1440, 1100, 1024, 768, 390, 360];

    for (const width of breakpoints) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      const headerHeight = await page.evaluate(() => {
        const header = document.querySelector('.site-header');
        return header ? header.offsetHeight : 0;
      });

      // Header should stay compact and not balloon due to text wrapping (desktop: ~70px, mobile: ~64px)
      expect(headerHeight).toBeLessThanOrEqual(90);

      // Horizontal scroll check at this breakpoint
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width + 1);
    }
  });
});

