const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');
const { validateBody } = require('../middleware/validate');
const { checkoutCreateSchema, checkoutVerifySchema, checkoutCancelSchema } = require('../validation/schemas');

router.get('/', checkoutController.getCheckout);
router.post('/create', validateBody(checkoutCreateSchema), checkoutController.createOrder);
router.post('/verify', validateBody(checkoutVerifySchema), checkoutController.verifyPayment);
router.post('/cancel', validateBody(checkoutCancelSchema), checkoutController.cancelOrder);
router.post('/fail', checkoutController.failPayment);
router.get('/confirmation/:orderId', checkoutController.getConfirmation);

module.exports = router;

