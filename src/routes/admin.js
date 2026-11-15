const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const adminController = require('../controllers/adminController');
const { requireAdmin, redirectIfAuthenticated } = require('../middleware/auth');
const { upload } = require('../services/upload');
const stylistUpload = require('../services/stylistUpload');

const stylistLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please try again later.'
});

// Auth routes
router.get('/login', redirectIfAuthenticated, adminController.getLogin);
router.post('/login', adminLoginLimiter, redirectIfAuthenticated, adminController.postLogin);
router.get('/logout', adminController.logout);

// Protect all following routes with requireAdmin
router.use(requireAdmin);

// Dashboard
router.get('/', adminController.getDashboard);

// Products
router.get('/products', adminController.getProducts);
router.get('/products/add', adminController.getAddProduct);
router.post('/products/add', upload.array('images', 10), adminController.postAddProduct);
router.post('/products/delete-samples', adminController.deleteSampleProducts);
router.get('/products/edit/:id', adminController.getEditProduct);
router.post('/products/edit/:id', upload.array('images', 10), adminController.postEditProduct);
router.post('/products/delete/:id', adminController.deleteProduct);

// Photo Stylist Routes (Admin Only)
router.post('/stylist/upload', stylistLimiter, stylistUpload.upload.array('photos', 10), adminController.postStylistUpload);
router.get('/stylist/job/:id', adminController.getStylistJobStatus);
router.post('/stylist/restyle/:id', stylistLimiter, adminController.postStylistRestyle);
router.post('/stylist/retry/:id', stylistLimiter, adminController.postStylistRetry);
router.post('/stylist/delete/:id', adminController.postStylistDelete);
router.get('/stylist/status', adminController.getStylistStatus);

// Orders
router.get('/orders', adminController.getOrders);
router.get('/orders/export/csv', adminController.exportOrdersCsv);
router.get('/orders/:id', adminController.getOrderDetail);
router.post('/orders/:id/status', adminController.postUpdateOrderStatus);
router.post('/orders/:id/retry-refund', adminController.postRetryRefund);
router.get('/orders/:id/packing-slip', adminController.getPackingSlip);

// System Diagnostics & Proxy Check
router.get('/diagnostics', adminController.getDiagnostics);

// Customers (Read-Only)
router.get('/customers', adminController.getCustomers);
router.get('/customers/:id', adminController.getCustomerDetail);

// Banners
router.get('/banners', adminController.getBanners);
router.post('/banners/create', adminController.postCreateBanner);
router.post('/banners/delete/:id', adminController.deleteBanner);

// Settings
router.get('/settings', adminController.getSettings);
router.post('/settings', adminController.postSettings);

module.exports = router;

