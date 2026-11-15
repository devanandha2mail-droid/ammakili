# Security Policy - Nest by Ammakkili

Nest by Ammakkili takes security and user privacy seriously. This document outlines our vulnerability disclosure process, reporting channels, and comprehensive technical security architecture.

---

## 1. Reporting Security Vulnerabilities

If you discover a security vulnerability or potential exposure within Nest by Ammakkili's application or infrastructure, please report it directly and privately. **Do not disclose the issue publicly until it has been reviewed and resolved.**

### Reporting Channels:
- **Email:** [security@nestammakkili.com](mailto:security@nestammakkili.com)
- **Urgent WhatsApp Escalation:** +91 98765 43210 (Grievance & Security Officer)

### What to Include in Your Report:
1. Detailed description of the vulnerability and attack vector.
2. Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
3. Potential impact (e.g., unauthorized data access, privilege escalation, bypass of controls).
4. Any potential remediation suggestions.

### Our Commitment:
- **Acknowledgement:** We will acknowledge receipt of your report within 24 hours.
- **Triage & Remediation:** We will assess and deploy remediations within 72 hours for critical/high severity vulnerabilities.
- **Attribution:** We are happy to publicly acknowledge security researchers who follow responsible disclosure practices.

---

## 2. In-Scope & Out-of-Scope

### In-Scope:
- Cross-Site Scripting (XSS)
- Cross-Site Request Forgery (CSRF)
- SQL / NoSQL Injection attacks
- Insecure Direct Object References (IDOR)
- Authentication / Authorization bypasses (Admin Google OAuth allowlist, Customer sessions)
- Server-Side Request Forgery (SSRF)
- Payment flow tampering or inventory reservation bypasses
- Sensitive data leakage or PII exposure

### Out-of-Scope:
- Denial of Service (DoS / DDoS) attacks against third-party providers
- Physical security or social engineering attacks against employees
- Vulnerabilities requiring un-jailbroken rooted devices or compromised physical hardware
- Automated vulnerability scanning reports without verified exploitability

---

## 3. Technical Security Architecture & Controls

### 3.1 Zero-Password Admin Authentication & Allowlist

The administrative console (`/admin`) operates exclusively on **Google Sign-In with a database-backed allowlist** (`AdminUser` collection). There are zero passwords, password fields, credential hash stores, or password-reset flows.

#### Controls Implemented:
1. **Google OAuth 2.0 with PKCE & Nonce:** The authorization exchange enforces SHA-256 code challenge/verifier (PKCE), OpenID Connect `nonce` verification, single-use state tokens, and strict IP rate limiting (5 attempts per 15 minutes).
2. **Strict Allowlist & Uniform 403 Response:** Only emails present in `AdminUser` with `active: true` and Google-verified email status (`email_verified: true`) are permitted. Unlisted emails and deactivated admins receive an identical generic 403 "Not Authorised" page with matching timing, preventing allowlist enumeration.
3. **Cryptographic Subject (`sub`) Binding:** On first login, the admin's unique Google account subject (`sub`) is permanently stored. Subsequent logins must match the bound `sub`; attempts to authenticate using a different Google account under the same email are rejected.
4. **Session Regeneration & Isolation:** Upon successful OAuth callback, `req.session.regenerate()` assigns a fresh session ID. Admin sessions (`__Host-nest_admin_sess`, stored in `admin_sessions`) are completely separated from customer storefront sessions (`__Host-nest_sess`, stored in `sessions`). Customer credentials cannot access `/admin`.
5. **Timeouts & Revocation:** Admin sessions enforce a 30-minute rolling idle timeout and an 8-hour absolute maximum lifetime. Logging out destroys the server session; "Sign out everywhere" purges all active sessions in MongoDB and invalidates any session created prior to `sessionValidAfter`. Deactivated admins are booted on their next HTTP request.
6. **Role-Based Access Control (RBAC):** Privileges are partitioned into `owner` and `staff`. Staff members can manage products, photos, and orders, but are blocked from store settings, business/legal details, refunds, customer exports, and admin user management.
7. **Immutable Last Owner Invariant:** The database enforces that the last active `owner` cannot be deleted, deactivated, or demoted to staff.
8. **Sensitive Action Gating (5-Minute Fresh Auth):** High-risk actions (adding/deleting admins, updating store/legal settings, issuing refunds) require an authentication event within the past 5 minutes. Older sessions are redirected to Google's account chooser (`prompt=select_account`).
9. **Open Redirect Mitigation:** The post-login `returnTo` redirect path is sanitized strictly against an internal whitelist; external domains (`https://evil.example`) and protocol-relative URLs (`//evil.example`) are discarded in favor of `/admin`.
10. **Cache-Control & Headers:** Every `/admin` route transmits `Cache-Control: no-store, no-cache, must-revalidate, private` to prevent sensitive admin panels from being stored in intermediate or browser caches.

#### What These Controls Protect Against:
- **Credential Stuffing & Password Leaks:** Eliminating passwords prevents brute force, dictionary attacks, rainbow table matching, and compromise via third-party database leaks.
- **Replay Attacks:** Single-use state and code verifiers prevent intercepted authorization codes from being reused.
- **Token Tampering & Identity Spoofing:** Google `sub` binding prevents token substitution or rogue account re-registration.
- **Session Fixation & Hijacking:** Session regeneration on authentication, strict `__Host-` cookies (`HttpOnly; Secure; SameSite=Lax; Path=/` without `Domain`), idle/absolute timeouts, and `no-store` headers protect against session theft.
- **Privilege Escalation & Insecure Direct Object References (IDOR):** Strict middleware checks verify role and active status on every request, preventing staff from performing owner actions.
- **Session Confusion:** Distinct session cookies, separate database collections, and explicit session flags prevent customer sessions from masquerading as admin sessions.

#### Known Limitations & Trust Assumptions:
- **5-Minute Fresh Auth vs Hardware Keys:** The 5-minute Google account chooser prompt is designed for usability and administrative ergonomics without requiring custom 2FA infrastructure. However, it is weaker than requiring a hardware security key (FIDO2/WebAuthn) or dedicated time-based one-time password (TOTP) code on every sensitive operation. If an unauthorized person gains physical access to an unlocked administrator computer with an active Google session, the account chooser could be satisfied.
- **Reliance on Google 2-Step Verification:** Real, robust defense-in-depth relies on each administrator enabling **Google 2-Step Verification (2SV)** (preferably passkeys, Titan/YubiKey security keys, or authenticator apps, while avoiding SMS) on their Google account. Because third-party web apps cannot programmatically audit 2SV status through standard OAuth scopes, store owners must manually verify and confirm 2SV compliance for all administrators.

### 3.2 Input Validation & Injection Prevention
- **Strict Zod Schemas:** All mutating endpoints (`/checkout/create`, `/checkout/verify`, `/checkout/cancel`, `/cart/validate`, `/track-order`, `/contact`) enforce strict Zod schemas.
- **NoSQL Operator Sanitization:** Application middleware recursively strips or rejects keys starting with `$` or containing `.`, preventing NoSQL query injection across JSON and URL-encoded payloads.
- **Payload Size Limits:** `express.json()` and `express.urlencoded()` enforce a strict 100 KB limit to prevent memory exhaustion and DoS attacks.
- **Contextual Output Encoding:** Dynamic HTML, meta descriptions, and JSON-LD structured data utilize character-level entity escaping (`<` converted to `\u003c` in script tags) preventing stored and reflected XSS.

### 3.3 HTTP Headers & Cookie Hardening
- **Strict Transport Security (HSTS):** `max-age=63072000; includeSubDomains; preload` in production.
- **Content Security Policy (CSP):** Strict nonce-based CSP (`script-src 'self' 'nonce-...' https://checkout.razorpay.com; object-src 'none'; base-uri 'self'`).
- **Cross-Origin Opener Policy (COOP):** `same-origin-allow-popups` ensuring secure isolation while permitting payment popups.
- **Referrer Policy:** `strict-origin-when-cross-origin`.
- **Permissions Policy:** Restricts hardware capabilities (`camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com")`).
- **Header Suppression:** `X-Powered-By` is completely disabled.
- **Cache-Control:** Sensitive areas (`/admin`, `/account`, `/checkout`) explicitly enforce `no-store, no-cache, must-revalidate, private`.
- **Cookie Flags:** All session cookies use `HttpOnly`, `SameSite=Lax`, and `Secure` with `__Host-` prefixes in production.

### 3.4 Upload & Media Security
- **MIME & Extension Whitelist:** Only JPEG, WebP, and PNG formats are accepted. SVG, GIF, HTML, and executables are strictly rejected.
- **Magic-Bytes Verification:** Content is parsed with Sharp to inspect actual image dimensions and buffer headers before saving.
- **Re-encoding & Metadata Stripping:** All uploaded images are re-encoded through Sharp, automatically oriented, and stripped of all EXIF/GPS metadata.
- **Filename Randomization:** Storage paths use UUIDv4 random identifiers; client filenames are discarded.
- **File & Batch Limits:** Hard limit of 5 MB per file and maximum 10 files per upload.
- **Stylist Microservice Isolation:** The AI Stylist service is isolated on an internal Docker bridge network (`expose: 8001`, no host port mapping) and authenticated via internal `X-Stylist-Key`.

### 3.5 Payment Integrity & Inventory Protection
- **Atomic Inventory Reservations:** Checkout creation reserves size quantities atomically using conditional MongoDB updates (`sizes.stock >= quantity`).
- **Atomic Release on Dismiss / Expiry:** Abandoned orders release reservations after 15 minutes, or immediately upon user modal dismissal via signed HMAC tokens.
- **Server-Authoritative Pricing:** Client-provided prices and subtotal amounts are ignored; prices are fetched directly from MongoDB database records.
- **Cryptographic Signature Verification:** Webhooks and checkout callbacks are verified with HMAC-SHA256 signatures with constant-time equality comparisons (`crypto.timingSafeEqual`).
- **Post-Payment Verification:** Upon receiving payment confirmation, the server independently queries Razorpay's API (`payments.fetch`) to confirm `status === 'captured'`, exact currency (`INR`), and matching paise amount.

### 3.6 Data Privacy, Retention & GDPR/DPDP Compliance
- **PII Redaction in Logging:** Structured Pino logger masks customer names, phone numbers, email addresses, delivery addresses, and payment IDs before outputting logs.
- **Automated Retention Purge:** Daily automated maintenance (`orderCleanup.js`) permanently purges unpaid/abandoned orders and expired session tokens older than 30 days while retaining completed order history.
- **Customer Privacy CLI Tooling:** Dedicated CLI utilities allow administrators to export all customer data (`npm run customer:export -- --phone <number>`) and erase customer records (`npm run customer:delete -- --phone <number> --confirm`) in compliance with the Digital Personal Data Protection Act (DPDP).

---

## 4. Security Incident Management

In the event of a confirmed security incident:
1. Immediate containment and token/key revocation following `SECRETS-ROTATION.md`.
2. Break-glass administrative access management via `scripts/admin-cli.js`.
3. Root-cause isolation, patch deployment, and regression testing.
4. Transparent communication with affected users in accordance with applicable data protection laws.

