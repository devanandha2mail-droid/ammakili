const passport = require('../config/passport');
const Customer = require('../models/Customer');
const { safeReturnUrl } = require('../middleware/customerAuth');

// Render Customer Login Page
exports.getLogin = (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const returnTo = safeReturnUrl(req.query.returnTo);
    return res.redirect(returnTo);
  }

  res.render('pages/login', {
    title: 'Customer Sign In',
    metaDesc: 'Sign in to Nest by Ammakkili using your Google account to manage saved addresses, order history, and synced wishlist.',
    returnTo: safeReturnUrl(req.query.returnTo),
    error: req.query.error || null
  });
};

// Customer Logout POST
exports.postLogout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/');
  });
};

// Start Google OAuth 2.0 flow
exports.startGoogleAuth = (req, res, next) => {
  const returnTo = safeReturnUrl(req.query.returnTo);
  req.session.returnTo = returnTo;

  // In development / test mode with placeholder Google keys:
  const hasRealKeys = process.env.GOOGLE_CLIENT_ID &&
    !process.env.GOOGLE_CLIENT_ID.includes('placeholder') &&
    process.env.GOOGLE_CLIENT_SECRET &&
    !process.env.GOOGLE_CLIENT_SECRET.includes('placeholder');

  if (!hasRealKeys) {
    // Redirect to test login page/handler so automated test & developers can test smoothly
    return res.redirect(`/auth/google/test-login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })(req, res, next);
};

// Google OAuth 2.0 Callback
exports.handleGoogleCallback = (req, res, next) => {
  passport.authenticate('google', async (err, customer, info) => {
    if (err || !customer) {
      console.error('Google OAuth callback error:', err || info);
      return res.redirect('/login?error=' + encodeURIComponent(err?.message || 'Google sign-in was cancelled or failed.'));
    }

    const returnTo = safeReturnUrl(req.session.returnTo);

    // Regenerate session to prevent session fixation attacks
    req.session.regenerate((regenErr) => {
      if (regenErr) return next(regenErr);

      req.login(customer, async (loginErr) => {
        if (loginErr) return next(loginErr);
        res.redirect(returnTo);
      });
    });
  })(req, res, next);
};

// Simulated Dev Test Login for Google Auth (active when placeholder credentials are used)
exports.getGoogleTestLogin = async (req, res, next) => {
  try {
    const returnTo = safeReturnUrl(req.query.returnTo);
    const testEmail = (req.query.email || 'customer.test@example.com').toLowerCase().trim();
    const testName = req.query.name || 'Priya Lakshmi';

    let customer = await Customer.findOne({ email: testEmail });
    if (!customer) {
      customer = await Customer.create({
        googleId: 'google_test_' + Date.now(),
        email: testEmail,
        emailVerified: true,
        name: testName,
        avatarUrl: '/img/brand/logo-full-256.png',
        phone: '9846012345',
        addresses: [{
          label: 'Home',
          name: testName,
          phone: '9846012345',
          address: 'Ammakkili Villa, Palace Road',
          city: 'Thrissur',
          state: 'Kerala',
          pin: '680001',
          isDefault: true
        }],
        lastLoginAt: new Date()
      });
    } else {
      customer.lastLoginAt = new Date();
      await customer.save();
    }

    req.session.regenerate((regenErr) => {
      if (regenErr) return next(regenErr);
      req.login(customer, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.redirect(returnTo);
      });
    });
  } catch (err) {
    next(err);
  }
};

