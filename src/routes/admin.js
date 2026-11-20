const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const adminController = require('../controllers/adminController');
const adminAuthController = require('../controllers/adminAuthController');
const adminUserController = require('../controllers/adminUserController');
const { requireAdmin, requireOwner, requireFreshAuth, redirectIfAuthenticated } = require('../middleware/auth');
const { upload } = require('../services/upload');
const stylistUpload = require('../services/stylistUpload');
const { doubleCsrfProtection } = require('../middleware/csrf');

const stylistLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});

const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMITS !== 'true',
  message: 'Too many login attempts. Please try again later.'
});

// 1. Administrative Authentication Routes (Google OAuth Only)
router.get('/login', redirectIfAuthenticated, adminAuthController.getLogin);
router.get('/auth/google', adminAuthLimiter, adminAuthController.startGoogleAuth);
router.get(['/auth/google/callback', '/login/auth/google/callback'], adminAuthLimiter, adminAuthController.handleGoogleCallback);
router.get('/logout', adminAuthController.logout);
router.post('/sign-out-everywhere', requireAdmin, adminAuthController.signOutEverywhere);

// 2. Protect all following routes with requireAdmin
router.use(requireAdmin);

// Dashboard
router.get('/', adminController.getDashboard);

// Products (Staff & Owner)
router.get('/products', adminController.getProducts);
router.get('/products/add', adminController.getAddProduct);
router.post('/products/add', upload.array('images', 10), doubleCsrfProtection, adminController.postAddProduct);
router.get('/products/edit/:id', adminController.getEditProduct);
router.post('/products/edit/:id', upload.array('images', 10), doubleCsrfProtection, adminController.postEditProduct);
router.post('/products/delete/:id', adminController.deleteProduct);

// Photo Stylist Routes (Staff & Owner)
router.post('/stylist/upload', stylistLimiter, stylistUpload.upload.array('photos', 10), doubleCsrfProtection, adminController.postStylistUpload);
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
// Refunds are Owner-only and require fresh authentication
router.post('/orders/:id/retry-refund', requireOwner, requireFreshAuth, adminController.postRetryRefund);
router.get('/orders/:id/packing-slip', adminController.getPackingSlip);

// Team Management (Owner Only, Sensitive modifications require fresh auth)
router.get('/users', requireOwner, adminUserController.getUsers);
router.post('/users/add', requireOwner, requireFreshAuth, adminUserController.postAddUser);
router.post('/users/toggle-active/:id', requireOwner, requireFreshAuth, adminUserController.postToggleActive);
router.post('/users/toggle-role/:id', requireOwner, requireFreshAuth, adminUserController.postToggleRole);
router.post('/users/delete/:id', requireOwner, requireFreshAuth, adminUserController.postDeleteUser);
router.post('/users/confirm-2sv/:id', requireOwner, adminUserController.postConfirm2SV);

// Audit Logs (Owner Only)
router.get('/audit-logs', requireOwner, adminUserController.getAuditLogs);

// System Diagnostics & Proxy Check
router.get('/diagnostics', adminController.getDiagnostics);

// Customers (Read-Only)
router.get('/customers', adminController.getCustomers);
router.get('/customers/:id', adminController.getCustomerDetail);

// Banners (Staff & Owner)
router.get('/banners', adminController.getBanners);
router.post('/banners/create', adminController.postCreateBanner);
router.post('/banners/delete/:id', adminController.deleteBanner);

// Settings (Owner Only, Sensitive modifications require fresh auth)
router.get('/settings', requireOwner, adminController.getSettings);
router.post('/settings', requireOwner, requireFreshAuth, adminController.postSettings);

module.exports = router;
