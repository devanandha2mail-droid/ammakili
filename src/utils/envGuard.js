/**
 * Environment & Production Safety Guard
 * Validates critical environment variables at startup and halts execution with an informative
 * error if hazardous configurations, weak secrets, or mismatched modes are detected.
 */
function validateEnvironment() {
  const env = process.env.NODE_ENV;

  // 1. NODE_ENV must be exactly one of production, development, or test
  const validEnvs = ['production', 'development', 'test'];
  if (!env || !validEnvs.includes(env)) {
    console.error(`FATAL: Invalid NODE_ENV "${env}". Must be exactly one of: ${validEnvs.join(', ')}.`);
    process.exit(1);
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
        console.error(`FATAL: Forbidden test/mock flag ${key} is configured in production environment! Exiting immediately.`);
        process.exit(1);
      }
    }

    // SESSION_SECRET & COOKIE_SECRET validation (>= 32 chars and not placeholder/default)
    const sessionSecret = process.env.SESSION_SECRET || '';
    const cookieSecret = process.env.COOKIE_SECRET || process.env.SESSION_SECRET || '';
    const placeholders = ['placeholder', 'change_me', 'secret', 'default', 'nest_session_secret_local_2026', 'nest_secret_key_12345'];

    if (!sessionSecret || sessionSecret.length < 32 || placeholders.some(p => sessionSecret.toLowerCase().includes(p))) {
      console.error('FATAL: In production, SESSION_SECRET must be at least 32 characters long and not a placeholder or default value.');
      process.exit(1);
    }

    if (!cookieSecret || cookieSecret.length < 32 || placeholders.some(p => cookieSecret.toLowerCase().includes(p))) {
      console.error('FATAL: In production, COOKIE_SECRET must be at least 32 characters long and not a placeholder or default value.');
      process.exit(1);
    }

    // ADMIN_OWNER_EMAIL validation (must be a valid email format)
    const adminOwnerEmail = (process.env.ADMIN_OWNER_EMAIL || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!adminOwnerEmail || !emailRegex.test(adminOwnerEmail)) {
      console.error('FATAL: In production, ADMIN_OWNER_EMAIL must be configured with a valid email address.');
      process.exit(1);
    }

    // STYLIST_KEY must not be empty
    const stylistKey = process.env.STYLIST_KEY || '';
    if (!stylistKey || !stylistKey.trim()) {
      console.error('FATAL: In production, STYLIST_KEY must not be empty.');
      process.exit(1);
    }

    // WEBHOOK secret must not be empty
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';
    if (!webhookSecret || !webhookSecret.trim()) {
      console.error('FATAL: In production, RAZORPAY_WEBHOOK_SECRET / WEBHOOK_SECRET must not be empty.');
      process.exit(1);
    }

    // SITE_URL must start with https://
    const siteUrl = process.env.SITE_URL || '';
    if (!siteUrl || !siteUrl.startsWith('https://')) {
      console.error('FATAL: In production, SITE_URL must be configured and start with "https://".');
      process.exit(1);
    }
  }

  // 3. PAYMENTS_MODE validation (live or test) matching Razorpay key prefix
  const paymentsMode = process.env.PAYMENTS_MODE || (env === 'production' ? 'live' : 'test');
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';

  if (paymentsMode !== 'live' && paymentsMode !== 'test') {
    console.error(`FATAL: PAYMENTS_MODE must be either "live" or "test", got "${paymentsMode}".`);
    process.exit(1);
  }

  if (paymentsMode === 'live' && !razorpayKeyId.startsWith('rzp_live_')) {
    console.error(`FATAL: PAYMENTS_MODE is "live" but RAZORPAY_KEY_ID does not start with "rzp_live_" (found: "${razorpayKeyId.slice(0, 10)}...").`);
    process.exit(1);
  }

  if (paymentsMode === 'test' && !razorpayKeyId.startsWith('rzp_test_')) {
    console.error(`FATAL: PAYMENTS_MODE is "test" but RAZORPAY_KEY_ID does not start with "rzp_test_" (found: "${razorpayKeyId.slice(0, 10)}...").`);
    process.exit(1);
  }

  // Live keys strictly forbidden in test environment
  if (env === 'test') {
    for (const [key, val] of Object.entries(process.env)) {
      if (typeof val === 'string' && val.startsWith('rzp_live_')) {
        console.error(`FATAL: Live Razorpay key detected in test environment (${key}=${val.slice(0, 12)}...)! Exiting immediately.`);
        process.exit(1);
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
      console.error('FATAL: NODE_ENV is "production" while PAYMENTS_MODE is "test". If intentional for pre-release testing, set ALLOW_TEST_PAYMENTS_IN_PROD=true.');
      process.exit(1);
    }
  }
}

module.exports = { validateEnvironment };
