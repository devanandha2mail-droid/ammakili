const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const {
  resetAndSeedDatabase,
  connectTestDB,
  disconnectTestDB,
  Product,
  Order,
  Customer,
  Settings,
  Banner,
  AdminUser
} = require('../helpers/db');

const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;

const VIEWPORTS = [
  { name: '360x740', width: 360, height: 740, desc: 'Galaxy Small / Low-end Android' },
  { name: '375x667', width: 375, height: 667, desc: 'iPhone SE' },
  { name: '390x844', width: 390, height: 844, desc: 'iPhone 12/13/14' },
  { name: '412x915', width: 412, height: 915, desc: 'Pixel 7 / Android Standard' },
  { name: '768x1024', width: 768, height: 1024, desc: 'iPad Mini / Tablet Breakpoint' }
];

const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots/audit');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function waitForServer(url, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Server at ${url} failed to start within ${timeout}ms`));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

async function prepareData() {
  await resetAndSeedDatabase();

  const product = await Product.findOne();
  if (!product) throw new Error('No product found after seeding');

  // Sample customer
  const customer = await Customer.create({
    googleId: 'audit_customer_123',
    email: 'priya.customer@example.com',
    emailVerified: true,
    name: 'Priya Lakshmi',
    phone: '9846012345',
    addresses: [{
      label: 'Home',
      name: 'Priya Lakshmi',
      phone: '9846012345',
      address: 'Ammakkili Villa, Palace Road',
      city: 'Thrissur',
      state: 'Kerala',
      pin: '680001',
      isDefault: true
    }]
  });

  // Sample order
  const order = await Order.create({
    orderId: 'NEST-AUDIT-001',
    customer: {
      name: 'Priya Lakshmi',
      phone: '9846012345',
      address: 'Ammakkili Villa, Palace Road',
      city: 'Thrissur',
      pin: '680001'
    },
    items: [{
      productId: product._id,
      name: product.name.en,
      price: product.price,
      size: 'M',
      quantity: 1,
      image: product.images[0]?.url || '/img/brand/logo-full-512.png'
    }],
    subtotal: product.price,
    shipping: 60,
    total: product.price + 60,
    status: 'paid',
    payment: {
      razorpayOrderId: 'order_audit_123',
      razorpayPaymentId: 'pay_audit_123',
      status: 'captured'
    }
  });

  return { product, customer, order };
}

async function runAudit() {
  console.log('=== Starting Phase 0: Mobile Optimization Audit ===');
  
  const { product, customer, order } = await prepareData();
  console.log(`Database seeded. Sample product: ${product.slug}, Sample order: ${order.orderId}, Sample customer: ${customer._id}`);

  // Start test server
  console.log(`Starting test server on port ${PORT}...`);
  const serverProcess = spawn('node', ['-r', './tests/helpers/mock-razorpay.js', 'src/server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      PAYMENTS_MODE: 'test',
      ALLOW_TEST_LOGIN: 'true',
      ALLOW_TEST_HARNESS: 'true',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/nest_test'
    },
    stdio: 'pipe'
  });

  try {
    await waitForServer(`${BASE_URL}/healthz`);
    console.log(`Server responded at ${BASE_URL}. Launching Chromium...`);

    const browser = await chromium.launch({ headless: true });

    const auditPages = [
      // Public pages
      { category: 'Public', id: 'home', path: '/', name: 'Home' },
      { category: 'Public', id: 'shop', path: '/shop', name: 'Shop Catalog' },
      { category: 'Public', id: 'product', path: `/product/${product.slug}`, name: 'Product Detail' },
      { category: 'Public', id: 'cart', path: '/cart', name: 'Cart' },
      { category: 'Public', id: 'checkout', path: '/checkout', name: 'Checkout' },
      { category: 'Public', id: 'wishlist', path: '/wishlist', name: 'Wishlist' },
      { category: 'Public', id: 'track', path: '/track-order', name: 'Order Tracking' },
      { category: 'Public', id: 'account-unauth', path: '/account', name: 'Account (Unauthenticated)' },
      { category: 'Public', id: 'login', path: '/login', name: 'Customer Login' },
      { category: 'Public', id: 'size-guide', path: '/size-guide', name: 'Size Guide' },
      { category: 'Public', id: 'about', path: '/about', name: 'About Us' },
      { category: 'Public', id: 'faq', path: '/faq', name: 'FAQ' },
      { category: 'Public', id: 'contact', path: '/contact', name: 'Contact' },
      { category: 'Public', id: 'policies', path: '/policies', name: 'Policies' },

      // Admin pages
      { category: 'Admin', id: 'admin-login', path: '/admin/login', name: 'Admin Login', requiresAdmin: false },
      { category: 'Admin', id: 'admin-dash', path: '/admin', name: 'Admin Dashboard', requiresAdmin: true },
      { category: 'Admin', id: 'admin-orders', path: '/admin/orders', name: 'Admin Orders List', requiresAdmin: true },
      { category: 'Admin', id: 'admin-order-detail', path: `/admin/orders/${order._id}`, name: 'Admin Order Detail', requiresAdmin: true },
      { category: 'Admin', id: 'admin-products', path: '/admin/products', name: 'Admin Products List', requiresAdmin: true },
      { category: 'Admin', id: 'admin-product-new', path: '/admin/products/new', name: 'Admin Product Form', requiresAdmin: true },
      { category: 'Admin', id: 'admin-customers', path: '/admin/customers', name: 'Admin Customers List', requiresAdmin: true },
      { category: 'Admin', id: 'admin-customer-detail', path: `/admin/customers/${customer._id}`, name: 'Admin Customer Detail', requiresAdmin: true },
      { category: 'Admin', id: 'admin-banners', path: '/admin/banners', name: 'Admin Banners', requiresAdmin: true },
      { category: 'Admin', id: 'admin-settings', path: '/admin/settings', name: 'Admin Settings', requiresAdmin: true },
      { category: 'Admin', id: 'admin-users', path: '/admin/users', name: 'Admin Team Users', requiresAdmin: true },
      { category: 'Admin', id: 'admin-audit', path: '/admin/audit-logs', name: 'Admin Audit Logs', requiresAdmin: true },
      { category: 'Admin', id: 'admin-diag', path: '/admin/diagnostics', name: 'Admin Diagnostics', requiresAdmin: true },
      { category: 'Admin', id: 'admin-slip', path: `/admin/packing-slip/${order._id}`, name: 'Admin Packing Slip', requiresAdmin: true }
    ];

    const findings = [];

    // Crawl loop across all viewports
    for (const vp of VIEWPORTS) {
      console.log(`\n>>> Auditing Viewport: ${vp.name} (${vp.desc}) <<<`);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
        userAgent: vp.width < 768
          ? 'Mozilla/5.0 (Linux; Android 13; SM-A037F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
          : 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
      });

      const page = await context.newPage();

      // Enable CDP emulation for Slow 4G and 4x CPU throttling
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 400, // 400ms RTT
        downloadThroughput: (500 * 1024) / 8, // 500 kbps
        uploadThroughput: (500 * 1024) / 8
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      // Admin login helper
      let isAdminLoggedIn = false;
      const ensureAdminLogin = async () => {
        if (!isAdminLoggedIn) {
          await page.goto(`${BASE_URL}/admin/test-login?email=owner@nestammakkili.com&role=owner`, { waitUntil: 'domcontentloaded' });
          isAdminLoggedIn = true;
        }
      };

      for (const pageDef of auditPages) {
        if (pageDef.requiresAdmin) {
          await ensureAdminLogin();
        }

        const testCombos = [
          { mode: 'light', lang: 'en' },
          { mode: 'dark', lang: 'ml' }
        ];

        for (const combo of testCombos) {
          const targetUrl = `${BASE_URL}${pageDef.path}${pageDef.path.includes('?') ? '&' : '?'}lang=${combo.lang}`;

          try {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          } catch (e) {
            console.warn(`Navigation warning for ${targetUrl}: ${e.message}`);
          }

          // Force theme attribute
          await page.evaluate((theme) => {
            document.documentElement.setAttribute('data-theme', theme);
          }, combo.mode);
          await page.waitForTimeout(60);

          // Deep page evaluation
          const auditResult = await page.evaluate(({ vpWidth, vpHeight, lang }) => {
            // 1. Horizontal Scroll & Overflow Check
            const scrollW = document.documentElement.scrollWidth;
            const bodyScrollW = document.body ? document.body.scrollWidth : 0;
            const maxScrollW = Math.max(scrollW, bodyScrollW);
            const hasHorizontalScroll = maxScrollW > vpWidth + 1.5;

            const overflowingElements = [];
            const allElements = Array.from(document.querySelectorAll('body *'));
            for (const el of allElements) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                if (rect.right > vpWidth + 2) {
                  const tag = el.tagName.toLowerCase();
                  const cls = el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}` : '';
                  const id = el.id ? `#${el.id}` : '';
                  const selector = `${tag}${id}${cls}`;
                  if (!overflowingElements.includes(selector) && overflowingElements.length < 5) {
                    overflowingElements.push(`${selector} (right: ${Math.round(rect.right)}px vs vp: ${vpWidth}px)`);
                  }
                }
              }
            }

            // 2. Tap targets < 44x44 CSS px
            const smallTapTargets = [];
            const interactiveSelectors = 'button, a, input, select, textarea, [role="button"], .chip, .btn, .pill, .tool';
            const interactives = Array.from(document.querySelectorAll(interactiveSelectors));
            for (const el of interactives) {
              if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
              const isInlineTextLink = el.tagName === 'A' && el.closest('p, small, li') && !el.classList.contains('btn') && !el.classList.contains('pill') && !el.classList.contains('tool');
              if (isInlineTextLink) continue;

              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                if (rect.width < 44 || rect.height < 44) {
                  const label = (el.innerText || el.getAttribute('aria-label') || el.value || el.placeholder || el.tagName).trim().substring(0, 25);
                  const selector = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''}`;
                  if (smallTapTargets.length < 6) {
                    smallTapTargets.push(`${selector} ["${label}"] (${Math.round(rect.width)}x${Math.round(rect.height)}px)`);
                  }
                }
              }
            }

            // 3. Form input text font size < 16px
            const smallInputFonts = [];
            const formInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea'));
            for (const el of formInputs) {
              const comp = window.getComputedStyle(el);
              const fz = parseFloat(comp.fontSize) || 0;
              if (fz < 15.5) {
                const name = el.name || el.id || el.placeholder || el.tagName;
                smallInputFonts.push(`${name} (font-size: ${Math.round(fz)}px)`);
              }
            }

            // 4. Viewport and zoom lock check
            const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
            const disallowsZoom = viewportMeta.includes('user-scalable=no') || viewportMeta.includes('maximum-scale=1');
            const hasViewportFit = viewportMeta.includes('viewport-fit=cover');

            // 5. Sticky and keyboard overlap check
            const stickyElements = [];
            const stickies = Array.from(document.querySelectorAll('*')).filter(el => {
              const pos = window.getComputedStyle(el).position;
              return pos === 'sticky' || pos === 'fixed';
            });
            for (const s of stickies) {
              const r = s.getBoundingClientRect();
              if (r.height > 0 && r.width > 0) {
                stickyElements.push(`${s.tagName.toLowerCase()}.${s.className ? String(s.className).split(/\s+/)[0] : ''} (h: ${Math.round(r.height)}px)`);
              }
            }

            // 6. Tables without responsive stacking or container
            const wideTables = [];
            const tables = Array.from(document.querySelectorAll('table'));
            for (const tb of tables) {
              const tbRect = tb.getBoundingClientRect();
              const container = tb.closest('.a-table-wrap, .tablewrap');
              if (tbRect.width > vpWidth && !container) {
                wideTables.push(`table without scroll container (width: ${Math.round(tbRect.width)}px)`);
              }
            }

            // 7. Malayalam typography checks (line height & wrapping)
            const malayalamIssues = [];
            if (lang === 'ml') {
              const mlHeadings = Array.from(document.querySelectorAll('h1, h2, h3, p, .btn'));
              for (const mh of mlHeadings) {
                const comp = window.getComputedStyle(mh);
                const lh = parseFloat(comp.lineHeight);
                const fs = parseFloat(comp.fontSize);
                if (fs > 0 && lh > 0 && (lh / fs) < 1.35) {
                  malayalamIssues.push(`${mh.tagName.toLowerCase()} line-height ratio is ${(lh / fs).toFixed(2)} (< 1.5)`);
                }
              }
            }

            return {
              hasHorizontalScroll,
              scrollW: maxScrollW,
              overflowingElements,
              smallTapTargets,
              smallInputFonts,
              viewportMeta,
              disallowsZoom,
              hasViewportFit,
              stickyElements,
              wideTables,
              malayalamIssues: malayalamIssues.slice(0, 3)
            };
          }, { vpWidth: vp.width, vpHeight: vp.height, lang: combo.lang });

          // Take screenshot
          const screenshotFileName = `audit-${pageDef.id}-${vp.name}-${combo.mode}-${combo.lang}.png`;
          const shotPath = path.join(SCREENSHOT_DIR, screenshotFileName);
          await page.screenshot({ path: shotPath, fullPage: false });

          // Record defects
          if (auditResult.hasHorizontalScroll) {
            findings.push({
              page: pageDef.name,
              path: pageDef.path,
              device: `${vp.name} (${vp.desc})`,
              mode: combo.mode,
              lang: combo.lang,
              severity: 'CRITICAL',
              category: 'Horizontal Overflow',
              detail: `Horizontal page overflow: scrollWidth=${Math.round(auditResult.scrollW)}px > viewport=${vp.width}px. Offending: ${auditResult.overflowingElements.join('; ') || 'Container layout overflow'}`,
              screenshot: screenshotFileName
            });
          }

          if (auditResult.smallTapTargets.length > 0) {
            findings.push({
              page: pageDef.name,
              path: pageDef.path,
              device: `${vp.name} (${vp.desc})`,
              mode: combo.mode,
              lang: combo.lang,
              severity: 'MAJOR',
              category: 'Touch Target Under 44px',
              detail: `Interactive elements < 44x44px: ${auditResult.smallTapTargets.join('; ')}`,
              screenshot: screenshotFileName
            });
          }

          if (auditResult.smallInputFonts.length > 0) {
            findings.push({
              page: pageDef.name,
              path: pageDef.path,
              device: `${vp.name} (${vp.desc})`,
              mode: combo.mode,
              lang: combo.lang,
              severity: 'MAJOR',
              category: 'Input Font Under 16px',
              detail: `Form inputs font-size < 16px (triggers iOS auto-zoom): ${auditResult.smallInputFonts.join(', ')}`,
              screenshot: screenshotFileName
            });
          }

          if (!auditResult.hasViewportFit) {
            findings.push({
              page: pageDef.name,
              path: pageDef.path,
              device: `${vp.name} (${vp.desc})`,
              mode: combo.mode,
              lang: combo.lang,
              severity: 'MEDIUM',
              category: 'Viewport Meta Missing viewport-fit',
              detail: `Meta viewport "${auditResult.viewportMeta}" lacks viewport-fit=cover for safe-area insets.`,
              screenshot: screenshotFileName
            });
          }

          if (auditResult.wideTables.length > 0) {
            findings.push({
              page: pageDef.name,
              path: pageDef.path,
              device: `${vp.name} (${vp.desc})`,
              mode: combo.mode,
              lang: combo.lang,
              severity: 'MAJOR',
              category: 'Unresponsive Table',
              detail: `Table without scroll container or responsive stack: ${auditResult.wideTables.join(', ')}`,
              screenshot: screenshotFileName
            });
          }

          if (auditResult.malayalamIssues.length > 0) {
            findings.push({
              page: pageDef.name,
              path: pageDef.path,
              device: `${vp.name} (${vp.desc})`,
              mode: combo.mode,
              lang: combo.lang,
              severity: 'MINOR',
              category: 'Malayalam Typography Line Height',
              detail: `Tight line-height for Malayalam script: ${auditResult.malayalamIssues.join('; ')}`,
              screenshot: screenshotFileName
            });
          }
        }
      }

      await context.close();
      console.log(`Finished auditing viewport ${vp.name}. Cumulative findings: ${findings.length}`);
    }

    await browser.close();

    console.log(`\nAudit completed successfully! Total defects recorded: ${findings.length}`);
    return findings;

  } finally {
    serverProcess.kill();
    await disconnectTestDB();
  }
}

runAudit().then((findings) => {
  const findingsJsonPath = path.resolve(__dirname, 'audit-findings.json');
  fs.writeFileSync(findingsJsonPath, JSON.stringify(findings, null, 2));
  console.log(`Saved raw findings to ${findingsJsonPath}`);
  process.exit(0);
}).catch((err) => {
  console.error('Audit run failed:', err);
  process.exit(1);
});
