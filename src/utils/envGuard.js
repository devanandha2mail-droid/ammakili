/**
 * Environment & Production Safety Guard
 * Validates critical environment variables at startup and halts execution with an informative
 * error if hazardous configurations, weak secrets, or mismatched modes are detected.
 */
function fail(msg) {
  console.error(msg);
  if (process.env.VERCEL) {
    throw new Error(msg);
  }
  process.exit(1);
}

function validateEnvironment() {
  const env = process.env.NODE_ENV;

  // 1. NODE_ENV must be exactly one of production, development, or test
  const validEnvs = ['production', 'development', 'test'];
  if (!env || !validEnvs.includes(env)) {
    fail(`FATAL: Invalid NODE_ENV "${env}". Must be exactly one of: ${validEnvs.join(', ')}.`);
  }

  // Auto-detect SITE_URL from VERCEL_URL if deployed on Vercel
  if (!process.env.SITE_URL && process.env.VERCEL_URL) {
    process.env.SITE_URL = `https://${process.env.VERCEL_URL}`;
  }

  // 2. Production strict security requirements
  if (env === 'production') {
    // Dangerous test harness/login flags forbidden in production
    for (const key of Object.keys(process.env)) {
      if (
        ((key.startsWith('ALLOW_TEST_') && key !== 'ALLOW_TEST_PAYMENTS_IN_PROD') ||
          key.includes('TEST_LOGIN') ||
          key.toLowerCase().includes('mock')) &&
        process.env[key] &&
        process.env[key] !== 'false'
      ) {
        fail(`FATAL: Forbidden test/mock flag ${key} is configured in production environment! Exiting immediately.`);
      }
    }

    // SESSION_SECRET & COOKIE_SECRET validation (>= 32 chars and not placeholder/default)
    const sessionSecret = process.env.SESSION_SECRET || '';
    const cookieSecret = process.env.COOKIE_SECRET || process.env.SESSION_SECRET || '';
    const placeholders = ['placeholder', 'change_me', 'secret', 'default', 'nest_session_secret_local_2026', 'nest_secret_key_12345'];

    if (!sessionSecret || sessionSecret.length < 32 || placeholders.some(p => sessionSecret.toLowerCase().includes(p))) {
      fail('FATAL: In production, SESSION_SECRET must be at least 32 characters long and not a placeholder or default value.');
    }

    if (!cookieSecret || cookieSecret.length < 32 || placeholders.some(p => cookieSecret.toLowerCase().includes(p))) {
      fail('FATAL: In production, COOKIE_SECRET must be at least 32 characters long and not a placeholder or default value.');
    }

    // Forbidden legacy credentials
    if (process.env.ADMIN_PASSWORD) {
      fail('FATAL: ADMIN_PASSWORD is forbidden and no longer supported. Admin access is strictly Google OAuth allowlist.');
    }

    // ADMIN_OWNER_EMAIL validation (must be a valid email format)
    const adminOwnerEmail = (process.env.ADMIN_OWNER_EMAIL || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!adminOwnerEmail || !emailRegex.test(adminOwnerEmail)) {
      fail('FATAL: In production, ADMIN_OWNER_EMAIL must be configured with a valid email address.');
    }

    // STYLIST_KEY must not be empty
    const stylistKey = process.env.STYLIST_KEY || '';
    if (!stylistKey || !stylistKey.trim()) {
      fail('FATAL: In production, STYLIST_KEY must not be empty.');
    }

    // WEBHOOK secret must not be empty
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';
    if (!webhookSecret || !webhookSecret.trim()) {
      fail('FATAL: In production, RAZORPAY_WEBHOOK_SECRET / WEBHOOK_SECRET must not be empty.');
    }

    // SITE_URL must start with https://
    const siteUrl = process.env.SITE_URL || '';
    if (!siteUrl || !siteUrl.startsWith('https://')) {
      fail('FATAL: In production, SITE_URL must be configured and start with "https://".');
    }
  }

  // 3. PAYMENTS_MODE validation (live or test) matching Razorpay key prefix
  const paymentsMode = process.env.PAYMENTS_MODE || (env === 'production' ? 'live' : 'test');
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';

  if (paymentsMode !== 'live' && paymentsMode !== 'test') {
    fail(`FATAL: PAYMENTS_MODE must be either "live" or "test", got "${paymentsMode}".`);
  }

  if (paymentsMode === 'live' && !razorpayKeyId.startsWith('rzp_live_')) {
    fail(`FATAL: PAYMENTS_MODE is "live" but RAZORPAY_KEY_ID does not start with "rzp_live_" (found: "${razorpayKeyId.slice(0, 10)}...").`);
  }

  if (paymentsMode === 'test' && !razorpayKeyId.startsWith('rzp_test_')) {
    fail(`FATAL: PAYMENTS_MODE is "test" but RAZORPAY_KEY_ID does not start with "rzp_test_" (found: "${razorpayKeyId.slice(0, 10)}...").`);
  }

  // Live keys strictly forbidden in test environment
  if (env === 'test') {
    for (const [key, val] of Object.entries(process.env)) {
      if (typeof val === 'string' && val.startsWith('rzp_live_')) {
        fail(`FATAL: Live Razorpay key detected in test environment (${key}=${val.slice(0, 12)}...)! Exiting immediately.`);
      }
    }
  }

  // 4. In production with test payments: strictly require ALLOW_TEST_PAYMENTS_IN_PROD=true and print loud warning
  if (env === 'production' && paymentsMode === 'test') {
    if (process.env.ALLOW_TEST_PAYMENTS_IN_PROD === 'true') {
      console.warn('\n====================================================================');
      console.warn('⚠️  LOUD WARNING: RUNNING PRODUCTION WITH TEST PAYMENTS ENABLED!  ⚠️');
      console.warn('⚠️  ALLOW_TEST_PAYMENTS_IN_PROD is set to true. DO NOT SHIP TO REAL CUSTOMERS! ⚠️');
      console.warn('====================================================================\n');
    } else {
      fail('FATAL: NODE_ENV is "production" while PAYMENTS_MODE is "test". If intentional for pre-release testing, set ALLOW_TEST_PAYMENTS_IN_PROD=true in Vercel environment variables.');
    }
  }
}

module.exports = { validateEnvironment };
