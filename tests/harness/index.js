const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Customer = require('../../src/models/Customer');
const { safeReturnUrl } = require('../../src/middleware/customerAuth');

/**
 * Test Harness Setup
 * Exclusively loaded when NODE_ENV === 'test'
 */
module.exports = function setupTestHarness(app) {
  const mockModalHtml = fs.readFileSync(path.join(__dirname, 'mockModal.ejs'), 'utf8');
  const mockModalScript = fs.readFileSync(path.join(__dirname, 'mockModalScript.ejs'), 'utf8');

  // Inject test harness modal on checkout page when ALLOW_TEST_HARNESS is enabled
  app.use((req, res, next) => {
    if (process.env.ALLOW_TEST_HARNESS === 'true') {
      res.locals.testHarnessModal = mockModalHtml;
      res.locals.testHarnessScript = mockModalScript;
    } else {
      res.locals.testHarnessModal = '';
      res.locals.testHarnessScript = '';
    }
    next();
  });

  // Test-only Login Route: strictly available only when ALLOW_TEST_LOGIN=true
  if (process.env.ALLOW_TEST_LOGIN === 'true') {
    app.post('/__test/login', async (req, res, next) => {
      try {
        const email = (req.body.email || req.query.email || 'customer.test@example.com').toLowerCase().trim();
        const name = req.body.name || req.query.name || 'Priya Lakshmi';
        const phone = req.body.phone || req.query.phone || '9846012345';
        const addresses = req.body.addresses || [{
          label: 'Home',
          name: name,
          phone: phone,
          address: 'Ammakkili Villa, Palace Road',
          city: 'Thrissur',
          state: 'Kerala',
          pin: '680001',
          isDefault: true
        }];

        let customer = await Customer.findOne({ email });
        if (!customer) {
          customer = await Customer.create({
            googleId: 'test_google_id_' + Date.now(),
            email,
            emailVerified: true,
            name,
            phone,
            addresses,
            lastLoginAt: new Date()
          });
        } else if (req.body.addresses) {
          customer.addresses = addresses;
          await customer.save();
        }

        req.login(customer, (err) => {
          if (err) return next(err);
          if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ success: true, customer: { id: customer._id, email: customer.email, name: customer.name } });
          }
          const rawReturnTo = req.body.returnTo || req.query.returnTo || '/account';
          const returnTo = safeReturnUrl(rawReturnTo);
          res.redirect(returnTo);
        });
      } catch (err) {
        next(err);
      }
    });
  }

  // Test-only Signature Route: strictly available only when ALLOW_TEST_HARNESS=true
  if (process.env.ALLOW_TEST_HARNESS === 'true') {
    app.post('/__test/compute-signature', (req, res) => {
      const { razorpay_order_id, razorpay_payment_id } = req.body || {};
      if (!razorpay_order_id || !razorpay_payment_id) {
        return res.status(400).json({ error: 'Missing parameters for test signature computation' });
      }
      const secret = process.env.RAZORPAY_KEY_SECRET;
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      res.json({ signature });
    });
  }
};
