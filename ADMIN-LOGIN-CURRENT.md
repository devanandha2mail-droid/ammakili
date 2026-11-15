# Current Admin Login System Architecture (`ADMIN-LOGIN-CURRENT.md`)

This document describes the implementation of the admin login system in **Nest by Ammakkili** as of the `admin-login-hardening` branch baseline.

---

## 1. Routes and Handlers

Administrative authentication is handled in `src/routes/admin.js` and orchestrated by `src/controllers/adminAuthController.js`:

| Route | HTTP Method | Middleware | Handler | Purpose |
|---|---|---|---|---|
| `/admin/login` | `GET` | `redirectIfAuthenticated` | `adminAuthController.getLogin` | Renders the admin sign-in page with Google sign-in button. If already authenticated (`req.session.adminId`), redirects to `/admin`. Displays idle/session timeout and deactivation notices based on `?reason=`. |
| `/admin/auth/google` | `GET` | `adminAuthLimiter` (5 per 15 min) | `adminAuthController.startGoogleAuth` | Initiates Google OAuth 2.0 flow. Generates cryptographic `state` and `nonce` (32 bytes hex), stores them in `req.session`, records optional `returnTo` path, and redirects to `https://accounts.google.com/o/oauth2/v2/auth`. |
| `/admin/auth/google/callback` | `GET` | `adminAuthLimiter` (5 per 15 min) | `adminAuthController.handleGoogleCallback` | Validates state, exchanges authorization code for tokens, decodes ID token / queries userinfo, verifies Google verification and allowlist status, binds Google `sub`, regenerates session, and establishes admin session. |
| `/admin/logout` | `GET` | None | `adminAuthController.logout` | Logs audit event `ADMIN_LOGOUT`, destroys server-side session, and redirects to `/admin/login`. |
| `/admin/sign-out-everywhere` | `POST` | `requireAdmin` | `adminAuthController.signOutEverywhere` | Updates `sessionValidAfter` on the `AdminUser` document, invalidating all sessions across all devices, destroys the current session, and redirects with `?reason=session_revoked`. |

All subsequent routes under `/admin/*` are protected by `router.use(requireAdmin)` in `src/routes/admin.js`.

---

## 2. Authentication Strategy & How Admins are Identified

- **Zero-Password Google OAuth 2.0:** There are no local password credentials, password hashes, password-reset forms, or fallback basic auth.
- **Allowlist Model (`AdminUser` collection):**
  - Admins must pre-exist in the `admin_users` MongoDB collection (`src/models/AdminUser.js`).
  - Upon receiving the Google ID token/profile on callback, the email is lowercased and matched against `AdminUser.findOne({ email: normalizedEmail })`.
  - If the user does not exist or `active !== true`, access is rejected with a generic HTTP 403 (`admin/unauthorized.ejs`), revealing nothing about whether the email is registered or merely inactive.
- **Account Identifier Pinning (`googleSub`):**
  - On the first successful login, the Google account identifier (`payload.sub`) is saved to `adminUser.googleSub`.
  - On subsequent logins, `sub === adminUser.googleSub` is enforced. Re-authenticating with a different Google account under the same address is blocked with HTTP 403.
- **Session Identification:**
  - Upon successful callback, `req.session.regenerate()` is executed.
  - The admin identity is stored in session properties:
    - `req.session.adminId`: MongoDB ObjectId of the `AdminUser`.
    - `req.session.adminEmail`: Normalized email.
    - `req.session.adminRole`: Role (`owner` or `staff`).
    - `req.session.adminAuthTime`: Timestamp of authentication (used for 5-minute freshness checks).
    - `req.session.adminSessionCreatedAt`: Session birth timestamp (used for 8-hour absolute timeout).
    - `req.session.adminLastActiveAt`: Rolling activity timestamp (used for 30-minute idle timeout).
- **Per-Request Database Verification:**
  - On every `/admin` request, `requireAdmin` queries `AdminUser.findById(req.session.adminId)`.
  - If the user is removed, deactivated (`active: false`), or if `sessionCreatedAt < sessionValidAfter`, the session is destroyed immediately.

---

## 3. Session and Cookie Settings

Session segregation is implemented in `src/app.js`:

### Customer vs. Admin Session Separation:
- Requests to `/admin` or `/admin/*` use `adminSessionMiddleware`:
  - **Mongo Collection:** `admin_sessions`
  - **Cookie Name:** `nest_admin_sess` (Development/Test) / `__Host-nest_admin_sess` (Production).
  - **Store TTL:** 8 hours (`8 * 60 * 60` seconds).
  - **Cookie Settings:** `httpOnly: true`, `secure: isProd`, `sameSite: 'lax'`, `maxAge: 30 * 60 * 1000` (30 minutes rolling idle). In production, `__Host-` prefix enforces `Secure: true`, `Path: /`, and no `Domain` attribute.
- Storefront requests use `customerSessionMiddleware`:
  - **Mongo Collection:** `sessions`
  - **Cookie Name:** `nest_sess` / `__Host-nest_sess`.
  - **Store TTL:** 14 days.
  - Customer sessions and admin sessions are strictly separated by cookie name, storage collection, and authentication flags. Customer sessions cannot access `/admin`, and admin sessions are not recognized as customer credentials.

### Timeout Enforcement (`src/middleware/auth.js`):
1. **30-Minute Idle Timeout:** If `Date.now() - req.session.adminLastActiveAt > 30 * 60 * 1000`, session is destroyed and redirected to `/admin/login?reason=idle_timeout`.
2. **8-Hour Absolute Lifetime:** If `Date.now() - req.session.adminSessionCreatedAt > 8 * 60 * 60 * 1000`, session is destroyed and redirected to `/admin/login?reason=session_expired`.
3. **Session Invalidation ("Sign Out Everywhere"):** If `req.session.adminSessionCreatedAt < adminUser.sessionValidAfter`, session is destroyed and redirected to `/admin/login?reason=session_revoked`.

---

## 4. Where the Owner's Email Comes From

- The owner's email address is supplied exclusively via the environment variable `ADMIN_OWNER_EMAIL` (e.g., in `.env`).
- **No email addresses are hard-coded in application source code.**
- `src/utils/envGuard.js` validates that in production mode (`NODE_ENV === 'production'`), `ADMIN_OWNER_EMAIL` is defined and matches a valid email format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`); if absent or invalid, the application fails startup immediately with a fatal error.
- Initial owner creation currently takes place during launch initialization (`scripts/reset-for-launch.js`) or test setup (`tests/helpers/db.js`), reading directly from `process.env.ADMIN_OWNER_EMAIL`.
