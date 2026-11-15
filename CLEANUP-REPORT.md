# Nest by Ammakkili - Launch Cleanup Report

**Branch:** `launch-hardening`  
**Date:** November 2026  
**Status:** Completed Section 1 (Cleanup)

---

## 1. Summary of Actions Taken

In accordance with the Ground Rules and Section 1 specification, the codebase was audited and purged of all demo assets, sample product references, obsolete templates, placeholder icons, and unused npm dependencies.

### 1.1 Demo & Sample Material Removed
- **Deleted 8 sample product SVGs:**
  - `public/img/products/sample-blush-cotton-nighty.svg`
  - `public/img/products/sample-cloud-soft-nighty.svg`
  - `public/img/products/sample-dusk-floral-nighty.svg`
  - `public/img/products/sample-ivory-lace-nighty.svg`
  - `public/img/products/sample-petal-print-nighty.svg`
  - `public/img/products/sample-plum-stripe-nighty.svg`
  - `public/img/products/sample-rose-garden-nighty.svg`
  - `public/img/products/sample-velvet-evening-nighty.svg`
- **Deleted sample product catalogs:**
  - `scripts/products.sample.json`
  - `data/products.sample.json` (and purged `data/` directory)
- **Deleted 10 placeholder SVGs & generator:**
  - `public/img/placeholders/*.svg` (all 10 SVGs removed, directory deleted)
  - `scripts/generate-placeholders.js`
- **Deleted obsolete verification script:**
  - `scripts/verify-sample-products.js`
- **Schema & Code Refactoring for `isSample`:**
  - Removed `isSample` from `src/models/Product.js`.
  - Removed `isSample` checks, admin sample banner, sample pill, and "Delete all sample products" bulk action in `src/controllers/adminController.js`, `src/routes/admin.js`, and `src/views/admin/` (`product-form.ejs`, `products.ejs`, `dashboard.ejs`).
  - Added database migration `scripts/migrations/unset-isSample.js` to strip `isSample` from any existing database records.

### 1.2 Leftovers & Obsolete Files Removed
- **Placeholder Logo Replacement:**
  - Deleted legacy `public/img/logo.svg`.
  - Updated all references in `src/controllers/`, `src/models/Product.js`, `src/views/`, and client scripts to official verified brand assets (`/img/brand/logo-mark-256.png` and `/img/brand/favicon-32.png`).
- **Lighthouse Artifacts & Ad-hoc Scripts:**
  - Removed `report-home.json` and `report-product.json`.
  - Removed `scripts/test-order-flow.js`.
  - Moved developer test/verify scripts from `scripts/` to `tests/scripts/` so production builds contain only deployment/operational scripts (`seed.js`, `reset-for-launch.js`, `download-fonts.js`, migrations).
- **Unused Dependencies:**
  - Uninstalled `express-validator` (verified zero references across the codebase).

### 1.3 Production Container Isolation (`.gitignore` & `.dockerignore`)
- Configured `.gitignore` and `.dockerignore` to strictly exclude:
  - All `.env*` files (except `.env.example`)
  - `node_modules`
  - `tests` and `tests/screenshots`
  - `test-results` and `playwright-report`
  - `samples` and `fixtures`
  - Logs, coverage, `.git`
  - Photo stylist sample images and test fixtures (`services/stylist/samples/`) containing client product photos.
- Created root multi-stage `Dockerfile` pinned to Node.js 22 LTS Alpine with non-root `node` user execution.

### 1.4 Test-Only Code Isolation
- Decoupled `/__test/*` endpoints and mock modal logic from shared production files.
- Created isolated `tests/harness/` module containing `tests/harness/index.js`, `mockModal.ejs`, and `mockModalScript.ejs`.
- Loaded conditionally via `if (process.env.NODE_ENV === 'test') { require('../tests/harness')(app); }` in `src/app.js`.
- Verified that production directories (`src/`, `public/`, `scripts/`) contain **zero** occurrences of `__test`, `razorpay-mock-modal`, `ALLOW_TEST_HARNESS`, or `mock_test_signature`.
- Added automated verification test in `tests/e2e/production-image-clean.spec.js`.

### 1.5 Self-Hosted Web Fonts
- Downloaded WOFF2 files for Cormorant Garamond, Jost, Noto Sans Malayalam, and Noto Serif Malayalam to `public/fonts/`.
- Generated `public/css/fonts.css` with `@font-face` definitions using `font-display: swap` restricted to `latin`, `latin-ext`, and `malayalam` subsets.
- Removed `fonts.googleapis.com` and `fonts.gstatic.com` links from `main.ejs`, `admin.ejs`, `login.ejs`, and removed both domains from the Content Security Policy.

### 1.6 Final Content Security Policy (CSP) & Justification
```http
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' 'nonce-<base64>' https://checkout.razorpay.com;
  frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://www.youtube.com https://www.youtube-nocookie.com;
  style-src 'self' 'unsafe-inline';
  font-src 'self';
  img-src 'self' data: blob: https://res.cloudinary.com https://checkout.razorpay.com https://img.youtube.com https://lh3.googleusercontent.com;
  connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
```

| Directive | Allowed Hosts / Sources | Technical Justification |
| :--- | :--- | :--- |
| `default-src` | `'self'` | Secure default fallback restricting all undeclared resource types to our origin. |
| `script-src` | `'self'`, `'nonce-...'`, `https://checkout.razorpay.com` | Strict script execution requiring per-request cryptographic nonces; Razorpay SDK. |
| `frame-src` | `'self'`, `https://checkout.razorpay.com`, `https://api.razorpay.com`, `https://www.youtube.com`, `https://www.youtube-nocookie.com` | Razorpay checkout modal & bank 3D-Secure OTP iframes; YouTube nighty video player embeds. |
| `style-src` | `'self'`, `'unsafe-inline'` | Self-hosted CSS stylesheets; dynamic inline styling attributes for status pills and modal displays. |
| `font-src` | `'self'` | Fully self-hosted WOFF2 fonts served from `/fonts/`. Google Fonts CDN removed. |
| `img-src` | `'self'`, `data:`, `blob:`, `https://res.cloudinary.com`, `https://checkout.razorpay.com`, `https://img.youtube.com`, `https://lh3.googleusercontent.com` | Local brand assets; image cropper / canvas blobs; Cloudinary product media CDN; Razorpay bank icons; YouTube thumbnails; Google OAuth user avatars. |
| `connect-src`| `'self'`, `https://api.razorpay.com`, `https://checkout.razorpay.com`, `https://lumberjack.razorpay.com` | Internal REST APIs; Razorpay payment capture and telemetry; Razorpay fraud prevention logger. |
| `object-src` | `'none'` | Blocks legacy plugin embeds (Flash, Java, Silverlight). |
| `base-uri`   | `'self'` | Prevents unauthorized `<base href="...">` manipulation. |
| `form-action`| `'self'` | Prevents form submissions from targeting external third-party origins. |
| `frame-ancestors` | `'none'` | Clickjacking defense preventing the application from being framed. |
