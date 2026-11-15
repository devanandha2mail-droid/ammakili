const { test, expect } = require('@playwright/test');
const { resetAndSeedDatabase, connectTestDB, disconnectTestDB, Order, Product } = require('../helpers/db');

test.describe('J7: Order tracking lookup, error enumeration protection, and rate limiting', () => {
  test.beforeAll(async () => {
    await connectTestDB();
  });

  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectTestDB();
  });

  test('displays tracking info with correct phone, shows identical generic error for invalid lookups, and rate limits excess attempts', async ({ page, request }) => {
    // 1. Seed a shipped order with tracking details
    const product = await Product.findOne({ slug: 'rose-garden-nighty' });
    const orderId = 'NEST-TRACK123';
    const customerPhone = '9846012345';

    await Order.create({
      orderId,
      items: [{
        productId: product._id,
        name: 'Rose Garden Nighty',
        price: 599,
        size: 'M',
        quantity: 1,
        image: '/img/sample.jpg'
      }],
      customer: {
        name: 'Tracking Customer',
        phone: customerPhone,
        address: 'MG Road',
        city: 'Ernakulam',
        pin: '682011'
      },
      subtotal: 599,
      shipping: 60,
      total: 659,
      status: 'shipped',
      tracking: {
        courier: 'DTDC Courier',
        trackingId: 'DTDC987654321IN'
      }
    });

    // 2. Correct Order ID + Phone
    await page.goto('/track');
    await page.fill('#orderId', orderId);
    await page.fill('#phone', customerPhone);
    await page.click('button[type="submit"]');

    await expect(page.locator('body')).toContainText('SHIPPED');
    await expect(page.locator('body')).toContainText('DTDC Courier');
    await expect(page.locator('body')).toContainText('DTDC987654321IN');

    // 3. Correct Order ID + WRONG Phone
    await page.fill('#orderId', orderId);
    await page.fill('#phone', '9846099999'); // Wrong phone
    await page.click('button[type="submit"]');

    const notFoundEl = page.locator('p:has-text("No order found matching"), p:has-text("could not find an order"), p:has-text("കണ്ടെത്താനായില്ല")').first();
    await expect(notFoundEl).toBeVisible();
    const wrongPhoneMsg = await notFoundEl.textContent();

    // 4. UNKNOWN Order ID + ANY Phone
    await page.fill('#orderId', 'NEST-UNKNOWN999');
    await page.fill('#phone', customerPhone);
    await page.click('button[type="submit"]');

    await expect(notFoundEl).toBeVisible();
    const unknownOrderMsg = await notFoundEl.textContent();

    // Verify messages are identical to prevent account enumeration
    expect(wrongPhoneMsg.trim()).toBe(unknownOrderMsg.trim());

    // 5. Rate Limiting: More than 10 tracking attempts per minute from one client is rate-limited (HTTP 429)
    let rateLimited = false;
    for (let i = 0; i < 15; i++) {
      const res = await request.post('/track', {
        headers: {
          'x-forwarded-for': '192.168.1.99'
        },
        form: {
          orderId: 'NEST-BURST' + i,
          phone: '9846000000'
        }
      });
      if (res.status() === 429) {
        rateLimited = true;
        break;
      }
    }
    expect(rateLimited).toBe(true);
  });
});

