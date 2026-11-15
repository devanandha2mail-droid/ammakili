const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const webhookController = require('../controllers/webhookController');

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // max 60 webhook events per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMITS !== 'true',
  message: { error: 'Too many webhook requests from this IP, please try again in a minute.' }
});

router.post('/razorpay', webhookLimiter, webhookController.handleRazorpayWebhook);

module.exports = router;
