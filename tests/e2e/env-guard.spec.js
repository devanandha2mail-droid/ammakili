const { test, expect } = require('@playwright/test');
const { validateEnvironment } = require('../../src/utils/envGuard');

test.describe('Startup Guard (src/utils/envGuard.js) Rules Verification', () => {
  let savedEnv;
  let originalExit;
  let capturedErrors;
  let capturedWarnings;

  test.beforeEach(() => {
    savedEnv = { ...process.env };
    capturedErrors = [];
    capturedWarnings = [];

    originalExit = process.exit;
    process.exit = (code) => {
      throw new Error(`EXIT_${code}`);
    };

    const origConsoleError = console.error;
    const origConsoleWarn = console.warn;
    console.error = (...args) => {
      capturedErrors.push(args.join(' '));
      origConsoleError(...args);
    };
    console.warn = (...args) => {
      capturedWarnings.push(args.join(' '));
      origConsoleWarn(...args);
    };
  });

  test.afterEach(() => {
    process.env = savedEnv;
    process.exit = originalExit;
  });

  // Base valid production environment helper
  function setupValidProductionEnv() {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENTS_MODE = 'live';
    process.env.RAZORPAY_KEY_ID = 'rzp_live_realLiveKey12345';
    process.env.SESSION_SECRET = 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0';
    process.env.COOKIE_SECRET = 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0';
    process.env.ADMIN_PASSWORD = 'SuperSecurePass2026!Complex';
    process.env.STYLIST_KEY = 'stylist_prod_key_77889900';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_webhook_secret_live_778899';
    process.env.SITE_URL = 'https://nestammakkili.com';
    delete process.env.ALLOW_TEST_HARNESS;
    delete process.env.ALLOW_TEST_LOGIN;
  }

  test('Rule 1: Exits if NODE_ENV is not exactly production, development or test', () => {
    process.env.NODE_ENV = 'staging';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('Invalid NODE_ENV'))).toBe(true);
  });

  test('Rule 2a: In production, exits if SESSION_SECRET is shorter than 32 characters or default', () => {
    setupValidProductionEnv();
    process.env.SESSION_SECRET = 'short_secret';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('SESSION_SECRET'))).toBe(true);

    setupValidProductionEnv();
    process.env.SESSION_SECRET = 'placeholder_placeholder_placeholder_123';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('SESSION_SECRET'))).toBe(true);
  });

  test('Rule 2b: In production, exits if COOKIE_SECRET is shorter than 32 characters or default', () => {
    setupValidProductionEnv();
    process.env.COOKIE_SECRET = 'short_cookie';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('COOKIE_SECRET'))).toBe(true);
  });

  test('Rule 2c: In production, exits if ADMIN_PASSWORD is shorter than 12 characters or default', () => {
    setupValidProductionEnv();
    process.env.ADMIN_PASSWORD = 'admin123';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('ADMIN_PASSWORD'))).toBe(true);

    setupValidProductionEnv();
    process.env.ADMIN_PASSWORD = 'password';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('ADMIN_PASSWORD'))).toBe(true);
  });

  test('Rule 2d: In production, exits if STYLIST_KEY is empty', () => {
    setupValidProductionEnv();
    process.env.STYLIST_KEY = '   ';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('STYLIST_KEY'))).toBe(true);
  });

  test('Rule 2e: In production, exits if WEBHOOK secret is empty', () => {
    setupValidProductionEnv();
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.WEBHOOK_SECRET;
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('WEBHOOK'))).toBe(true);
  });

  test('Rule 2f: In production, exits if SITE_URL is not https', () => {
    setupValidProductionEnv();
    process.env.SITE_URL = 'http://nestammakkili.com';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('SITE_URL'))).toBe(true);
  });

  test('Rule 3a: Exits if PAYMENTS_MODE is live but key does not start with rzp_live_', () => {
    setupValidProductionEnv();
    process.env.PAYMENTS_MODE = 'live';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_invalid_live_prefix';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('rzp_live_'))).toBe(true);
  });

  test('Rule 3b: Exits if PAYMENTS_MODE is test but key does not start with rzp_test_', () => {
    process.env.NODE_ENV = 'development';
    process.env.PAYMENTS_MODE = 'test';
    process.env.RAZORPAY_KEY_ID = 'rzp_live_dangerous_in_test';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('rzp_test_'))).toBe(true);
  });

  test('Rule 3c: In test mode, exits if any key starts with rzp_live_', () => {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENTS_MODE = 'test';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_123';
    process.env.DANGEROUS_LIVE_KEY = 'rzp_live_accidentallyConfigured';
    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('Live Razorpay key detected'))).toBe(true);
  });

  test('Rule 4a: In production with PAYMENTS_MODE=test without ALLOW_TEST_PAYMENTS_IN_PROD, exits with error', () => {
    setupValidProductionEnv();
    process.env.PAYMENTS_MODE = 'test';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_sandboxKeyId123';
    delete process.env.ALLOW_TEST_PAYMENTS_IN_PROD;

    expect(() => validateEnvironment()).toThrow('EXIT_1');
    expect(capturedErrors.some(e => e.includes('ALLOW_TEST_PAYMENTS_IN_PROD'))).toBe(true);
  });

  test('Rule 4b: In production with PAYMENTS_MODE=test and ALLOW_TEST_PAYMENTS_IN_PROD=true, succeeds and prints loud warning', () => {
    setupValidProductionEnv();
    process.env.PAYMENTS_MODE = 'test';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_sandboxKeyId123';
    process.env.ALLOW_TEST_PAYMENTS_IN_PROD = 'true';

    // Must not throw exit
    expect(() => validateEnvironment()).not.toThrow();
    expect(capturedWarnings.some(w => w.includes('LOUD WARNING'))).toBe(true);
  });
});
