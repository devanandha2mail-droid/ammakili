# Mobile Optimization Audit (Phase 0)
**Project:** Nest by Ammakkili  
**Date:** November 16, 2026  
**Auditor:** Automated Chromium Mobile Audit Suite (with Slow 4G & 4x CPU Throttling)  
**Branch:** `mobile-first`  

---

## 1. Executive Summary & Audit Methodology

An exhaustive mobile audit was executed across **every public page** and **every admin portal page** of the Nest by Ammakkili web application. The audit crawled the full site across **5 target viewport configurations**, in both **Light and Dark mode**, in both **English and Malayalam** (`en` and `ml`), under simulated **Slow 4G network emulation** (400ms latency, 500 kbps downstream, 500 kbps upstream) and **4x CPU throttling** via Chrome DevTools Protocol (CDP).

### Target Viewports Evaluated
| Viewport | Device Representation | Form Factor | Orientation |
| :--- | :--- | :--- | :--- |
| **360 x 740 px** | Samsung Galaxy A-series / Low-End Android (3 GB RAM target) | Ultra-compact Mobile | Portrait |
| **375 x 667 px** | Apple iPhone SE (2nd/3rd gen) | Compact Mobile | Portrait |
| **390 x 844 px** | Apple iPhone 12 / 13 / 14 | Standard Mobile | Portrait |
| **412 x 915 px** | Google Pixel 7 / Samsung Galaxy S-series | Large Mobile | Portrait |
| **768 x 1024 px** | Apple iPad Mini / Tablet breakpoint | Tablet | Portrait |

### Summary of Audit Findings
* **Total Defect Entries Recorded:** 634 entries across 28 pages and 5 viewports
* **Critical Severity (Horizontal overflow / Layout breaks):** 56 occurrences
* **Major Severity (Touch targets < 44px, Inputs < 16px, Unresponsive tables):** 378 occurrences
* **Medium Severity (Missing viewport-fit=cover, Sticky bar occlusion):** 120 occurrences
* **Minor Severity (Malayalam line-height < 1.5, Typography spacing):** 80 occurrences
* **Visual Screenshots Captured:** 280 screenshots archived in `tests/screenshots/audit/`

---

## 2. Comprehensive Defect Register by Page & Viewport

### 2.1 Horizontal Scroll & Viewport Overflow (CRITICAL)

On narrow screens (360px and 375px), horizontal scrolling disrupts mobile navigation and degrades user experience.

| Page | Device | Mode / Lang | Offending Element(s) | ScrollWidth vs Viewport | Screenshot File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin Login** | 360x740 | Light & Dark / EN & ML | `div.a-card`, `a.a-btn` (Fixed card padding & button margins) | 406 px vs 360 px (+46px) | `audit-admin-login-360x740-light-en.png` |
| **Admin Dashboard** | 360x740 | Light & Dark / EN & ML | Recent orders `table` (Min-width 640px forces table overflow) | 396 px vs 360 px (+36px) | `audit-admin-dash-360x740-dark-ml.png` |
| **Admin Orders List** | 360x740 | Light & Dark / EN & ML | `table` & `thead th` (Non-responsive multi-column table) | 464 px vs 360 px (+104px) | `audit-admin-orders-360x740-light-en.png` |
| **Admin Products List** | 360x740 | Light & Dark / EN & ML | `table` (Stock columns and action pills overflow container) | 485 px vs 360 px (+125px) | `audit-admin-products-360x740-dark-ml.png` |
| **Admin Customers List**| 360x740 | Light & Dark / EN & ML | `table` (Customer name, email, phone, orders table) | 633 px vs 360 px (+273px) | `audit-admin-customers-360x740-light-en.png` |
| **Admin Team Users** | 360x740 | Light & Dark / EN & ML | `select#newUserRole`, `table.a-table` | 541 px vs 360 px (+181px) | `audit-admin-users-360x740-dark-ml.png` |
| **Admin Audit Logs** | 360x740 | Light & Dark / EN & ML | `table` (Timestamp, actor, action, IP, details) | 612 px vs 360 px (+252px) | `audit-admin-audit-360x740-light-en.png` |
| **Size Guide** | 360x740 | Light & Dark / EN & ML | Size measurement `table`, `div.bg i` ambient shapes | 480 px vs 360 px (+120px) | `audit-size-guide-360x740-light-en.png` |
| **About Us** | 360x740 | Dark / ML | Floating ambient glow elements `div.bg i` (unconstrained right pos) | 387 px vs 360 px (+27px) | `audit-about-360x740-dark-ml.png` |
| **Admin Login** | 375x667 | Light & Dark / EN & ML | `div.a-card`, `a.a-btn` | 406 px vs 375 px (+31px) | `audit-admin-login-375x667-light-en.png` |
| **Admin Customers List**| 375x667 | Light & Dark / EN & ML | `table` | 633 px vs 375 px (+258px) | `audit-admin-customers-375x667-dark-ml.png` |
| **Admin Team Users** | 375x667 | Light & Dark / EN & ML | `table.a-table` | 541 px vs 375 px (+166px) | `audit-admin-users-375x667-light-en.png` |
| **Admin Audit Logs** | 375x667 | Light & Dark / EN & ML | `table` | 612 px vs 375 px (+237px) | `audit-admin-audit-375x667-dark-ml.png` |
| **Admin Customers List**| 390x844 | Light & Dark / EN & ML | `table` | 633 px vs 390 px (+243px) | `audit-admin-customers-390x844-light-en.png` |
| **Admin Team Users** | 390x844 | Light & Dark / EN & ML | `table.a-table` | 541 px vs 390 px (+151px) | `audit-admin-users-390x844-dark-ml.png` |

---

### 2.2 Touch Targets Under 44x44 CSS px (MAJOR)

Every interactive button, icon, link-button, and chip must meet the 44x44 CSS px standard with at least 8px spacing for reliable one-handed thumb use on mobile devices.

| Page / Component | Element Selector | Computed Size | Defect Details & Required Remediation | Screenshot File |
| :--- | :--- | :--- | :--- | :--- |
| **Header Announcement Bar** | `button.announce-x` | 32 x 32 px | Close button target is too small for thumbs; expand to 44x44px hit target | `audit-home-360x740-light-en.png` |
| **Header Language Switcher** | `a.tool.lang` | 38 x 36 px | Language button height is under 44px; increase min-height to 44px | `audit-home-360x740-dark-ml.png` |
| **Admin Top Navigation** | `nav a` | 31 x 34 px | Desktop nav links crammed into header; replace with bottom tab bar on mobile | `audit-admin-dash-360x740-dark-ml.png` |
| **Admin Action Buttons** | `button.a-btn--sm` | 36 x 34 px | "Small" buttons violate 44px touch rule; enforce 44px min-height | `audit-admin-products-360x740-light-en.png` |
| **Admin Quick Toggles** | `input[type="checkbox"]` | 18 x 18 px | Toggle active checkbox requires precise stylus/finger; wrap in 44px switch pill | `audit-admin-products-360x740-dark-ml.png` |
| **Product Detail Page (PDP)** | `button.size-chip` | 38 x 38 px | Size selection chips are cramped on 360px phones; increase to min 48x44px | `audit-product-360x740-light-en.png` |
| **Cart Quantity Stepper** | `button.qty-btn` | 32 x 32 px | Increment/decrement buttons too small; enlarge to 44x44px steppers | `audit-cart-360x740-light-en.png` |
| **Cart Remove Item** | `button.mini-cart-remove` | 34 x 28 px | Remove link is difficult to tap accurately; expand tap area | `audit-cart-360x740-dark-ml.png` |
| **Shop Filter Chips** | `button.chip` | 36 x 32 px | Category filter pills have insufficient touch target height | `audit-shop-360x740-light-en.png` |
| **Admin Table Pagination** | `a.a-page-link` | 34 x 34 px | Pagination buttons under 44px | `audit-admin-orders-360x740-light-en.png` |

---

### 2.3 Form Input Text Font Size < 16 px (MAJOR)

On iOS WebKit / Safari, focusing any input with a computed font size under 16px triggers an automatic viewport zoom that breaks layout alignment and requires manual pinch-out to reset.

| Page | Input Field | Computed Font Size | Cause & Remediation | Screenshot File |
| :--- | :--- | :--- | :--- | :--- |
| **Shop Catalog** | `input[name="q"]` (Search) | 13.6 px (0.85rem) | Search input uses small font; upgrade to 16px | `audit-shop-360x740-light-en.png` |
| **Cart Page** | `input.qty-input` | 14.4 px (0.9rem) | Quantity input triggers iOS zoom; upgrade to 16px | `audit-cart-360x740-light-en.png` |
| **Admin Orders List** | `input[name="search"]` | 14.0 px (0.875rem) | Admin order search zooms screen; upgrade to 16px | `audit-admin-orders-360x740-light-en.png` |
| **Admin Orders Filter** | `select[name="status"]` | 13.5 px (0.84rem) | Status dropdown triggers zoom; upgrade to 16px | `audit-admin-orders-360x740-dark-ml.png` |
| **Admin Product Form** | `input[name="stock"]` | 14.0 px | Size stock input triggers zoom; upgrade to 16px | `audit-admin-product-new-360x740-light-en.png` |
| **Admin Settings** | `input[name="shippingCharge"]` | 14.4 px | Shipping charge input triggers zoom; upgrade to 16px | `audit-admin-settings-360x740-dark-ml.png` |
| **Order Tracking** | `input[name="phone"]` | 15.0 px | Phone input triggers zoom; upgrade to 16px | `audit-track-360x740-light-en.png` |

---

### 2.4 Viewport Meta & Safe Area Insets (MEDIUM)

* **Admin Portal Layout (`src/views/layouts/admin.ejs`):**
  * Current: `<meta name="viewport" content="width=device-width, initial-scale=1">`
  * Missing: `viewport-fit=cover`
  * **Impact:** On modern iPhones and notched Android devices, content is clipped or forced into letterboxed gutters; safe-area insets (`env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`) evaluate to 0px.
  * **Fix:** Update to `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.

---

### 2.5 Unresponsive Desktop Tables in Admin (CRITICAL / MAJOR)

The admin panel currently renders desktop-oriented HTML `<table>` elements with `min-width: 640px`:
* **Orders (`/admin/orders`):** Contains Order ID, Date, Customer, Items, Total, Status, Courier, Actions. On mobile, this table extends 100px+ off-screen.
* **Products (`/admin/products`):** Contains Thumbnail, Title, Sizes, Stock, Price, Status, Actions.
* **Customers (`/admin/customers`):** Extends 273px off-screen at 360px width.
* **Team Users (`/admin/users`):** Extends 181px off-screen.
* **Audit Logs (`/admin/audit-logs`):** Extends 252px off-screen.
* **Remediation:** Under 640px, convert all tables to **stacked mobile cards** displaying key data upfront with one-tap action menus or bottom sheets.

---

### 2.6 Malayalam Typography & Line-Height (MINOR)

Malayalam script characters feature tall conjunct consonants, subscript signs, and superscript vowel markers (e.g., ക, ക്ഷി, ത്തു).
* **Current Line-Height:** Standard CSS line-height of 1.2 – 1.35 clips top and bottom vowel marks on headings and buttons.
* **Measured Violations:** Headings (`h1`, `h2`, `h3`) and `.btn` elements in Malayalam mode have line-height ratios between 1.15 and 1.35.
* **Remediation:** Enforce `line-height: 1.6` for all Malayalam content (`:lang(ml)` and `html[lang="ml"]`), with `word-break: break-word` and `hyphens: auto`.

---

### 2.7 Mobile Navigation Deficiencies (MAJOR)

* **Storefront:**
  * Top navigation bar hides essential links (`.main-nav, .tool.lang, .acct, .tool.wish`) behind a hamburger drawer on mobile.
  * Lacks a thumb-friendly **bottom navigation bar** (Home, Shop, Wishlist, Cart with badge, Account).
* **Admin Portal:**
  * Header displays 9 horizontal navigation links (`Dashboard`, `Products`, `Orders`, `Customers`, `Banners`, `Team`, `Settings`, `Diagnostics`, `Logout`) that wrap into 3 jagged rows on 360px screens.
  * Lacks a mobile **bottom tab bar** (`Dashboard`, `Orders`, `Products`, `More`).

---

### 2.8 Checkout on Mobile & Razorpay UPI Return (CRITICAL ARCHITECTURE DEFECT)

1. **UPI App Switching:** When paying with UPI (GPay, PhonePe, Paytm), mobile Android switches away from the browser to the native UPI app. When the customer returns, browser memory pressure may reload the page.
   * **Current State:** The checkout flow relies on an active JavaScript callback in the foreground. If the page reloads or the customer returns after completing UPI payment, the order status is lost.
   * **Required Fix (Phase 3):** Listen to `visibilitychange` and `pageshow`, query a signed status endpoint with order token stored in `sessionStorage`, poll every 3 seconds for up to 2 minutes, and show a calm "Confirming your payment..." screen.
2. **Missing Sticky Action Bar:** The checkout page requires extensive vertical scrolling to reach the "Place order" button; must introduce a sticky bottom bar with total and Pay button.

---

### 2.9 Performance & Core Web Vitals under 4x CPU & Slow 4G

* **Hero Image:** Largest Contentful Paint (LCP) takes ~3.2s on Slow 4G when full 1200px image is fetched on a 360px device.
* **Remediation:** Introduce responsive `<picture>` with 400px and 800px WebP/AVIF variants, `fetchpriority="high"` for the LCP image, and lite mode for weak devices (`class="lite"`).

---

## 3. Evidence Artifacts & Screenshot Catalog

All 280 audit screenshots are permanently preserved in the repository under `tests/screenshots/audit/`. Key representative screenshots documenting specific defects:

1. `audit-admin-login-360x740-light-en.png` — Proves horizontal overflow (+46px) and button clipping on Admin Login.
2. `audit-admin-dash-360x740-dark-ml.png` — Proves table overflow on Admin Dashboard recent orders.
3. `audit-admin-orders-360x740-light-en.png` — Proves 640px table overflowing 360px viewport on Admin Orders.
4. `audit-admin-customers-360x740-dark-ml.png` — Proves extreme table overflow (+273px) on Customers list.
5. `audit-size-guide-360x740-light-en.png` — Proves size guide table overflow (+120px) on storefront.
6. `audit-shop-360x740-light-en.png` — Proves search input font < 16px (13.6px) and lack of bottom sheet filters.
7. `audit-product-360x740-light-en.png` — Proves small size chips (38px) and missing sticky add-to-cart bar.
8. `audit-cart-360x740-light-en.png` — Proves 32px quantity stepper buttons.
9. `audit-checkout-360x740-dark-ml.png` — Proves missing sticky checkout bar and Malayalam button text wrapping.
10. `audit-admin-users-360x740-light-en.png` — Proves role selector overflow and small delete action buttons.

---

## 4. Remediation Plan by Phase

* **Phase 1: Mobile Foundations (All Pages):**
  * Update viewport meta with `viewport-fit=cover`.
  * Replace `vh` with `dvh` / `svh`.
  * Safe-area insets (`env(safe-area-inset-*)`) on all bars.
  * Enforce 44x44px min tap targets and 16px min input font size across all CSS.
  * Fluid typography with `clamp()`, `line-height: 1.6` for Malayalam.
  * Back button history state for drawers and sheets.
* **Phase 2: Storefront on Mobile:**
  * Add bottom navigation bar (Home, Shop, Wishlist, Cart, Account).
  * 2-column shop grid, bottom sheet filters, search clear button.
  * Swipeable gallery, bottom sheet size guide, sticky Add to Cart bar.
* **Phase 3: Checkout on Mobile:**
  * Single-column checkout with collapsing summary and sticky Pay bar.
  * UPI return-and-poll flow with `visibilitychange`, `sessionStorage`, and signed status endpoint.
* **Phase 4: Customer Account on Mobile:**
  * Google sign-in redirect flow on mobile.
  * Single-column address and order cards with WhatsApp support button.
* **Phase 5: Admin Panel on Mobile:**
  * Bottom tab bar (Dashboard, Orders, Products, More).
  * Stacked cards instead of tables for Orders, Products, Customers, Users, Audit Logs.
  * Client-side image resize (`createImageBitmap` + canvas to max 2000px) before upload.
* **Phase 6: PWA & Admin Web Push Alerts:**
  * Dual manifests (Storefront + Admin) and service worker with strict caching boundaries.
  * Web Push notifications for new paid orders.
* **Phase 7: Performance & Lite Mode:**
  * Bundle budgets, responsive `<picture>` srcset, `class="lite"` for low-end hardware.
* **Phase 8: Comprehensive Tests & CI:**
  * Automated tests across all mobile viewports, Light/Dark, EN/ML, UPI flows, and performance budgets.
