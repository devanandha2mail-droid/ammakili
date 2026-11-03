const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin, redirectIfAuthenticated } = require('../middleware/auth');
const { upload } = require('../services/upload');

// Auth routes
router.get('/login', redirectIfAuthenticated, adminController.getLogin);
router.post('/login', redirectIfAuthenticated, adminController.postLogin);
router.get('/logout', adminController.logout);

// Protect all following routes with requireAdmin
router.use(requireAdmin);

// Dashboard
router.get('/', adminController.getDashboard);

// Products
router.get('/products', adminController.getProducts);
router.get('/products/add', adminController.getAddProduct);
router.post('/products/add', upload.array('images', 6), adminController.postAddProduct);
router.get('/products/edit/:id', adminController.getEditProduct);
router.post('/products/edit/:id', upload.array('images', 6), adminController.postEditProduct);
router.post('/products/delete/:id', adminController.deleteProduct);

// Orders
router.get('/orders', adminController.getOrders);
router.get('/orders/export/csv', adminController.exportOrdersCsv);
router.get('/orders/:id', adminController.getOrderDetail);
router.post('/orders/:id/status', adminController.postUpdateOrderStatus);
router.get('/orders/:id/packing-slip', adminController.getPackingSlip);

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

