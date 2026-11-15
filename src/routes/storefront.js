const express = require('express');
const router = express.Router();
const storefrontController = require('../controllers/storefrontController');
const rateLimit = require('express-rate-limit');
const { orderIdTrackLimiter } = require('../middleware/trackOrderLimiter');

// Rate limit: IP-based tracking limiter (max 10 requests per minute per IP /64 subnet)
const trackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // max 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many tracking attempts. Please wait a minute before trying again.'
});

router.get('/', storefrontController.getHome);
router.get('/shop', storefrontController.getShop);
router.get('/product/:slug', storefrontController.getProductDetail);
router.get('/sizes', storefrontController.getSizeGuide);
router.get('/size-guide', storefrontController.getSizeGuide);
router.get('/how-to-order', storefrontController.getHowToOrder);
router.get('/wishlist', storefrontController.getWishlist);
router.get('/api/wishlist-items', storefrontController.getWishlistProducts);
router.get('/about', storefrontController.getAbout);
router.get('/contact', storefrontController.getContact);
router.get('/pricing', storefrontController.getPricing);
router.get('/shipping', storefrontController.getShipping);
router.get('/terms', storefrontController.getTerms);
router.get('/privacy', storefrontController.getPrivacy);
router.get('/refund-policy', storefrontController.getRefundPolicy);
router.get('/grievance', storefrontController.getGrievance);
router.get('/policies', storefrontController.getPolicies);
router.get('/faq', storefrontController.getFaq);
router.get('/track', storefrontController.getTrackOrder);
router.get('/track-order', storefrontController.getTrackOrder);
router.post('/track', trackLimiter, orderIdTrackLimiter, storefrontController.postTrackOrder);
router.post('/track-order', trackLimiter, orderIdTrackLimiter, storefrontController.postTrackOrder);

module.exports = router;

