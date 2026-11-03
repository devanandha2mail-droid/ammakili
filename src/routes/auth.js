const express = require('express');
const router = express.Router();
const customerAuthController = require('../controllers/customerAuthController');
const rateLimit = require('express-rate-limit');

// Rate limiting on customer auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: 'Too many authentication attempts from this IP, please try again in 15 minutes.'
});

router.get('/login', customerAuthController.getLogin);
router.post('/logout', customerAuthController.postLogout);

router.get('/auth/google', authLimiter, customerAuthController.startGoogleAuth);
router.get('/auth/google/callback', authLimiter, customerAuthController.handleGoogleCallback);
router.get('/auth/google/test-login', authLimiter, customerAuthController.getGoogleTestLogin);

module.exports = router;
