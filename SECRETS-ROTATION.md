# Production Secrets Rotation Guide (Zero-Downtime Procedures)

This runbook documents step-by-step procedures for rotating all application credentials and secrets in production with zero downtime for **Nest by Ammakkili**.

---

## 1. Razorpay API Keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`)

Razorpay supports dual active API keys during key rotation to eliminate transaction disruption.

### Step-by-Step Procedure:
1. **Generate New Key in Razorpay Dashboard:**
   - Log into [Razorpay Dashboard](https://dashboard.razorpay.com/).
   - Navigate to **Settings** → **API Keys**.
   - Click **Regenerate Key**.
   - Select **"Keep old key active for 24 hours"** (or choose appropriate overlap window).
   - Razorpay provides the new `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` while keeping existing keys valid.

2. **Update Production Environment Variables:**
   - On the production VPS server, update `/app/.env` (or Docker Compose environment):
     ```env
     RAZORPAY_KEY_ID=rzp_live_newKeyIdHere
     RAZORPAY_KEY_SECRET=newLiveKeySecretHere
     ```

3. **Deploy / Reload Application Container:**
   - Execute rolling restart:
     ```bash
     docker compose up -d --no-deps web
     ```

4. **Verify Live Payment Initiation:**
   - Inspect startup logs: verify `envGuard` confirms matching `rzp_live_` key format.
   - Complete a small ₹1 verification transaction or review telemetry.

5. **Decommission Old Key:**
   - After confirming new key transactions are captured successfully, revisit Razorpay Dashboard and click **Revoke Old Key**.

---

## 2. Razorpay Webhook Secret (`RAZORPAY_WEBHOOK_SECRET`)

### Step-by-Step Procedure:
1. **Configure Second Webhook in Razorpay Dashboard:**
   - In Razorpay Dashboard → **Settings** → **Webhooks**, click **Add New Webhook**.
   - Point to `https://nestammakkili.com/webhooks/razorpay` with selected events (`payment.captured`, `order.paid`, `refund.processed`).
   - Enter a new 256-bit webhook secret generated via `npm run generate-secrets`.

2. **Update Environment Variable:**
   - Set `RAZORPAY_WEBHOOK_SECRET` to the new secret in production `.env`.
   - Reload the web container (`docker compose up -d --no-deps web`).

3. **Verify and Remove Old Webhook:**
   - Send test webhook ping from Razorpay dashboard to verify HTTP 200 response.
   - Delete the previous webhook endpoint from Razorpay dashboard.

---

## 3. Google OAuth 2.0 Client Secret (`GOOGLE_CLIENT_SECRET`)

Used for Admin Google Sign-In allowlist and customer social login.

### Step-by-Step Procedure:
1. **Create New Client Secret in Google Cloud Console:**
   - Open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.
   - Select the OAuth 2.0 Client ID for Nest by Ammakkili.
   - Click **Add Secret**. Google allows multiple active client secrets simultaneously.
   - Copy the newly created client secret string.

2. **Update Server Configuration:**
   - Update `GOOGLE_CLIENT_SECRET` in production `.env`.
   - Reload web service: `docker compose up -d --no-deps web`.

3. **Verify Authentication Flow:**
   - Navigate to `/admin/login` in an incognito window and authenticate as an owner.
   - Confirm successful callback and session creation.

4. **Delete Old Secret in Google Console:**
   - In Google Cloud Console, delete the old secret once all instances are on the new secret.

---

## 4. Session Secrets (`SESSION_SECRET`, `COOKIE_SECRET`, `ADMIN_SESSION_SECRET`)

### Step-by-Step Procedure:
1. **Generate New Cryptographic Secrets:**
   ```bash
   npm run generate-secrets
   ```

2. **Zero-Downtime Session Migration:**
   - `express-session` supports an array of secrets: `secret: [newSecret, oldSecret]`.
   - Any active session signed with `oldSecret` continues to be decrypted and verified, while newly issued sessions are signed with `newSecret`.
   - Configure the secret rotation in `.env`:
     ```env
     SESSION_SECRET=newHexSecret,oldHexSecret
     ```

3. **Reload Container:**
   ```bash
   docker compose up -d --no-deps web
   ```

4. **Final Cutover:**
   - After the 14-day customer TTL / 8-hour admin TTL expires, remove `oldHexSecret` leaving only `newHexSecret`.

---

## 5. Photo Stylist Shared Secret (`STYLIST_KEY`)

Protects internal inter-container communication between Node web server and Python AI stylist container.

### Step-by-Step Procedure:
1. **Generate New Secret:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Update Both Containers Concurrently:**
   - Update `STYLIST_KEY` in the shared `.env` file on host.
   - Re-deploy both services together:
     ```bash
     docker compose up -d
     ```
   - Because the communication is internal (`http://stylist:8001`) with rapid container restart, zero customer checkout traffic is interrupted.

3. **Verify Health:**
   - Upload a test photo draft in `/admin/products/add` and confirm stylist processing completes.

---

## 6. Cloudinary API Secret (`CLOUDINARY_API_SECRET`)

### Step-by-Step Procedure:
1. **Generate Secondary API Secret in Cloudinary:**
   - Log into [Cloudinary Management Console](https://console.cloudinary.com/) → **Settings** → **Security**.
   - Under Access Keys, click **Generate New API Key & Secret**.
   - Cloudinary keeps previous keys active during transition.

2. **Update Production Environment:**
   - Update `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in `.env`.
   - Restart web container: `docker compose up -d --no-deps web`.

3. **Verify Image Uploads:**
   - Upload a product photo in Admin panel. Confirm CDN URL generates on `res.cloudinary.com`.

4. **Revoke Old API Key:**
   - Delete old key pair in Cloudinary console.

