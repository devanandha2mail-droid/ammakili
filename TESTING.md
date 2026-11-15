# End-to-End Test Suite Guide: Nest by Ammakkili

This document provides setup instructions, execution workflows, safety guardrails, and debugging practices for the Playwright end-to-end testing suite for Nest by Ammakkili.

---

## 1. Prerequisites & Setup

### Environment Requirements
- **Node.js**: v18.0.0 or higher (v24 LTS recommended)
- **MongoDB**: Local MongoDB instance running on `127.0.0.1:27017`
- **Browsers**: Chromium (installed via Playwright)

### Initial Setup Commands
```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browser binaries
npx playwright install chromium
```

---

## 2. Test Configuration & Isolation Guardrails

Tests strictly run against an isolated test database and test payment credentials configured in `.env.test`.

### Critical Safety Guardrails
The test suite implements hard programmatic guards in `playwright.config.js`:
1. **Database Guard**: Aborts immediately with a fatal error if `MONGODB_URI` does not contain `_test`. Production or staging databases can never be overwritten or modified by the test runner.
2. **Payment Guard**: Aborts immediately if `RAZORPAY_KEY_ID` does not start with `rzp_test_`. Live transactions cannot be processed by tests.
3. **Test-Only Login Isolation**: The `POST /__test/login` route is strictly gated by `process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_LOGIN === 'true'`. In `production`, this endpoint does not exist and returns `404 Not Found`.

### Environment File (`.env.test`)
```ini
PORT=3001
NODE_ENV=test
ALLOW_TEST_LOGIN=true
MONGODB_URI=mongodb://127.0.0.1:27017/nest_test
SESSION_SECRET=test_session_secret_min32chars_long!
CSRF_SECRET=csrf_secret_nest_ammakkili_min32chars_long!
RAZORPAY_KEY_ID=rzp_test_1234567890ABC
RAZORPAY_KEY_SECRET=test_secret_1234567890
RAZORPAY_WEBHOOK_SECRET=test_webhook_secret_hmac256
CLOUDINARY_CLOUD_NAME=mock
CLOUDINARY_API_KEY=mock
CLOUDINARY_API_SECRET=mock
```

---

## 3. Database State & Seeding

Every test file executes `resetAndSeedDatabase()` before tests to ensure deterministic starting state:
- Cleans existing test collections (`Product`, `Order`, `Customer`, `Settings`, `Banner`).
- Seeds 8 sample products from `scripts/products.sample.json` (`isSample: true`).
- Configures deterministic inventory for edge cases:
  - Size `3XL`: Stock = 0 (Sold out verification)
  - Size `XXL`: Stock = 2 (Low stock alert)
  - Size `XL`: Stock = 1 (Atomic overselling concurrency test)
  - Size `M` & `L`: Stock = 8 (Standard checkout flows)
- Seeds initial boutique settings (Flat ₹60 shipping, WhatsApp support number).

---

## 4. Running the Tests

### Execute the Full Suite
Runs all 13 journeys on both `desktop` (1440x900) and `mobile` (iPhone 13, 390x844):
```bash
npm run test:e2e
```
*Alias: `npx playwright test`*

### Interactive UI Mode (Time-travel & Visual Debugging)
```bash
npm run test:e2e:ui
```

### Run by Project (Desktop vs Mobile)
```bash
# Run only Desktop viewport (1440x900)
npx playwright test --project=desktop

# Run only Mobile viewport (iPhone 13, 390x844)
npx playwright test --project=mobile
```

### Run a Specific Journey
```bash
# J1: Guest purchase happy path
npx playwright test tests/e2e/j1-guest-purchase.spec.js

# J2: Payment failure handling
npx playwright test tests/e2e/j2-payment-failure.spec.js

# J3: Overselling concurrency prevention
npx playwright test tests/e2e/j3-overselling.spec.js

# J4: Webhook HMAC safety & idempotency
npx playwright test tests/e2e/j4-webhook-safety.spec.js

# J5: Price & input tampering resistance
npx playwright test tests/e2e/j5-price-input-tampering.spec.js

# J6: Customer account, saved addresses & deletion
npx playwright test tests/e2e/j6-customer-account.spec.js

# J7: Order tracking & enumeration protection
npx playwright test tests/e2e/j7-order-tracking.spec.js

# J8: Admin order lifecycle, products & settings
npx playwright test tests/e2e/j8-admin.spec.js

# J9: Bilingual English & Malayalam switching
npx playwright test tests/e2e/j9-languages.spec.js

# J10: Cart state integrity & offline recovery
npx playwright test tests/e2e/j10-cart-integrity.spec.js

# J11: Quality gates (13 public pages, Axe a11y, header wrap)
npx playwright test tests/e2e/j11-quality-gates.spec.js

# J12: SEO metadata, structured data, headers & security
npx playwright test tests/e2e/j12-seo-security.spec.js

# J13: Performance metrics & Core Web Vitals
npx playwright test tests/e2e/j13-performance.spec.js
```

---

## 5. Debugging & Artifact Inspection

### View HTML Test Report
```bash
npx playwright show-report
```

### Trace Viewer
Traces are automatically captured on retry for failing tests:
```bash
npx playwright show-trace test-results/<test-folder>/trace.zip
```

### Failure Screenshots & Visual Reviews
- Failure screenshots: `test-results/<test-folder>/test-failed-1.png`
- Quality gate full-page audit screenshots: `tests/screenshots/`
  *(Contains light and dark mode captures for home, shop, product, cart, wishlist, size-guide, about, contact, faq, policies, track-order, login, and 404 pages across desktop and mobile)*

