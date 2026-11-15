# Architecture and Design Decisions (DECISIONS.md)
**Project:** Nest by Ammakkili – Premium E-commerce & Admin Panel for Women's Nighties

This document logs all key assumptions, technical trade-offs, and architectural choices made during development.

---

### 1. Security & CSRF Strategy
- **Choice:** Standard double submit cookie / secure token validation using `csrf-csrf` paired with `cookie-parser`.
- **Reason:** Legacy `csurf` is deprecated. `csrf-csrf` is modern, secure, works seamlessly with Express forms, AJAX/Fetch headers, and avoids memory leaks.
- **Webhook Exemption:** `POST /webhooks/razorpay` is excluded from CSRF and uses raw body capture (`express.raw()`) for cryptographic HMAC SHA-256 signature verification matching Razorpay's exact signature protocol.
- **Checkout API & Server Validation:** Client prices are strictly ignored. The server re-queries MongoDB for products, sizes, and stock, calculates exact amounts in paise, and enforces that sizes cannot be altered post-order.

### 2. Styling & Glassmorphic Visual System
- **Source of Truth:** Converted the approved `nest-glass.html` into a modular stylesheet `public/css/glass.css` with semantic CSS variables and EJS partials.
- **Color Palette:**
  - Crimson Velvet: `#892245`
  - Rosy Dusk: `#C0567B`
  - Blush Nectar: `#D6879F`
  - Petal Cloud: `#DB9AAD`
  - Deep Plum text: `#2B1620`
  - Warm Off-white / Soft Pink gradient background: `#FFF1F5` to `#F2BFD0`
- **Fallbacks & A11y:**
  - Solid surface fallbacks (`rgba(255, 255, 255, 0.95)`) when `backdrop-filter` is unsupported.
  - Full support for `prefers-reduced-motion` (disables ambient mesh float and 3D tilts).
  - Dark mode variables toggled by system preference and `[data-theme="dark"]`.
  - Responsive safe-area insets (`env(safe-area-inset-top)` / `bottom`) for mobile notches and home bars.

### 3. Database & Mongoose Models
- **Order ID Format:** `NEST-` followed by an uppercase sequential/epoch identifier (e.g., `NEST-100234`).
- **Atomic Stock Management:** Decrements stock using `$inc: { "sizes.$.stock": -quantity }` with a condition `sizes.stock: { $gte: quantity }` during payment verification. If stock fails, order status moves to payment issue / refund review instead of leaving inventory negative.
- **Settings Singleton:** Cached in memory with a short TTL (or loaded per request via middleware) to store flat shipping charges (default ₹60), WhatsApp business number, low stock thresholds, and announcement banners.

### 4. Internationalization (English & Malayalam)
- **Mechanism:** Lightweight i18n middleware reading `locales/en.json` and `locales/ml.json`.
- **Language Detection:** Preference stored in cookie `nest_lang` (defaults to `en`).
- **Content Fields:** `name.en`, `name.ml`, `description.en`, `description.ml`. Fallback helper `getLocalized(field, lang)` defaults to English if Malayalam text is empty.
- **Review Log:** All Malayalam translations are documented in `locales/ml.REVIEW.md` for native speaker review before commercial launch.

### 5. Payment & Webhooks
- **Default Mode:** Razorpay Test Mode with test keys. Switching to Live only requires updating `.env` keys.
- **Automatic Expiration Job:** A `node-cron` background job runs every 10 minutes to scan for pending orders created more than 30 minutes ago and mark them `failed`.

### 6. Image Uploads
- **Multer + Cloudinary:** Cloudinary storage used if `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are provided. Otherwise, seamlessly falls back to saving to local `public/uploads/` with public serving.

### 7. Customer Accounts & Google OAuth 2.0
- **Strict Role Separation:** Admin sessions are managed via `req.session.adminId`. Customer sessions are managed via Passport user serialization (`req.user`). The two scopes are completely isolated: customer sessions can never access `/admin`, and admin credentials do not grant customer privileges.
- **Open Redirect Prevention:** All return addresses in `returnTo` parameters are strictly checked via `safeReturnUrl`: only relative paths starting with a single `/` (and not `//` or `/\`) are accepted.
- **Verified Emails Only:** The OAuth callback strictly requires `profile.emails[0].verified !== false` to ensure email legitimacy.
- **Right to Erasure / GDPR:** When a customer triggers "Delete My Account", their profile, saved addresses, and synced wishlist are permanently purged, and their Google ID is severed. Historical orders are preserved for GST/accounting compliance but detached (`customerId: null`).
- **Development & Test Mode:** If placeholder Google credentials are used in `.env`, a simulated authentication endpoint `/auth/google/test-login` allows seamless automated testing of account flows and saved addresses.

### 8. Official Brand & Medallion Logo Integration (Section 3A)
- **Asset Placement:** Client logo assets from `logo-assets.zip` extracted to `public/img/brand/` containing all multi-resolution files (1024, 512, 256, 128, webp, icons, og-image).
- **Legibility Rules:**
  - Header displays `logo-full-256.png` (with `logo-full-512.webp` and `srcset`) at 56px minimum alongside wordmark on desktop, shortening the subtitle on phones while preserving clear space (> 8% of diameter) and never dropping below legible resolution.
  - Home Hero and About pages feature large 260px medallion renderings in glass frames with 3D tilt and specular shine.
  - Footer and Admin Login display the 100px+ medallion inside a protective glass ring that ensures high contrast in both light and dark themes.
  - Packing slips and confirmation pages prominently feature the round medallion at the top.
  - Browser icons configured with `favicon.ico`, `favicon-32.png`, `favicon-16.png`, `apple-touch-icon-180.png`, and a valid PWA `site.webmanifest` with maskable 512x512 icon.
  - Default social sharing (`og:image` and Twitter card) set to `og-image-1200x630.png`.
  - Site-wide `Organization` schema in JSON-LD references the high-resolution logo.

### 9. Sample Products & Storefront Placeholders Integration
- **Asset Placement:** 8 nighty SVG illustrations copied to `public/img/products/` as placeholder visuals.
- **Idempotent Seeding:** `scripts/seed.js` reads `data/products.sample.json` and upserts products by `slug`. Re-running the seed script never creates duplicate products; the database maintains exactly 8 sample items.
- **Data Model:** Added `isSample: { type: Boolean, default: false, index: true }` to `src/models/Product.js`.
- **Admin Panel Features:**
  - Displays a "Sample" badge next to sample products in the admin inventory table.
  - Displays an administrative advisory banner on the dashboard while sample items are present: *"Sample designs. Replace with real photos before launch."*
  - Includes a *"Delete all sample products"* action with confirmation to bulk purge only products with `isSample: true`, preserving any real products.
  - When an admin uploads real photos while editing a sample product, the product automatically transitions to `isSample: false`.
- **Customer Storefront Rules:**
  - Product cards present the first image in an arch-shaped photo frame (4:5 aspect ratio, `object-fit: cover`) with style in small caps, name, price, badge tag, and wishlist heart.
  - Urgency & low-stock indicators (e.g., *"Only 2 left in XL"*) dynamically display when inventory in any size is $\le 3$. Sold out sizes ($\text{stock} = 0$, such as 3XL in Cloud Soft Nighty) are disabled on the product page.
  - Hero featured product dynamically highlights the first active design marked `featured: true` (Rose Garden Nighty) in an arch frame with glass caption bar. Brand logo is strictly kept in the header and footer, not duplicated in the hero.
  - The customer-facing storefront strictly suppresses all internal sample labels and notices.

### 10. Cart & Wishlist Single Source of Truth & Storage Validation
- **Unified Cart Module (`public/js/cart-store.js`):**
  - Manages browser cart under the single localStorage key `'nest_cart'` with try/catch wrapping around every access.
  - Data structure: array of `{ productId, size, qty }`.
  - Header badge count strictly represents the sum of quantities of valid items.
  - Defaults to `0` with attribute `data-zero="true"`; styled with `.badge[data-zero="true"] { display: none !important; }` to prevent any hardcoded or phantom badge rendering.
  - Cross-tab synchronization via `window.addEventListener('storage')`.
- **Live Server Cart Validation (`POST /cart/validate`):**
  - On every page load, `CartStore.init()` validates stored items against live MongoDB inventory.
  - Server returns only items whose product exists, is active (`active: true`), has that size, and has positive stock (`stock > 0`).
  - Stale/deleted products and out-of-stock items are automatically purged from client storage, updating the badge in real time.
  - When unavailable items are pruned, a customer toast is triggered: *"Some items are no longer available and were removed from your cart."*
  - On the cart page, invalid items are pruned and the UI immediately renders either valid line totals or the empty cart state.
- **Order Completion Cleanup:**
  - `CartStore.clear()` is called both upon successful payment verification and during confirmation page render (`/checkout/confirmation/:id`), guaranteeing 0 items and badge disappearance.
- **Unified Wishlist Module (`public/js/wishlist-store.js`):**
  - Manages client wishlist under `'nest_wish'` with try/catch wrappers.
  - Validates IDs against `GET /api/wishlist-items?ids=...`, synchronizing badge count, card heart buttons, and pruning deleted products.

### 11. Compact, Classy Footer
- **Layout & Dimensions:** Replaced the previous tall footer with a slim, compact structure (~170 to 200px desktop height). Single main row followed by a hairline separator and a minimal bottom bar.
- **Brand Lockup:** 56px circular medallion logo (with 128w and 256w srcset) alongside "Nest / BY AMMAKKILI" in uppercase typography. Logo container defaults to a subtle rose-gold/bronze ring rather than a stark white circle if images are loading slowly.
- **Navigation:** 9 short links (Shop, Size Guide, How to Order, About, WhatsApp Support, Track Order, Wishlist, Terms, Privacy Policy) wrapping into two tidy lines in the center column.
- **Social & Utilities:** Compact round icon buttons for YouTube and WhatsApp (using `whatsappNumber` from store Settings), plus an accessible theme toggle pill ("Theme: Dark" / "Theme: Light") hooked to the existing `header.js` handler.
- **Bottom Bar:** Shows `<%= new Date().getFullYear() %> Nest by Ammakkili. All rights reserved.` and the core shop rules: *"Prepaid orders only · No returns or exchanges · Delivery across India"*.
- **Admin Access:** Public "Admin Access" link strictly excluded from public storefront footer.

### 12. Full Dark Theme for Admin Panel
- **Dedicated Stylesheet (`public/css/admin-dark.css`):**
  - Strict dark theme applied to all admin pages via `<body class="admin">` and loaded last in `layouts/admin.ejs` and `admin/login.ejs`.
  - Color palette: Near-black plum background (`#160B12`, `#1F111B`), soft rose-gold lines and accents (`#EDA9BC`, `#C0567B`, `#892245`), warm off-white typography (`#FDF2F4`, `#C3A4B1`).
  - Active `color-scheme: dark` ensures native browser controls (calendar/date pickers, dropdown popups, scrollbars) render in dark mode.
- **Structural Integrity:**
  - Header is the immediate first child of `<body>` with `<nav>` directly inside and `aria-current="page"` dynamically set on the active section tab.
  - Form helpers: `.a-wrap`, `.a-card`, `.a-form`, `.a-grid-2`, `.a-field`, `.a-drop`, `.a-check`, `.a-stats`, `.a-stat`, `.a-btn`, `.a-btn--ghost`, `.a-btn--danger`, `.a-btn--sm`, `.a-table-wrap`, `.a-back`.
  - Status indicators: `.a-pill` with color-coded modifiers for `a-pill--ok` (paid, delivered), `a-pill--warn` (pending_payment), `a-pill--info` (packed), `a-pill--vio` (shipped), `a-pill--bad` (cancelled, failed), and `.a-sample` for demo inventory.
- **Responsive Adaptability:** `.a-grid-2` collapses from 2 columns to 1 column on screens $\le 700\text{px}$. Responsive table wrapper `.a-table-wrap` enables horizontal scrolling without breaking outer card borders.

### 13. Cart Page Architecture, CSRF Configuration & Theme Flash Prevention
- **Cart Page Template Cleanup:**
  - Completely purged all inline `<script>` tags and trailing stray code text (`document.addEventListener('DOMContentLoaded', renderCartView); })(); </script>`) from `src/views/pages/cart.ejs`.
  - Replaced the starting HTML in `#cart-container` with `<p style="font-size:1.1rem;">Loading your cart...</p>` so non-empty carts never flash an empty message during initial parse.
- **Client Cart Page Script (`public/js/cart-page.js`):**
  - Copied `cart-page.js` exactly as provided and loaded with `defer` directly after `/js/cart-store.js` in `src/views/layouts/main.ejs`.
  - Subscribes to `cart:updated`, `storage`, and `pageshow` events to automatically re-render cart items with full order summary and return policies.
  - On network failures or offline mode, displays *"We could not load your cart. Please try again."* with a retry button instead of erroneously drawing an empty cart.
- **Cart Store Unified API (`public/js/cart-store.js`):**
  - Strictly exposes `getItems()`, `validate(cb)`, `removeItem(productId, size)`, and `updateQty(productId, size, qty)`.
  - Dispatches `"cart:updated"` CustomEvent on `window` after every local or server-driven state change (addition, removal, quantity increment/decrement, clearing, and invalid item pruning).
  - Retrieves the active CSRF token from `<meta name="csrf-token">` and sends `x-csrf-token` on every validation request.
- **Cart Validation API Contract (`POST /cart/validate`):**
  - Returns `{ items: [{ productId, slug, name, image, size, price, qty, stock, lineTotal }], subtotal, shipping, total, removed: [] }`.
  - Items are uniquely identified by `productId + size`.
  - `image` provides the first product illustration or fallback medallion. Flat shipping is read from store Settings.
  - Unavailable products or sizes are returned in `removed: [...]`, triggering client toast notification: *"Some items are no longer available and were removed."*
- **CSRF Token Resolution:**
  - Fixed `csrf-csrf` `doubleCsrf` initialization in `src/middleware/csrf.js` by supplying `getSessionIdentifier` and mapping `generateCsrfToken`.
  - Injected non-empty CSRF tokens across all views via `<meta name="csrf-token">` and verified that JSON API POST requests return 200 OK without 403 CSRF rejections.
- **Asset and Theme Flash Prevention:**
  - Removed missing `<link rel="icon" type="image/svg+xml" href="/img/logo.svg">` from `<head>`.
  - Removed hard-coded `data-theme="light"` on `<html>`. Added synchronous `<head>` script reading `localStorage.getItem('nest_theme')` (wrapped in try/catch) with fallback to `window.matchMedia('(prefers-color-scheme: dark)')` to prevent theme flash before initial paint.
  - Deferred client script execution across `checkout.ejs`, `confirmation.ejs`, `wishlist.ejs`, and `product.ejs` using `DOMContentLoaded` guards so stores are guaranteed to be initialized when code executes.

### 14. Sticky Footer & Single-Line Theme Pills
- **Sticky Footer Flexbox Layout:**
  - In `public/css/glass.css`:
    ```css
    html { height: 100%; }
    body {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
    }
    body > main { flex: 1 0 auto; }
    body > .announce, body > .site-header, body > .site-footer { flex: none; }
    ```
  - Keeps the 80px top margin on `.site-footer` (64px on mobile) so short pages (`/track-order`, `/cart`, `/wishlist`, `/login`, empty states) anchor the footer firmly to the bottom of the viewport with no floating gaps, while longer pages (`/`, `/shop`) maintain natural flow directly below content.
- **Single-Line Theme Pills:**
  - In `public/css/footer.css`: updated `.ft-theme` to `display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; padding: 0 16px; border-radius: 999px; white-space: nowrap;`.
  - In `public/css/header.css`: updated `.pill` to `display: flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap;` keeping height, border, background, and colors intact.
  - Prevents "Theme: Dark" / "Theme: Light" from wrapping onto two lines on any viewport width.



