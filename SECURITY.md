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
- **Google OAuth 2.0 Only:** No password credentials, hash tables, or password-reset flows exist for admin users.
- **Strict Allowlist Enforcement:** Sign-in is restricted to explicitly authorized emails stored in the `AdminUser` collection (`admin_users`).
- **Cryptographic Subject (`sub`) Pinning:** The Google `sub` identifier is permanently pinned on initial login; account swapping or replaying tokens with differing identities is rejected with 403.
- **Role-Based Access Control (RBAC):** Privileges are partitioned into `owner` and `staff`. Critical administrative actions (managing admins, modifying legal business settings) require `owner` privileges.
- **5-Minute Freshness Re-Authentication:** High-risk actions (adding/deleting admins, updating business/legal configurations) require that the admin has authenticated within the last 5 minutes.
- **Immediate Invalidation:** Deactivating an admin user revokes access immediately on their next HTTP request.
- **Separate Admin Cookie:** Admin sessions are partitioned onto `__Host-nest_admin_sess` with a 30-minute rolling idle timeout and an 8-hour absolute maximum lifetime, isolated from customer storefront sessions.

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

