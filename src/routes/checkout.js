const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');

router.get('/', checkoutController.getCheckout);
router.post('/create', checkoutController.createOrder);
router.post('/verify', checkoutController.verifyPayment);
router.get('/confirmation/:orderId', checkoutController.getConfirmation);

module.exports = router;

