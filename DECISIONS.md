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
