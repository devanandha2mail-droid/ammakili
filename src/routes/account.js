const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { requireCustomer } = require('../middleware/customerAuth');

router.use(requireCustomer);

router.get('/', accountController.getAccount);
router.post('/profile', accountController.postUpdateProfile);
router.post('/address/add', accountController.postAddAddress);
router.post('/address/edit', accountController.postEditAddress);
router.post('/address/delete', accountController.postDeleteAddress);
router.post('/address/default', accountController.postSetDefaultAddress);
router.post('/wishlist/sync', accountController.postSyncWishlist);
router.post('/delete', accountController.postDeleteAccount);

module.exports = router;
