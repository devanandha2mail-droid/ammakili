const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Customer = require('../../src/models/Customer');
const { safeReturnUrl } = require('../../src/middleware/customerAuth');

function makeFakeIdToken({ email, email_verified = true, sub = 'google_sub_12345', iat = Math.floor(Date.now() / 1000) }) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    sub,
    email,
    email_verified,
    iat,
    exp: iat + 3600
  })).toString('base64');
  return `${header}.${payload}.fake_signature`;
}

/**
 * Test Harness Setup
 * Exclusively loaded when NODE_ENV === 'test'
 */
module.exports = function setupTestHarness(app) {
  // Test-only Mock Google OAuth Token Route
  app.post('/__test/mock-google-token', (req, res) => {
    const code = req.body.code || '';
    if (code.includes('code_unverified')) {
      return res.json({
        access_token: 'fake_access_token',
        id_token: makeFakeIdToken({
          email: 'owner@nestammakkili.com',
          email_verified: false,
          sub: 'sub_unverified_123'
        })
      });
    }
    if (code.includes('code_stranger')) {
      return res.json({
        access_token: 'fake_access_token',
        id_token: makeFakeIdToken({
          email: 'stranger@gmail.com',
          email_verified: true,
          sub: 'sub_stranger_999'
        })
      });
    }
    if (code.includes('code_hijack')) {
      return res.json({
        access_token: 'fake_access_token',
        id_token: makeFakeIdToken({
          email: 'owner@nestammakkili.com',
          email_verified: true,
          sub: 'hijacked_different_sub_9999'
        })
      });
    }
    return res.json({
      access_token: 'fake_access_token',
      id_token: makeFakeIdToken({
        email: 'owner@nestammakkili.com',
        email_verified: true,
        sub: 'legitimate_google_sub_1001'
      })
    });
  });
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

    // Test-only Admin Login Route: strictly available only when ALLOW_TEST_LOGIN=true
    const handleTestAdminLogin = async (req, res, next) => {
      try {
        const email = (req.body?.email || req.query?.email || 'admin@nestammakkili.com').toLowerCase().trim();
        const role = req.body?.role || req.query?.role || 'owner';
        const AdminUser = require('../../src/models/AdminUser');
        let admin = await AdminUser.findOne({ email });
        if (!admin) {
          admin = await AdminUser.create({
            email,
            role,
            active: true,
            confirmed2SV: {
              confirmed: true,
              confirmedAt: new Date(),
              confirmedBy: 'test-harness'
            },
            createdBy: 'test-harness'
          });
        }
        const now = Date.now();
        req.session.adminId = admin._id;
        req.session.adminEmail = admin.email;
        req.session.adminRole = admin.role;
        const authTime = req.body?.authTime || req.query?.authTime;
        req.session.adminAuthTime = authTime ? Number(authTime) : now;
        req.session.adminSessionCreatedAt = now;
        req.session.adminLastActiveAt = now;

        req.session.save((err) => {
          if (err) return next(err);
          if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ success: true, admin: { id: admin._id, email: admin.email, role: admin.role } });
          }
          res.redirect('/admin');
        });
      } catch (err) {
        next(err);
      }
    };

    app.get(['/admin/test-login', '/__test/admin-login'], handleTestAdminLogin);
    app.post(['/admin/test-login', '/__test/admin-login'], handleTestAdminLogin);
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
