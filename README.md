# Nest by Ammakkili – Premium E-commerce & Admin Platform

A production-ready e-commerce platform and management panel tailored for **Nest by Ammakkili**, an artisanal online brand specializing in women's nighties with bilingual support (English and Malayalam), glassmorphic aesthetics, prepaid-only checkout via Razorpay, atomic inventory control, and dedicated WhatsApp support.

---

## 🌸 Key Features & Business Rules

1. **Intimate Wear Business Rules:**
   - **Prepaid Orders Only:** Cash on Delivery (COD) is strictly disabled across the entire system.
   - **No Returns or Size Exchanges:** Clear policy notices displayed on Home, Shop, Product, Cart, Policies, and a mandatory confirmation checkbox at Checkout.
   - **WhatsApp-Only Support:** Customer support operates exclusively via direct WhatsApp links with pre-filled order metadata; voice call invitations are strictly prohibited.
   - **Flat ₹60 Shipping:** Flat shipping fee per order dynamically configurable in the Admin Settings panel.
   - **Authentic Social Showcase:** Direct integration with the official YouTube channel (`https://www.youtube.com/@nestammakkili`) for fabric drape and fit videos.

2. **Design System & Glassmorphism:**
   - Exact implementation of the approved `nest-glass.html` aesthetic converted into modular EJS layouts and `public/css/glass.css`.
   - Palette: Crimson Velvet (`#892245`), Rosy Dusk (`#C0567B`), Blush Nectar (`#D6879F`), Petal Cloud (`#DB9AAD`), Deep Plum text (`#2B1620`).
   - Dynamic 3D tilt and light flare on product cards (fine pointers only; automatically respects `prefers-reduced-motion`).
   - Interactive Bust Calculator for honest sizing with recommendation logic.
   - Safe-area insets (`viewport-fit=cover`) and responsive mobile-first UI for 360px+ phones.
   - Dark and Light theme toggle stored in `localStorage`.

3. **Bilingual (English & Malayalam):**
   - Full bilingual UI managed via `locales/en.json` and `locales/ml.json`.
   - Header language toggle (`EN | മലയാളം`) remembered in a cookie (`nest_lang`).
   - Localized product models (`name.en`, `name.ml`, `description.en`, `description.ml`) with seamless English fallback.
   - Dedicated `locales/ml.REVIEW.md` checklist for native speaker verification prior to launch.

4. **Security & Payment Gateway (Razorpay):**
   - **Zero Client Price Trust:** Server re-fetches products from MongoDB, recalculates line items and totals, and creates orders in paise with `pending_payment`.
   - **Atomic Stock Decrement:** Stock is decremented using `$inc: { "sizes.$.stock": -quantity }` with `{ "sizes.stock": { $gte: quantity } }` condition upon HMAC SHA-256 signature verification.
   - **Idempotent Webhooks:** `POST /webhooks/razorpay` verifies signatures against the raw request body; repeated notifications will never double-decrement inventory.
   - **Automatic Order Expiration:** A background cron job automatically marks pending orders older than 30 minutes as `failed`.
   - **Rate Limiting & CSRF:** Powered by `express-rate-limit`, `helmet` CSP (whitelisting Razorpay Checkout, Google Fonts, YouTube), and `csrf-csrf`.

5. **Admin Console (`/admin`):**
   - Password hashing via `bcryptjs` and session persistence with `connect-mongo`.
   - Analytics dashboard with today's orders, weekly/monthly revenue, orders awaiting packing, and low-stock warnings.
   - Complete product management with multiple image uploads (Cloudinary or local fallback), per-size inventory table (M, L, XL, XXL, 3XL), and featured toggles.
   - Order management with courier/tracking updates, one-click WhatsApp customer status messaging, printable packing slips, and CSV export.
   - Festival announcement banner scheduling (e.g., Onam, Vishu, Christmas).

---

## 🛠️ Tech Stack

- **Runtime:** Node.js 20+ (CommonJS)
- **Framework:** Express 4.x
- **Database:** MongoDB with Mongoose
- **View Engine:** Server-rendered EJS with `express-ejs-layouts`
- **Frontend Interactivity:** Modern Vanilla JavaScript (no heavy runtime framework)
- **Authentication:** `express-session` with `connect-mongo` and `bcryptjs`
- **Security:** `helmet` (CSP configured for Razorpay & YouTube), `express-rate-limit`, `csrf-csrf`, `cookie-parser`
- **Payments:** Official `razorpay` Node SDK
- **File Uploads:** `multer` with Cloudinary (seamless fallback to local `public/uploads`)

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20 or higher
- MongoDB instance running locally (`mongodb://127.0.0.1:27017`) or a free MongoDB Atlas cluster

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone <repo-url> ammakaili
cd ammakaili
npm install
```

### 3. Environment Variables
Copy the example environment configuration:
```bash
cp .env.example .env
```
Fill in the parameters:
```env
PORT=3000
NODE_ENV=development
SITE_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://127.0.0.1:27017/nest_ammakkili

# Security & Sessions
SESSION_SECRET=your_long_random_session_secret_here
CSRF_SECRET=your_32_character_csrf_secret_string_here!

# Razorpay Test / Live Keys
RAZORPAY_KEY_ID=rzp_test_nestammakkili123
RAZORPAY_KEY_SECRET=rzp_secret_nestammakkili_test
RAZORPAY_WEBHOOK_SECRET=rzp_webhook_secret_test

# Cloudinary (Optional - leaves empty to use local storage in public/uploads)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Seed Admin Credentials
ADMIN_EMAIL=admin@nestammakkili.com
ADMIN_PASSWORD=AdminNest2026!

# Business Contact (Without '+' or spaces, with country code)
WHATSAPP_NUMBER=919876543210
```

### 4. Seed Database & Assets
Generate placeholder SVG designs and seed the initial admin account, default settings, seasonal banner, and 6 demo nighties:
```bash
npm run seed
```

### 5. Run the Server
Start in production mode:
```bash
npm start
```
Or start in development mode with automatic restart:
```bash
npm run dev
```

Visit the online shop: [http://localhost:3000](http://localhost:3000)  
Visit the admin console: [http://localhost:3000/admin](http://localhost:3000/admin)  
Default Admin Login:
- **Email:** `admin@nestammakkili.com`
- **Password:** `AdminNest2026!`

---

## 💳 Testing Razorpay Payments

1. **Test Mode by Default:**
   - In development, the application operates in test mode. If placeholder test credentials are used, the checkout modal automatically simulates payment authorization, signs the payment token, and triggers server-side verification.
   - To connect your own live or test Razorpay gateway, set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`.
2. **Switching to Production:**
   - Replace `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` with your Live Mode keys from your Razorpay Dashboard.
   - Configure Webhook URL in Razorpay Dashboard to `https://your-domain.com/webhooks/razorpay` with event `payment.captured` and `payment.failed`, and set `RAZORPAY_WEBHOOK_SECRET`.

---

## 🌐 Production Deployment Guide

### Deploying on Render / Railway / Fly.io:
1. Create a MongoDB database on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Connect your Git repository to Render as a **Web Service**.
3. Set Build Command: `npm install`
4. Set Start Command: `npm start`
5. Configure Environment Variables in the service settings matching `.env.example`.
6. Run `npm run seed` once from the Render Shell or deployment hook.

### Deploying on a Linux VPS (Ubuntu with Nginx & PM2):
1. Install Node.js 20 and PM2:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm
   sudo npm install -g pm2
   ```
2. Clone repository, create `.env`, and install packages:
   ```bash
   cd /var/www/ammakaili
   npm install --production
   npm run seed
   ```
3. Start process with PM2:
   ```bash
   pm2 start src/server.js --name "nest-ammakkili"
   pm2 save && pm2 startup
   ```
4. Configure Nginx reverse proxy with SSL (Certbot) forwarding port `80/443` to `http://127.0.0.1:3000`.

---

## 🧪 Verification & Acceptance Checklist

| Test Item | Expected Result | Verified |
|---|---|---|
| **Browse & Filter** | Shop filters by style (Cotton, Satin, Printed, Plain), search query, and sorts by price. | ✅ Yes |
| **Bust Calculator** | Size guide calculates recommended size for measurements between 30" and 56". | ✅ Yes |
| **Cart & Stock** | Out-of-stock sizes disabled. Live stock limits respected. | ✅ Yes |
| **Price Tampering** | Manipulated client prices in POST payloads are discarded; verified DB price charged. | ✅ Yes |
| **Atomic Inventory** | Stock atomically reduced by exact ordered quantity upon payment confirmation. | ✅ Yes |
| **Idempotency** | Duplicate payment verification calls do not double-decrement inventory. | ✅ Yes |
| **Order Confirmation** | Confirmation page displays "Send order details on WhatsApp" with prefilled link. | ✅ Yes |
| **Order Tracking** | Customer enters readable Order ID (e.g. `NEST-000123`) and phone to check status. | ✅ Yes |
| **Admin Fulfillment** | Admin can change order status, add tracking info, print packing slip, and export CSV. | ✅ Yes |
| **Bilingual Toggle** | Switching between English and Malayalam seamlessly translates all storefront text. | ✅ Yes |
