const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

// Ensure .env.test is loaded for tests
require('dotenv').config({ path: path.resolve(__dirname, '.env.test') });
require('./tests/helpers/mock-razorpay');

// Guard check: Prevent tests from ever running against non-test database
if (!process.env.MONGODB_URI || !process.env.MONGODB_URI.includes('_test')) {
  throw new Error('FATAL: MONGODB_URI must contain "_test" during test execution to prevent data loss on real database!');
}

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
  throw new Error('FATAL: RAZORPAY_KEY_ID must start with "rzp_test_" for test runs!');
}

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 7000
  },
  fullyParallel: false, // Run journeys sequentially to ensure isolated db states per journey
  forbidOnly: true,
  retries: 0,
  workers: 1, // Single worker avoids database collisions between journeys
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: { width: 1440, height: 900 },
        browserName: 'chromium'
      }
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium'
      }
    }
  ],
  webServer: {
    command: 'node -r ./tests/helpers/mock-razorpay.js src/server.js',
    url: 'http://localhost:3001',
    timeout: 20000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      PAYMENTS_MODE: 'test',
      ALLOW_TEST_LOGIN: 'true',
      ALLOW_TEST_HARNESS: 'true',
      ENV_FILE: '.env.test',
      PORT: '3001',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/nest_test'
    }
  }
});
