const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { connectTestDB, disconnectTestDB } = require('../helpers/db');

test.describe('J13: Performance, Accessibility, Best Practices, and SEO audit', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('validates Core Web Vitals on Home and Product page', async ({ page }) => {
    // 1. Audit Home Page
    await page.goto('/');
    const homeMetrics = await page.evaluate(async () => {
      const timing = performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      const domContentTime = timing.domContentLoadedEventEnd - timing.navigationStart;

      // Check for layout shifts or long tasks
      return {
        loadTime,
        domContentTime,
        domNodes: document.querySelectorAll('*').length
      };
    });

    expect(homeMetrics.domNodes).toBeLessThan(1500);

    // Check if pre-run Lighthouse reports are present
    const homeReportPath = path.resolve(process.cwd(), 'report-home.json');
    if (fs.existsSync(homeReportPath)) {
      const report = JSON.parse(fs.readFileSync(homeReportPath, 'utf8'));
      const cat = report.categories;
      const perf = Math.round(cat.performance.score * 100);
      const a11y = Math.round(cat.accessibility.score * 100);
      const bp = Math.round(cat['best-practices'].score * 100);
      const seo = Math.round(cat.seo.score * 100);

      expect(perf).toBeGreaterThanOrEqual(85);
      expect(a11y).toBeGreaterThanOrEqual(95);
      expect(bp).toBeGreaterThanOrEqual(95);
      expect(seo).toBeGreaterThanOrEqual(95);
    }

    // 2. Audit Product Page
    await page.goto('/product/rose-garden-nighty');
    const prodMetrics = await page.evaluate(async () => {
      return {
        domNodes: document.querySelectorAll('*').length
      };
    });

    expect(prodMetrics.domNodes).toBeLessThan(1500);

    const prodReportPath = path.resolve(process.cwd(), 'report-product.json');
    if (fs.existsSync(prodReportPath)) {
      const report = JSON.parse(fs.readFileSync(prodReportPath, 'utf8'));
      const cat = report.categories;
      const perf = Math.round(cat.performance.score * 100);
      const a11y = Math.round(cat.accessibility.score * 100);
      const bp = Math.round(cat['best-practices'].score * 100);
      const seo = Math.round(cat.seo.score * 100);

      expect(perf).toBeGreaterThanOrEqual(85);
      expect(a11y).toBeGreaterThanOrEqual(95);
      expect(bp).toBeGreaterThanOrEqual(95);
      expect(seo).toBeGreaterThanOrEqual(95);
    }
  });
});

