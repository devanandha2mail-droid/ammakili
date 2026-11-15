# Nest by Ammakkili - Launch Cleanup Plan

**Branch:** `launch-hardening`  
**Base Commit Tag:** `pre-launch-snapshot`  
**Date:** November 2026

---

## 1. Current Admin Login Code Analysis

As mandated by ground rules, here is the architectural and security breakdown of the current admin authentication mechanism before transition:

### 1.1 Architecture & Implementation
1. **Model (`src/models/Admin.js`):**
   - Stores `email` (unique, lowercase, trimmed), `passwordHash` (hashed using `bcryptjs`), and `role` (enum: `['admin']`).
   - Implements `comparePassword(candidatePassword)` instance method using `bcrypt.compare`.
2. **Controller (`src/controllers/adminController.js`):**
   - `getLogin`: Renders `admin/login.ejs` with a username/password form.
   - `postLogin`: Extracts `email` and `password` from `req.body`. Queries `Admin.findOne({ email })`. Verifies password hash. On match, sets `req.session.adminId = admin._id` and redirects to `/admin`.
   - `logout`: Calls `req.session.destroy()` and redirects to `/admin/login`.
3. **Middleware (`src/middleware/auth.js`):**
   - `requireAdmin`: Checks for `req.session.adminId`. If present, queries `Admin.findById(req.session.adminId).select('-passwordHash')`. Sets `req.admin` and `res.locals.admin`. If missing or invalid, destroys session and redirects to `/admin/login`.
   - `redirectIfAuthenticated`: Redirects to `/admin` if `req.session.adminId` is already set.
4. **Routes (`src/routes/admin.js`):**
   - Uses `adminLoginLimiter` (5 attempts per 15 mins) on `POST /admin/login`.
   - Mounts `GET /admin/login`, `POST /admin/login`, and `GET /admin/logout`.
   - Protects all administrative endpoints with `router.use(requireAdmin)`.
5. **View (`src/views/admin/login.ejs`):**
   - Renders HTML form with `#email` and `#password` input fields, submit button, and links to Google Fonts CDN.

### 1.2 Transition to Google Sign-In with Allowlist
- **Motivation:** Eliminate stored password hashes, remove dictionary/brute-force attacks, mandate verified Google identity, enforce MFA at the Google account level, and adhere to zero-password production security.
- **New Architecture (`AdminUser` Collection):**
  - Collection schema: `email` (lowercase, unique), `googleSub` (string, bound on first authenticated login), `role` (`owner` or `staff`), `active` (boolean), `createdAt`, `createdBy`, `lastLoginAt`.
  - First owner automatically seeded from `ADMIN_OWNER_EMAIL` (configured via server environment).
  - Dedicated admin OAuth callback (`/admin/auth/google/callback`) completely segregated from customer OAuth.
  - Dedicated admin session cookie name (`__Host-nest_admin_sess` in production) separate from customer session cookies.
  - Idle timeout of 30 minutes and absolute session limit of 8 hours.
  - Sensitive operations (settings updates, business details, refunds, customer export/deletion, admin management) require fresh Google sign-in within the past 5 minutes.
  - Immediate session termination upon deactivation or role revocation.

---

## 2. Files Planned for Removal

The following files are verified to be demo artifacts, placeholders, temporary run outputs, or unused dependencies. They will be deleted only after this plan is established.

### 2.1 Demo & Sample Product Assets
| File Path | Reason for Removal | Proof Unused / Obsolete |
| :--- | :--- | :--- |
| `public/img/products/sample-blush-cotton-nighty.svg` | Demo product vector illustration | Store starts completely empty. Real products will use Cloudinary. |
| `public/img/products/sample-cloud-soft-nighty.svg` | Demo product vector illustration | Store starts completely empty. Real products will use Cloudinary. |
| `public/img/products/sample-dusk-floral-nighty.svg` | Demo product vector illustration | Store starts completely empty. Real products will use Cloudinary. |
| `public/img/products/sample-ivory-lace-nighty.svg` | Demo product vector illustration | Store starts completely empty. Real products will use Cloudinary. |
| `public/img/products/sample-petal-print-nighty.svg` | Demo product vector illustration | Store starts completely empty. Real products will use Cloudinary. |
| `public/img/products/sample-plum-stripe-nighty.svg` | Demo product vector illustration | Store starts completely empty. Real products will use Cloudinary. |
| `public/img/products/sample-rose-garden-nighty.svg` | Demo product vector illustration | Store starts completely empty. Real products will use Cloudinary. |
| `public/img/products/sample-velvet-evening-nighty.svg` | Demo product vector illustration | Store starts completely empty. Real products will use Cloudinary. |
| `scripts/products.sample.json` | Sample product catalog data | Demo seed data; site starts empty. |
| `data/products.sample.json` | Duplicate sample product catalog data | Demo seed data; site starts empty. |
| `scripts/verify-sample-products.js` | Verification script for sample products | Only tested demo sample products; obsolete. |

### 2.2 Placeholder Graphics & Generator
| File Path | Reason for Removal | Proof Unused / Obsolete |
| :--- | :--- | :--- |
| `public/img/placeholders/blush-cotton-1.svg` | Placeholder dummy image | No longer used in production; real photography used. |
| `public/img/placeholders/blush-cotton-2.svg` | Placeholder dummy image | No longer used in production. |
| `public/img/placeholders/cloud-soft-1.svg` | Placeholder dummy image | No longer used in production. |
| `public/img/placeholders/dusk-floral-1.svg` | Placeholder dummy image | No longer used in production. |
| `public/img/placeholders/petal-print-1.svg` | Placeholder dummy image | No longer used in production. |
| `public/img/placeholders/rose-garden-1.svg` | Placeholder dummy image | Replaced with brand fallback `/img/brand/logo-mark-256.png`. |
| `public/img/placeholders/rose-garden-2.svg` | Placeholder dummy image | No longer used in production. |
| `public/img/placeholders/rose-garden-3.svg` | Placeholder dummy image | No longer used in production. |
| `public/img/placeholders/velvet-evening-1.svg` | Placeholder dummy image | No longer used in production. |
| `public/img/placeholders/velvet-evening-2.svg` | Placeholder dummy image | No longer used in production. |
| `scripts/generate-placeholders.js` | Script that generated placeholder SVGs | Placeholder generation is obsolete. |

### 2.3 Obsolete Brand Placeholder & Run Artifacts
| File Path | Reason for Removal | Proof Unused / Obsolete |
| :--- | :--- | :--- |
| `public/img/logo.svg` | Legacy text-wordmark placeholder SVG | Replaced by high-res verified brand assets in `/img/brand/`. All references updated. |
| `report-home.json` | Lighthouse JSON run artifact | One-off performance run artifact; not application code. |
| `report-product.json` | Lighthouse JSON run artifact | One-off performance run artifact; not application code. |
| `scripts/test-order-flow.js` | Legacy ad-hoc testing script | Superseded by comprehensive Playwright E2E suite (`tests/e2e/`). |

### 2.4 Unused npm Dependencies
| Package | Reason for Removal | Proof Unused |
| :--- | :--- | :--- |
| `express-validator` | Unused dependency | Flagged by `depcheck` & `knip`; zero references found via `git grep "express-validator"`. (Replaced by `zod` for type-safe schema validation). |

---

## 3. Code & Schema Refactoring Plan

1. **Remove `isSample` field:**
   - Remove from `src/models/Product.js`.
   - Remove admin sample banner, badge, and sample bulk deletion logic in `src/controllers/adminController.js` and `src/views/admin/`.
   - Add database migration `scripts/migrations/unset-isSample.js` to execute `$unset: { isSample: "" }` across products.
2. **Remove `ADMIN_PASSWORD`:**
   - Remove from `src/utils/envGuard.js`, `README.md`, `.env.example`, `scripts/seed.js`.
   - Replace with strict check for `ADMIN_OWNER_EMAIL`.
3. **Decouple Test Harness Code from Production Bundles:**
   - Relocate `/__test/*` endpoints to `tests/harness/testRoutes.js`.
   - Relocate `#razorpay-mock-modal` to `tests/harness/test-mock-modal.ejs` (injected via test-only middleware).
   - Ensure production Docker image excludes all test files via `.dockerignore`.
4. **Self-Host Web Fonts:**
   - Download Cormorant Garamond, Jost, Noto Sans Malayalam, and Noto Serif Malayalam WOFF2 files to `public/fonts/`.
   - Provide `public/css/fonts.css` with `@font-face` rules (`font-display: swap`).
   - Remove `fonts.googleapis.com` and `fonts.gstatic.com` from EJS layouts and CSP.
