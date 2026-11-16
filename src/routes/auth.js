const express = require('express');
const router = express.Router();
const customerAuthController = require('../controllers/customerAuthController');
const adminAuthController = require('../controllers/adminAuthController');
const rateLimit = require('express-rate-limit');

// Rate limiting on customer auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: 'Too many authentication attempts from this IP, please try again in 15 minutes.'
});

router.get('/login', customerAuthController.getLogin);
router.post('/logout', customerAuthController.postLogout);
router.get('/logout', customerAuthController.postLogout);
router.get('/auth/logout', customerAuthController.postLogout);
router.get('/orders', (req, res) => res.redirect('/account#orders'));

router.get('/auth/google', authLimiter, customerAuthController.startGoogleAuth);
router.get('/auth/google/callback', authLimiter, (req, res, next) => {
  const isAdmin = (req.session && req.session.adminOAuthState) ||
    (typeof req.query.state === 'string' && req.query.state.startsWith('admin_'));
  if (isAdmin) {
    return adminAuthController.handleGoogleCallback(req, res, next);
  }
  return customerAuthController.handleGoogleCallback(req, res, next);
});
router.get('/auth/google/test-login', authLimiter, customerAuthController.getGoogleTestLogin);

module.exports = router;

