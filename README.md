# Nest by Ammakkili – Premium E-commerce & Admin Platform

A production-ready e-commerce platform and management panel tailored for **Nest by Ammakkili**, an artisanal online brand specializing in women's nighties with bilingual support (English and Malayalam), glassmorphic aesthetics, prepaid-only checkout via Razorpay, atomic inventory control, and dedicated WhatsApp support.

---

## ⚖️ Legal Policies & Compliance Notice

> [!IMPORTANT]
> **LEGAL NOTICE FOR CLIENT & OPERATORS:**
> All public legal documents and storefront policy pages (`/about`, `/contact`, `/pricing`, `/shipping`, `/terms`, `/privacy`, `/refund-policy`, `/grievance`) are structured templates designed to meet Indian Consumer Protection (E-Commerce) Rules, 2020, Information Technology Act, 2000, and Razorpay onboarding standards.
> 
> **These policies are templates and must be reviewed and approved by the client's legal or tax advisor prior to real customer sales.** Once verified and confirmed in the Admin Store Settings (`/admin/settings`), the owner can check the legal confirmation checkbox to certify production readiness.

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

# Admin Owner Google Account (Allowlisted Owner - zero passwords stored)
ADMIN_OWNER_EMAIL=your-owner-email@gmail.com

# Business Contact (Without '+' or spaces, with country code)
WHATSAPP_NUMBER=919876543210
```

### 3.1 Razorpay Payment Gateway Setup

To enable prepaid checkout via Razorpay:

1. **Obtain Test Credentials:**
   - Log into your [Razorpay Dashboard](https://dashboard.razorpay.com/).
   - Switch the toggle at the top navigation to **Test Mode**.
   - Navigate to **Settings** → **API Keys** → **Generate Test Key**.
   - Copy your `Key ID` (starts with `rzp_test_`) and `Key Secret`.
   - (Optional for webhooks) Navigate to **Settings** → **Webhooks** and configure a webhook secret.

2. **Configure in `.env`:**
   ```env
   RAZORPAY_KEY_ID=rzp_test_yourKeyIdHere
   RAZORPAY_KEY_SECRET=yourKeySecretHere
   RAZORPAY_WEBHOOK_SECRET=yourWebhookSecretHere
   ```

3. **Automatic Startup Validation:**
   - During startup in non-production environments (`development`), the server runs a harmless, read-only API check (`orders.all({ count: 1 })`).
   - If valid, the console displays:
     ```
     Razorpay keys OK (test mode)
     ```
   - If invalid, the console clearly displays:
     ```
     Razorpay keys INVALID: <reason>
     ```
   - API secrets are strictly protected and never printed in server logs or rendered in HTML.

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

### Admin Authentication:
- Admin access is strictly authenticated via **Google Sign-In with an allowlist** (`AdminUser` collection). There are zero passwords, password fields, or password-hashing mechanisms.
- The initial owner is automatically provisioned on first startup from `ADMIN_OWNER_EMAIL`.
- Unlisted Google accounts receive a generic 403 "Not Authorised" response with zero information leakage.

---

## 🎨 Official Brand & Logo Guidelines (Section 3A)

The brand identity centers on the client's embossed bronze and crimson medallion reading *"NEST By Ammakkili, Online Nighty Shop"*.

- **Assets Location:** All official source assets are housed in [`public/img/brand/`](file:///c:/Users/karth/OneDrive/Desktop/karthi/zero/ammakaili/public/img/brand/).
- **Header:** Employs the medallion at 56px (`srcset` 128w/256w/512w with WebP support) with clear space (> 8%) beside the wordmark; automatically collapses subtitle on mobile.
- **Hero & About:** Showcases the large medallion (260px+) in a responsive glass frame with interactive 3D pointer tilt.
- **Footer & Admin Login:** Renders the full medallion in high-contrast glass rings.
- **Device Icons & PWA:** Configured in `<head>` and [`public/site.webmanifest`](file:///c:/Users/karth/OneDrive/Desktop/karthi/zero/ammakaili/public/site.webmanifest) with maskable 512px icon.
- **Social Sharing:** Default Open Graph image set to [`og-image-1200x630.png`](file:///c:/Users/karth/OneDrive/Desktop/karthi/zero/ammakaili/public/img/brand/og-image-1200x630.png).

---

## 🔑 Setting Up Google OAuth 2.0 ("Sign in with Google")

To allow customers to sign in with their Google accounts:

1. **Go to Google Cloud Console:**
   - Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. **Configure the OAuth Consent Screen:**
   - Navigate to **APIs & Services > OAuth consent screen**.
   - Select **External** user type and click **Create**.
   - Enter your App Name ("Nest by Ammakkili"), User support email, and Developer contact email.
   - Under Scopes, add `userinfo.email` and `userinfo.profile`.
   - **Crucial Note:** While in "Testing" mode, only approved test users can sign in. Before launching to real shoppers, you must click **Publish App** on the OAuth consent screen.
3. **Create OAuth Client ID Credentials:**
   - Navigate to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
   - Choose Application type: **Web application**.
   - Under **Authorised redirect URIs**, add:
     - For customer local development: `http://localhost:3000/auth/google/callback`
     - For customer production: `https://nestammakkili.com/auth/google/callback`
     - For admin local development: `http://localhost:3000/admin/auth/google/callback`
     - For admin production: `https://nestammakkili.com/admin/auth/google/callback`
   - Click **Create** and copy your **Client ID** and **Client Secret**.
4. **Update `.env`:**
   ```env
   GOOGLE_CLIENT_ID=your_actual_google_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_actual_google_client_secret
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   REQUIRE_LOGIN_AT_CHECKOUT=false
   ```

---

## 🔐 Admin Authentication, Google Allowlist & Team Management

Admin access to Nest by Ammakkili is strictly protected via **Google Sign-In with an allowlist** (`AdminUser` collection). There are zero passwords, password fields, or password-hashing mechanisms.

### 1. Setting the Initial Owner (`ADMIN_OWNER_EMAIL`)
- In your `.env`, define the store owner's Google account:
  ```env
  ADMIN_OWNER_EMAIL=your.owner.email@gmail.com
  ```
- On server startup, if no owner exists in MongoDB, the system automatically provisions an active `owner` account with this email.
- In production, `src/utils/envGuard.js` verifies that `ADMIN_OWNER_EMAIL` is set and is a valid email; the server will halt on boot if missing or invalid.
- **Never hardcode emails in source code.**

### 2. Configuring Google OAuth Client for Admin Sign-In
In your Google Cloud Console OAuth 2.0 Client credentials:
- Add the dedicated admin callback endpoints to **Authorised redirect URIs**:
  - **Local Development:** `http://localhost:3000/admin/auth/google/callback`
  - **Production:** `https://nestammakkili.com/admin/auth/google/callback`
- The admin flow enforces PKCE (SHA-256 code challenge/verifier), OpenID Connect `nonce` verification, state clearing on consumption, and automatic redirect URI resolution.

### 3. Adding and Managing Administrators
- Log in to `/admin` as an Owner and navigate to **Admin Team** (`/admin/users`).
- Enter the new administrator's Gmail or Google Workspace email, select their role (`staff` or `owner`), and click **Grant Access**.
- **Role Privileges:**
  - `owner`: Full privileges (product management, orders, customer exports, refunds, store settings, legal confirmations, admin team management, audit logs).
  - `staff`: Operational duties (products, photos, orders, fulfillment). Blocked with 403 on Settings, business details, refunds, customer exports, and admin team management.
- **Sensitive Action Gating (5-Minute Fresh Auth):**
  - Adding/modifying/removing admins, changing store/legal settings, or issuing refunds requires a fresh Google sign-in within the last 5 minutes.
  - If the last sign-in is older than 5 minutes, the admin is automatically redirected to Google's account chooser (`prompt=select_account`) and returned seamlessly to the action upon verification.
- **Safety Invariant:**
  - The last active owner can **never** be deleted, deactivated, or demoted to staff.
  - Deactivated admins lose access immediately on their next HTTP request.

### 4. Break-Glass Emergency CLI Commands
If all owners lose Google OAuth access, administrative access can be audited and managed directly via terminal commands (requires SSH/server shell access):
- **List all admins:**
  ```bash
  npm run admin:list
  ```
- **Grant or promote an admin:**
  ```bash
  npm run admin:grant -- colleague@gmail.com owner
  npm run admin:grant -- staffmember@gmail.com staff
  ```
- **Revoke an admin immediately:**
  ```bash
  npm run admin:revoke -- email@gmail.com
  ```
All CLI actions are recorded in the audit log collection (`admin_audit_logs`) with terminal context and timestamps.

### 5. Google 2-Step Verification (2SV) Compliance
- Google OAuth does not expose an API for third parties to inspect 2SV configuration on individual accounts.
- Owners must verify with each administrator that Google 2-Step Verification (passkeys or authenticator apps, avoiding SMS) is active, and record the manual confirmation tick in `/admin/users`.
- The Launch Checklist on `/admin` requires 100% of active admins to have confirmed 2SV before turning green.

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

## 📸 Photo Stylist Engine (AI Dress Photography Assistant)

The Photo Stylist turns ordinary dress photographs taken on a bed, table, or hanger into a styled product photo (dress on a wooden hanger, soft pink arch background, gentle shadow, 1200x1500 WebP) while **always preserving the real original photo as the second gallery image**.

### 1. Privacy & Architecture Rules
- **No Photo Leaves Our Server:** Runs 100% locally on free, open-source ONNX models (`isnet-general-use` Apache-2.0 and `u2net_cloth_seg` MIT). No third-party or paid AI APIs are used.
- **The Dress Is Never Altered:** The dress is never recoloured, redrawn, or synthesized. Only background cutout, presentation, hanger, and shadow are composed.
- **Original Photo Always Kept:** Since Nest by Ammakkili has a strict no-return policy, shoppers must always be able to inspect the original, unaltered photograph.

### 2. Host Requirements & Memory Limits
- **RAM:** Minimum **2 GB RAM** on the host server (2 vCPUs recommended). On a 512 MB host, ONNX model loading will cause an Out-Of-Memory termination.
- **Docker Memory Limit:** Configured with `memory: 1500M` in `docker-compose.yml`. In testing, peak memory is stable around ~940 MB with both models loaded.
- **Internal Network Only:** The microservice runs on port `8001` and is declared with `expose: ["8001"]` (never `ports:`), ensuring it is strictly accessible only to the web container via `http://stylist:8001`.

### 3. How to Run the Stylist Service

#### With Docker Compose:
```bash
docker compose up -d
```

#### Running Locally for Development:
```bash
cd services/stylist
python -m venv .venv
# On Windows:
.\.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
STYLIST_KEY=your_shared_secret uvicorn stylist.app:app --host 127.0.0.1 --port 8001
```

Set in your root `.env`:
```env
STYLIST_URL=http://127.0.0.1:8001
STYLIST_KEY=your_shared_secret
```

### 4. Tuning `STYLIST_WORN_THRESHOLD`
When an ordinary photo shows a person wearing or holding the dress, the engine skips the hanger to avoid placing a floating hanger over a person's head, cleans the background, and alerts the admin.
- Controlled via the environment variable `STYLIST_WORN_THRESHOLD` (default: `0.25`).
- **If too sensitive** (hanging dresses falsely classified as worn): Increase to `0.30` or `0.35`.
- **If not sensitive enough** (worn dresses receiving a hanger): Decrease to `0.20`.
- Tune this value with 20+ real product photos from your actual workshop or studio.

### 5. Adding Another Background Colour
Background gradients are defined in `services/stylist/stylist/pipeline.py` in the `BACKGROUNDS` dictionary:
```python
BACKGROUNDS = {
    "pink":  {"top": (253, 243, 245), "bottom": (246, 220, 228)},
    "cream": {"top": (255, 248, 241), "bottom": (245, 230, 218)},
    "white": {"top": (255, 255, 255), "bottom": (244, 238, 240)},
    # To add a new colour (e.g. Sage Mint):
    "sage":  {"top": (240, 248, 244), "bottom": (224, 238, 230)},
}
```
Then add the new colour option to the background dropdown in `src/views/admin/product-form.ejs`:
```html
<option value="sage">Sage Mint</option>
```

---

## 🚀 Going Live Checklist

Before opening the storefront to real customers, complete each of the following steps in order:

- [ ] **1. Switch to Live Keys:**  
  In your production `.env`, update Razorpay keys to your live credentials:
  ```env
  RAZORPAY_KEY_ID=rzp_live_yourActualKeyId
  RAZORPAY_KEY_SECRET=yourActualLiveKeySecret
  ```
- [ ] **2. Set Payments Mode:**  
  Set `PAYMENTS_MODE=live` in `.env`. The startup guard (`src/utils/envGuard.js`) will verify that `RAZORPAY_KEY_ID` begins with `rzp_live_` and prevent booting if there is a mismatch.
- [ ] **3. Razorpay Dashboard Automatic Capture Configuration:**  
  In **Razorpay Dashboard → Settings → Configuration**, set **Payment Capture** to *Automatically capture payment immediately*. (Our backend also specifies `payment_capture: 1` during order creation and captures authorized payments at `/checkout/verify` as defense-in-depth).

- [ ] **4. Configure Reverse Proxy Hops (`TRUST_PROXY_HOPS`):**  
  Set `TRUST_PROXY_HOPS` in your production `.env` according to your deployment topology:
  - `TRUST_PROXY_HOPS=1`: Standard deployment behind a single reverse proxy (Nginx, Caddy, Render, Railway, AWS ALB, Heroku).
  - `TRUST_PROXY_HOPS=2`: Cloudflare or another CDN operating in front of your host reverse proxy.
  - `TRUST_PROXY_HOPS=0`: Direct internet exposure without any reverse proxy.

- [ ] **5. Restrict Inbound Traffic via Host Firewall:**  
  Ensure your host firewall (e.g., AWS Security Group, Cloudflare Tunnel, or `ufw`) restricts inbound HTTP/HTTPS traffic to the reverse proxy / CDN IP ranges only. Drop direct internet traffic hitting the Node.js application port directly so attackers cannot bypass rate limiters or spoof `X-Forwarded-For`.

- [ ] **6. Verify Client IP Diagnostics (`/admin/diagnostics`):**  
  Log in to the Admin Panel and open `/admin/diagnostics`:
  1. Open the page from your smartphone on cellular mobile data (4G/5G). Confirm the displayed Client IP matches your carrier's public IP.
  2. Switch your smartphone to home Wi-Fi and reload the page. Confirm the displayed Client IP updates to your home ISP's public IP.
  3. Ensure the displayed Rate-Limit Key changes between the two connections.

- [ ] **7. Register the Webhook URL in Razorpay Dashboard:**  
  - Navigate to **Razorpay Dashboard → Settings → Webhooks → Add New Webhook**.
  - Set the Webhook URL to: `https://YOUR-DOMAIN/webhooks/razorpay`
  - Choose a strong random secret and copy it into your production `.env` as `RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here`.

- [ ] **8. Enable Required Webhook Events:**  
  Check the following 4 events in the Razorpay Webhooks configuration:
  - `payment.captured`
  - `payment.failed`
  - `order.paid`
  - `refund.processed`

- [ ] **9. Run One Real Small Live Payment:**  
  Place a real order for a small amount (e.g., ₹1 or a live product) using a real UPI app or card payment. Verify that:
  - The payment captures successfully.
  - The order status transitions to `paid` and size inventory decrements by 1.
  - The confirmation page renders with prefilled WhatsApp link and readable order ID.

- [ ] **10. Refund the Test Payment & Verify Audit View:**  
  Process a full refund either from the Razorpay Dashboard or via the automated refund flow.
  - Check `/admin/orders?status=refunds` and `/admin/orders?status=refund_needed`.
  - Confirm the order status transitions to `refunded` and displays the refund transaction reference.
  - Test the "Retry Refund" button for any orders flagged as `refund_needed`.

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

