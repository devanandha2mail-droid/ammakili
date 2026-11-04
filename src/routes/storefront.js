const express = require('express');
const router = express.Router();
const storefrontController = require('../controllers/storefrontController');

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
router.get('/policies', storefrontController.getPolicies);
router.get('/faq', storefrontController.getFaq);
router.get('/track', storefrontController.getTrackOrder);
router.get('/track-order', storefrontController.getTrackOrder);
router.post('/track', storefrontController.postTrackOrder);
router.post('/track-order', storefrontController.postTrackOrder);

module.exports = router;

