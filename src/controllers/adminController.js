const mongoose = require('mongoose');
const slugify = require('slugify');
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const Order = require('../models/Order');
const AdminUser = require('../models/AdminUser');
const Customer = require('../models/Customer');
const Settings = require('../models/Settings');
const Banner = require('../models/Banner');
const PhotoJob = require('../models/PhotoJob');
const photoStylist = require('../services/photoStylist');
const photoJobWorker = require('../services/photoJobWorker');
const stylistUpload = require('../services/stylistUpload');
const { processUploadedFiles } = require('../services/upload');
const { logAdminAction } = require('../services/auditLogger');

// Admin Dashboard
exports.getDashboard = async (req, res, next) => {
  try {
    let settings = res.locals.settings || { lowStockThreshold: 3 };
    let todayOrdersCount = 0;
    let weekOrders = [];
    let monthOrders = [];
    let ordersToPackCount = 0;
    let lowStockProducts = [];
    let recentOrders = [];
    let activeProducts = [];
    let activeAdmins = [];

    if (mongoose.connection.readyState === 1) {
      try {
        const dbSettings = await Settings.getSettings();
        if (dbSettings) settings = dbSettings;
        const lowStockThreshold = settings.lowStockThreshold || 3;
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        [
          todayOrdersCount,
          weekOrders,
          monthOrders,
          ordersToPackCount,
          lowStockProducts,
          recentOrders,
          activeProducts,
          activeAdmins
        ] = await Promise.all([
          Order.countDocuments({ createdAt: { $gte: startOfToday } }),
          Order.find({
            status: { $in: ['paid', 'packed', 'shipped', 'delivered'] },
            createdAt: { $gte: sevenDaysAgo }
          }),
          Order.find({
            status: { $in: ['paid', 'packed', 'shipped', 'delivered'] },
            createdAt: { $gte: startOfMonth }
          }),
          Order.countDocuments({ status: 'paid' }),
          Product.find({
            active: true,
            'sizes.stock': { $lte: lowStockThreshold }
          }),
          Order.find().sort({ createdAt: -1 }).limit(8),
          Product.find({ active: true }).select('photos'),
          AdminUser.find({ active: true })
        ]);
      } catch (e) {
        console.warn('[Admin Dashboard] DB Query warning:', e.message);
      }
    }

    const revenueWeek = weekOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const revenueMonth = monthOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // Compute Live Launch Checklist
    const prodsWithTwoPhotos = activeProducts.filter(p => p.photos && p.photos.length >= 2);
    const hasFourProds = activeProducts.length >= 4 && prodsWithTwoPhotos.length >= 4;

    const hasBizDetails = !!(
      settings.legalBusinessName &&
      settings.tradeName &&
      settings.registeredAddress &&
      settings.operatingAddress &&
      settings.contactEmail &&
      settings.contactPhone &&
      settings.businessHours
    );
    const hasGrievance = !!(
      settings.grievanceOfficer?.name &&
      settings.grievanceOfficer?.email &&
      settings.grievanceOfficer?.phone
    );
    const settingsComplete = hasBizDetails && hasGrievance;

    const isLiveKey = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID.startsWith('rzp_live_'));
    const reconRecent = Boolean(
      settings.lastReconciliationAt && (now - new Date(settings.lastReconciliationAt).getTime() < 24 * 60 * 60 * 1000)
    );
    const backupSet = Boolean(settings.lastBackupAt);
    const confirmed2SVCount = activeAdmins.filter(a => Boolean((a.confirmed2SV && a.confirmed2SV.confirmed) || a.twoStepConfirmedAt)).length;
    const all2SVConfirmed = activeAdmins.length > 0 && confirmed2SVCount === activeAdmins.length;

    const launchChecklist = [
      {
        id: 'products',
        ok: hasFourProds,
        title: 'At least 4 active products with ≥2 photos each',
        detail: `${prodsWithTwoPhotos.length}/${activeProducts.length} qualifying products`,
        link: '/admin/products'
      },
      {
        id: 'settings',
        ok: settingsComplete,
        title: 'All business details & grievance officer info filled',
        detail: settingsComplete ? 'Complete' : 'Incomplete business profile',
        link: '/admin/settings'
      },
      {
        id: 'legal',
        ok: Boolean(settings.legalPagesConfirmed),
        title: 'Legal policy pages confirmed by client',
        detail: settings.legalPagesConfirmed ? 'Confirmed' : 'Pending client approval',
        link: '/admin/settings'
      },
      {
        id: 'whatsapp',
        ok: Boolean(settings.whatsappNumber && settings.whatsappNumber.length >= 10),
        title: 'Support WhatsApp number configured',
        detail: settings.whatsappNumber || 'Not set',
        link: '/admin/settings'
      },
      {
        id: 'payments',
        ok: isLiveKey,
        title: 'Payment gateway configured in Live mode',
        detail: isLiveKey ? 'Live mode active' : (process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') ? 'Test mode (rzp_test_...)' : 'Keys not configured'),
        link: '/admin/settings'
      },
      {
        id: 'reconciliation',
        ok: reconRecent,
        title: 'Webhook reconciliation ran within last 24 hours',
        detail: settings.lastReconciliationAt ? `Last run: ${new Date(settings.lastReconciliationAt).toLocaleString('en-IN')}` : 'Never executed',
        link: '/admin/orders'
      },
      {
        id: 'backup',
        ok: backupSet,
        title: 'Database backup verified',
        detail: settings.lastBackupAt ? `Last backup: ${new Date(settings.lastBackupAt).toLocaleString('en-IN')}` : 'No backup recorded',
        link: '/admin/settings'
      },
      {
        id: 'twoStep',
        ok: all2SVConfirmed,
        title: 'Google 2-Step Verification confirmed for all admins',
        detail: `${confirmed2SVCount}/${activeAdmins.length} confirmed`,
        link: '/admin/users'
      }
    ];

    let stylistStats = { queueLength: 0, activeJobs: 0, completedToday: 0, failedToday: 0, totalProcessed: 0 };
    let failedStylistJobs = [];
    if (mongoose.connection.readyState === 1) {
      try {
        stylistStats = await photoJobWorker.getStylistStats();
        failedStylistJobs = await PhotoJob.find({ status: 'failed' }).sort({ finishedAt: -1 }).limit(10);
      } catch (e) {
        console.warn('[Admin Dashboard] Stylist stats warning:', e.message);
      }
    }

    res.render('admin/dashboard', {
      layout: 'layouts/admin',
      title: 'Dashboard',
      stats: {
        todayOrdersCount,
        revenueWeek,
        revenueMonth,
        ordersToPackCount,
        lowStockCount: lowStockProducts.length
      },
      lowStockProducts,
      recentOrders,
      settings,
      launchChecklist,
      stylistStats,
      failedStylistJobs
    });
  } catch (err) {
    next(err);
  }
};

// ==================== PRODUCTS ====================

// List Products
exports.getProducts = async (req, res, next) => {
  try {
    const { q, style, status } = req.query;
    const filter = {};

    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [{ 'name.en': regex }, { 'name.ml': regex }, { slug: regex }];
    }
    if (style) {
      filter.style = style;
    }
    if (status === 'active') filter.active = true;
    if (status === 'inactive') filter.active = false;

    const products = await Product.find(filter).sort({ createdAt: -1 });
    const styles = await Product.distinct('style');

    res.render('admin/products', {
      layout: 'layouts/admin',
      title: 'Manage Products',
      products,
      styles,
      q: q || '',
      selectedStyle: style || '',
      selectedStatus: status || ''
    });
  } catch (err) {
    next(err);
  }
};

// Add Product GET
exports.getAddProduct = async (req, res) => {
  const isStylistAvailable = await photoStylist.isAvailable();
  const draftId = 'draft-' + Date.now() + '-' + Math.round(Math.random() * 1e9);
  res.render('admin/product-form', {
    layout: 'layouts/admin',
    title: 'Add New Nighty',
    product: null,
    sizes: ['M', 'L', 'XL', 'XXL', '3XL'],
    isStylistAvailable,
    draftId,
    existingJobs: []
  });
};

// Add Product POST
exports.postAddProduct = async (req, res, next) => {
  try {
    const {
      name_en,
      name_ml,
      description_en,
      description_ml,
      style,
      price,
      videoUrl,
      fabric_en,
      fabric_ml,
      care_en,
      care_ml,
      fit_en,
      fit_ml,
      tag,
      featured,
      active,
      draftId,
      styled_images_json
    } = req.body;

    const uploadedUrls = await processUploadedFiles(req.files);

    // Build sizes array
    const sizes = ['M', 'L', 'XL', 'XXL', '3XL'].map(s => ({
      size: s,
      stock: Math.max(0, parseInt(req.body[`stock_${s}`], 10) || 0)
    }));

    // Process images (styled json or uploaded files)
    let finalImages = [];
    if (styled_images_json) {
      try {
        const parsed = JSON.parse(styled_images_json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          finalImages = parsed.map(item => ({
            url: item.url,
            kind: item.kind || 'extra',
            sourceId: item.sourceId || '',
            meta: item.meta || {}
          }));
        }
      } catch (err) {
        console.warn('Could not parse styled_images_json:', err.message);
      }
    }

    if (!finalImages.length) {
      finalImages = uploadedUrls.map(url => ({ url, kind: 'extra' }));
    }

    // Generate unique slug
    let baseSlug = slugify(name_en, { lower: true, strict: true }) || 'nighty';
    let slug = baseSlug;
    let counter = 1;
    while (await Product.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const newProduct = await Product.create({
      slug,
      name: { en: (name_en || '').trim(), ml: (name_ml || '').trim() },
      description: { en: (description_en || '').trim(), ml: (description_ml || '').trim() },
      style: style || 'Cotton',
      price: parseFloat(price) || 0,
      images: finalImages,
      videoUrl: (videoUrl || '').trim(),
      fabric: { en: (fabric_en || '').trim(), ml: (fabric_ml || '').trim() },
      care: { en: (care_en || '').trim(), ml: (care_ml || '').trim() },
      fit: { en: (fit_en || '').trim(), ml: (fit_ml || '').trim() },
      sizes,
      tag: tag || 'None',
      featured: Boolean(featured),
      active: active !== 'false'
    });

    // Link any draft jobs to this created product
    if (draftId) {
      await PhotoJob.updateMany({ draftId }, { $set: { productId: newProduct._id } });
    }

    await logAdminAction({
      req,
      action: 'PRODUCT_CREATED',
      target: newProduct.slug,
      details: { name: newProduct.name.en, price: newProduct.price, sizes: newProduct.sizes }
    });

    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
};

// Edit Product GET
exports.getEditProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.redirect('/admin/products');

    const isStylistAvailable = await photoStylist.isAvailable();
    const existingJobs = await PhotoJob.find({ productId: product._id }).sort({ createdAt: -1 });

    res.render('admin/product-form', {
      layout: 'layouts/admin',
      title: `Edit ${product.name.en}`,
      product,
      sizes: ['M', 'L', 'XL', 'XXL', '3XL'],
      isStylistAvailable,
      draftId: 'edit-' + product._id,
      existingJobs
    });
  } catch (err) {
    next(err);
  }
};

// Edit Product POST
exports.postEditProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.redirect('/admin/products');

    const {
      name_en,
      name_ml,
      description_en,
      description_ml,
      style,
      price,
      videoUrl,
      fabric_en,
      fabric_ml,
      care_en,
      care_ml,
      fit_en,
      fit_ml,
      tag,
      featured,
      active,
      existing_images,
      styled_images_json
    } = req.body;

    const newUploadedUrls = await processUploadedFiles(req.files);

    let finalImages = [];
    if (styled_images_json) {
      try {
        const parsed = JSON.parse(styled_images_json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          finalImages = parsed.map(item => ({
            url: item.url,
            kind: item.kind || 'extra',
            sourceId: item.sourceId || '',
            meta: item.meta || {}
          }));
        }
      } catch (err) {
        console.warn('Could not parse styled_images_json:', err.message);
      }
    }

    if (!finalImages.length) {
      // Retained images
      let retained = [];
      if (existing_images) {
        retained = Array.isArray(existing_images) ? existing_images : [existing_images];
      }
      finalImages = [...retained, ...newUploadedUrls].map(item => {
        if (typeof item === 'string') return { url: item, kind: 'extra' };
        return item;
      });
    }

    // Build sizes array
    const sizes = ['M', 'L', 'XL', 'XXL', '3XL'].map(s => ({
      size: s,
      stock: Math.max(0, parseInt(req.body[`stock_${s}`], 10) || 0)
    }));

    product.name.en = name_en.trim();
    product.name.ml = (name_ml || '').trim();
    product.description.en = description_en.trim();
    product.description.ml = (description_ml || '').trim();
    product.style = style || 'Cotton';
    product.price = parseFloat(price) || 0;
    product.images = finalImages.length ? finalImages : product.images;
    product.videoUrl = (videoUrl || '').trim();
    product.fabric = { en: (fabric_en || '').trim(), ml: (fabric_ml || '').trim() };
    product.care = { en: (care_en || '').trim(), ml: (care_ml || '').trim() };
    product.fit = { en: (fit_en || '').trim(), ml: (fit_ml || '').trim() };
    product.sizes = sizes;
    product.tag = tag || 'None';
    product.featured = Boolean(featured);
    product.active = Boolean(active);

    await product.save();

    await logAdminAction({
      req,
      action: 'PRODUCT_UPDATED',
      target: product.slug,
      details: {
        price: product.price,
        sizes: product.sizes,
        active: product.active
      }
    });

    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
};

// Toggle or Delete Product
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      // 1. Delete associated PhotoJobs and their files on disk
      const jobs = await PhotoJob.find({ productId: product._id });
      for (const job of jobs) {
        photoJobWorker.deleteJobFiles(job);
        await job.deleteOne();
      }

      // 2. Delete any custom uploaded image files in product.images
      if (product.images && product.images.length) {
        for (const img of product.images) {
          const imgUrl = typeof img === 'string' ? img : img.url;
          if (imgUrl && imgUrl.startsWith('/uploads/')) {
            try {
              const fullPath = path.join(__dirname, '../../public', imgUrl);
              if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            } catch {}
          }
        }
      }

      await Product.findByIdAndDelete(req.params.id);

      await logAdminAction({
        req,
        action: 'PRODUCT_DELETED',
        target: product.slug,
        details: { name: product.name.en, id: product._id }
      });
    }
    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
};

// ==================== ORDERS ====================

// List Orders
exports.getOrders = async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const filter = {};

    if (status === 'refunds') {
      filter.status = { $in: ['refund_needed', 'refund_pending', 'refunded'] };
    } else if (status === 'refund_needed') {
      filter.status = 'refund_needed';
    } else if (status && status !== 'all') {
      filter.status = status;
    }
    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { orderId: regex },
        { 'customer.name': regex },
        { 'customer.phone': regex }
      ];
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 });

    res.render('admin/orders', {
      layout: 'layouts/admin',
      title: 'Orders',
      orders,
      currentStatus: status || 'all',
      q: q || ''
    });
  } catch (err) {
    next(err);
  }
};

// Order Detail GET
exports.getOrderDetail = async (req, res, next) => {
  try {
    let order = null;
    if (mongoose.connection.readyState === 1) {
      try {
        order = await Order.findById(req.params.id);
        if (!order) {
          order = await Order.findOne({ orderId: req.params.id });
        }
      } catch (e) {
        order = await Order.findOne({ orderId: req.params.id }).catch(() => null);
      }
    }

    if (!order) {
      return res.redirect('/admin/orders');
    }

    // Ensure nested structures are always safe objects
    if (!order.customer) order.customer = {};
    if (!order.payment) order.payment = { status: 'pending', method: 'Razorpay' };
    if (!order.tracking) order.tracking = { courier: '', trackingId: '' };

    // Resilient settings retrieval
    let settings = res.locals.settings;
    if (!settings && mongoose.connection.readyState === 1) {
      try {
        settings = await Settings.getSettings();
      } catch (e) {
        settings = { shippingCharge: 60 };
      }
    }
    if (!settings) settings = { shippingCharge: 60 };

    // Prefill WhatsApp message based on current order status
    const custName = order.customer.name || 'Customer';
    const orderDisplayId = order.orderId || String(order._id);
    const orderStatusUpper = (order.status || 'pending').toUpperCase();

    let statusText = `Your order ${orderDisplayId} status has been updated to ${orderStatusUpper}.`;
    if (order.status === 'packed') {
      statusText = `Hello ${custName},\nYour Nest by Ammakkili nighty order (${orderDisplayId}) has been packed with care and is ready for courier pickup!`;
    } else if (order.status === 'shipped') {
      statusText = `Hello ${custName},\nGreat news! Your order (${orderDisplayId}) has been shipped via ${order.tracking?.courier || 'courier'}. Tracking ID: ${order.tracking?.trackingId || 'In transit'}. You can track your parcel on our website.`;
    }

    const rawPhone = (order.customer.phone || '').replace(/\D/g, '');
    const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(statusText)}` : '#';

    res.render('admin/order-detail', {
      layout: 'layouts/admin',
      title: `Order ${orderDisplayId}`,
      order,
      waLink,
      settings
    });
  } catch (err) {
    next(err);
  }
};

// Update Order Status POST
exports.postUpdateOrderStatus = async (req, res, next) => {
  try {
    const { status, courier, trackingId, adminNotes } = req.body;
    let order = null;
    if (mongoose.connection.readyState === 1) {
      try {
        order = await Order.findById(req.params.id);
        if (!order) {
          order = await Order.findOne({ orderId: req.params.id });
        }
      } catch (e) {
        order = await Order.findOne({ orderId: req.params.id }).catch(() => null);
      }
    }
    if (!order) return res.redirect('/admin/orders');

    if (status) {
      order.status = status;
      if (status === 'cancelled' || status === 'failed') {
        const { returnStockForOrder } = require('./checkoutController');
        await returnStockForOrder(order);
      }
    }
    if (!order.tracking) {
      order.tracking = { courier: '', trackingId: '' };
    }
    if (courier !== undefined) order.tracking.courier = courier.trim();
    if (trackingId !== undefined) order.tracking.trackingId = trackingId.trim();
    if (adminNotes !== undefined) order.adminNotes = adminNotes.trim();

    await order.save();

    await logAdminAction({
      req,
      action: 'ORDER_STATUS_UPDATED',
      target: order.orderId || String(order._id),
      details: { status: order.status, courier: order.tracking?.courier, trackingId: order.tracking?.trackingId }
    });

    res.redirect(`/admin/orders/${order._id}`);
  } catch (err) {
    next(err);
  }
};

// Retry failed refund for order in refund_needed
exports.postRetryRefund = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.redirect('/admin/orders');

    const paymentId = order.payment?.razorpayPaymentId;
    if (!paymentId) {
      return res.redirect(`/admin/orders/${order._id}?error=no_payment_id`);
    }

    const { refundRazorpayPayment } = require('../services/razorpay');
    const { returnStockForOrder } = require('./checkoutController');

    // Ensure stock returned if not returned
    await returnStockForOrder(order);

    const refundRes = await refundRazorpayPayment({
      paymentId,
      amountInPaise: Math.round(order.total * 100),
      notes: {
        orderId: order.orderId,
        reason: 'Manual refund retry from Admin Portal'
      }
    });

    order.status = 'refunded';
    order.refund = {
      id: refundRes.id,
      amount: refundRes.amount ? refundRes.amount / 100 : order.total,
      status: 'processed',
      initiatedAt: new Date()
    };
    order.payment.status = 'refunded';
    order.adminNotes = (order.adminNotes ? order.adminNotes + '\n' : '') + `Refund manually retried and processed. Refund ID: ${refundRes.id}`;
    await order.save();

    await logAdminAction({
      req,
      action: 'ADMIN_REFUND_ISSUED',
      target: order.readableId || String(order._id),
      details: { refundId: refundRes.id, amount: order.total }
    });

    res.redirect(`/admin/orders/${order._id}?success=refund_retried`);
  } catch (err) {
    console.error('[Admin Retry Refund Error]:', err);
    res.redirect(`/admin/orders/${req.params.id}?error=${encodeURIComponent(err.message)}`);
  }
};

// System Diagnostics & Client IP Verification
exports.getDiagnostics = (req, res) => {
  const { ipKeyGenerator } = require('express-rate-limit');
  const rateLimitKey = ipKeyGenerator(req.ip, 64);
  res.render('admin/diagnostics', {
    layout: 'layouts/admin',
    title: 'System Diagnostics & Client IP',
    clientIp: req.ip,
    forwardedFor: req.headers['x-forwarded-for'] || 'None',
    rateLimitKey,
    trustProxySetting: req.app.get('trust proxy'),
    trustProxyHopsEnv: process.env.TRUST_PROXY_HOPS !== undefined ? process.env.TRUST_PROXY_HOPS : '1 (default)'
  });
};

// Printable Packing Slip
exports.getPackingSlip = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.redirect('/admin/orders');

    const settings = await Settings.getSettings();

    res.render('admin/packing-slip', {
      layout: false,
      title: `Packing Slip - ${order.orderId}`,
      order,
      settings
    });
  } catch (err) {
    next(err);
  }
};

// Export Orders to CSV
exports.exportOrdersCsv = async (req, res, next) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });

    const headers = [
      'Order ID',
      'Date',
      'Customer Name',
      'Phone',
      'Address',
      'City',
      'PIN',
      'Items Count',
      'Subtotal',
      'Shipping',
      'Total',
      'Status',
      'Courier',
      'Tracking ID'
    ];

    const rows = orders.map(o => [
      `"${o.orderId}"`,
      `"${new Date(o.createdAt).toLocaleDateString()}"`,
      `"${o.customer.name.replace(/"/g, '""')}"`,
      `"${o.customer.phone}"`,
      `"${o.customer.address.replace(/"/g, '""')}"`,
      `"${o.customer.city.replace(/"/g, '""')}"`,
      `"${o.customer.pin}"`,
      `"${o.items.reduce((s, i) => s + i.quantity, 0)}"`,
      `"${o.subtotal}"`,
      `"${o.shipping}"`,
      `"${o.total}"`,
      `"${o.status}"`,
      `"${(o.tracking?.courier || '').replace(/"/g, '""')}"`,
      `"${(o.tracking?.trackingId || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="nest-ammakkili-orders-${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
};

// ==================== CUSTOMERS (READ-ONLY) ====================

// List Customers
exports.getCustomers = async (req, res, next) => {
  try {
    const { q } = req.query;
    const filter = {};

    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const customers = await Customer.find(filter).sort({ createdAt: -1 });

    // Aggregate orders count for each customer
    const customersWithStats = await Promise.all(
      customers.map(async (c) => {
        const orderCount = await Order.countDocuments({
          $or: [{ customerId: c._id }, { 'customer.email': c.email }]
        });
        return {
          ...c.toObject(),
          orderCount
        };
      })
    );

    res.render('admin/customers', {
      layout: 'layouts/admin',
      title: 'Customer Directory',
      customers: customersWithStats,
      q: q || ''
    });
  } catch (err) {
    next(err);
  }
};

// Customer Detail & Orders
exports.getCustomerDetail = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.redirect('/admin/customers');

    const orders = await Order.find({
      $or: [{ customerId: customer._id }, { 'customer.email': customer.email }]
    }).sort({ createdAt: -1 });

    res.render('admin/customer-detail', {
      layout: 'layouts/admin',
      title: `Customer: ${customer.name}`,
      customer,
      orders
    });
  } catch (err) {
    next(err);
  }
};

// ==================== BANNERS ====================

// List Banners
exports.getBanners = async (req, res, next) => {
  try {
    const banners = await Banner.find().sort({ createdAt: -1 });
    res.render('admin/banners', {
      layout: 'layouts/admin',
      title: 'Banners',
      banners
    });
  } catch (err) {
    next(err);
  }
};

// Create Banner POST
exports.postCreateBanner = async (req, res, next) => {
  try {
    const { text_en, text_ml, link, startsAt, endsAt, active } = req.body;
    await Banner.create({
      text: { en: text_en.trim(), ml: (text_ml || '').trim() },
      link: (link || '/shop').trim(),
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      endsAt: endsAt ? new Date(endsAt) : null,
      active: Boolean(active)
    });
    res.redirect('/admin/banners');
  } catch (err) {
    next(err);
  }
};

// Delete Banner
exports.deleteBanner = async (req, res, next) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    res.redirect('/admin/banners');
  } catch (err) {
    next(err);
  }
};

// ==================== SETTINGS ====================

// Get Settings
exports.getSettings = async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();
    res.render('admin/settings', {
      layout: 'layouts/admin',
      title: 'Store Settings',
      settings,
      saved: req.query.saved === '1'
    });
  } catch (err) {
    next(err);
  }
};

// Update Settings POST
exports.postSettings = async (req, res, next) => {
  try {
    const {
      legalBusinessName,
      tradeName,
      registeredAddress,
      operatingAddress,
      contactEmail,
      contactPhone,
      whatsappNumber,
      gstin,
      businessHours,
      grievanceOfficerName,
      grievanceOfficerDesignation,
      grievanceOfficerEmail,
      grievanceOfficerPhone,
      shippingCharge,
      minDeliveryDays,
      maxDeliveryDays,
      refundTimelineDays,
      announcement_en,
      announcement_ml,
      lowStockThreshold,
      youtube,
      legalPagesConfirmed
    } = req.body;

    let gstinVal = (gstin || '').trim().toUpperCase();
    if (gstinVal) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(gstinVal)) {
        return res.redirect('/admin/settings?error=invalid_gstin');
      }
    }

    const settings = await Settings.getSettings();

    // Business Identification
    if (legalBusinessName !== undefined) settings.legalBusinessName = legalBusinessName.trim();
    if (tradeName !== undefined) settings.tradeName = tradeName.trim() || 'Nest by Ammakkili';
    if (registeredAddress !== undefined) settings.registeredAddress = registeredAddress.trim();
    if (operatingAddress !== undefined) settings.operatingAddress = operatingAddress.trim();
    if (contactEmail !== undefined) settings.contactEmail = contactEmail.trim().toLowerCase();
    if (contactPhone !== undefined) settings.contactPhone = contactPhone.trim();
    if (whatsappNumber !== undefined) settings.whatsappNumber = (whatsappNumber || '').replace(/\D/g, '') || '919846012345';
    settings.gstin = gstinVal;
    if (businessHours !== undefined) settings.businessHours = businessHours.trim();

    // Grievance Officer
    if (!settings.grievanceOfficer) settings.grievanceOfficer = {};
    if (grievanceOfficerName !== undefined) settings.grievanceOfficer.name = grievanceOfficerName.trim();
    if (grievanceOfficerDesignation !== undefined) settings.grievanceOfficer.designation = grievanceOfficerDesignation.trim();
    if (grievanceOfficerEmail !== undefined) settings.grievanceOfficer.email = grievanceOfficerEmail.trim().toLowerCase();
    if (grievanceOfficerPhone !== undefined) settings.grievanceOfficer.phone = grievanceOfficerPhone.trim();

    // Shipping & Delivery
    if (shippingCharge !== undefined) settings.shippingCharge = Math.max(0, parseFloat(shippingCharge) || 60);
    if (minDeliveryDays !== undefined) settings.minDeliveryDays = Math.max(1, parseInt(minDeliveryDays, 10) || 3);
    if (maxDeliveryDays !== undefined) settings.maxDeliveryDays = Math.max(settings.minDeliveryDays, parseInt(maxDeliveryDays, 10) || 7);
    if (refundTimelineDays !== undefined) settings.refundTimelineDays = Math.max(1, parseInt(refundTimelineDays, 10) || 7);

    // Announcement and storefront
    if (announcement_en !== undefined) settings.announcementText.en = (announcement_en || '').trim();
    if (announcement_ml !== undefined) settings.announcementText.ml = (announcement_ml || '').trim();
    if (lowStockThreshold !== undefined) settings.lowStockThreshold = Math.max(1, parseInt(lowStockThreshold, 10) || 3);
    if (!settings.social) settings.social = {};
    if (youtube !== undefined) settings.social.youtube = (youtube || '').trim();

    // Legal Confirmation Checkbox
    const isConfirmed = legalPagesConfirmed === 'true' || legalPagesConfirmed === 'on' || legalPagesConfirmed === '1';
    if (isConfirmed && !settings.legalPagesConfirmed) {
      settings.legalPagesConfirmed = true;
      settings.legalPagesConfirmedAt = new Date();
      settings.legalPagesConfirmedBy = req.admin?.email || req.session?.adminEmail || 'owner';
    } else if (!isConfirmed && settings.legalPagesConfirmed) {
      settings.legalPagesConfirmed = false;
      settings.legalPagesConfirmedAt = null;
      settings.legalPagesConfirmedBy = null;
    }

    await settings.save();

    try {
      const { logAdminAction } = require('../services/auditLogger');
      await logAdminAction({
        req,
        action: 'settings_updated',
        target: 'Settings',
        details: {
          legalBusinessName: settings.legalBusinessName,
          tradeName: settings.tradeName,
          legalPagesConfirmed: settings.legalPagesConfirmed
        }
      });
    } catch (e) {}

    res.redirect('/admin/settings?saved=1');
  } catch (err) {
    next(err);
  }
};

// ==================== PHOTO STYLIST API (Admin Only) ====================

// Upload Photos to Stylist
exports.postStylistUpload = async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'No photos uploaded.' });
    }
    const { productId, draftId, mode, hanger, background } = req.body;
    const isStylistAvailable = await photoStylist.isAvailable(1000);
    const jobs = [];

    for (const file of req.files) {
      try {
        const result = await stylistUpload.processStylistUpload(file, {
          productId: productId || null,
          draftId: draftId || null,
          mode: mode || 'auto',
          hanger: hanger || 'auto',
          background: background || 'pink',
          isStylistAvailable
        });
        jobs.push({
          jobId: result.job._id,
          originalUrl: result.originalUrl,
          status: result.job.status,
          options: result.job.options,
          warning: result.lowResWarning,
          width: result.width,
          height: result.height,
          meta: result.job.meta
        });
      } catch (uploadErr) {
        return res.status(422).json({ error: uploadErr.message });
      }
    }

    res.json({ success: true, jobs });
  } catch (err) {
    console.error('[Stylist Upload] Error:', err);
    res.status(500).json({ error: 'Failed to process photo upload.' });
  }
};

// Check Job Status
exports.getStylistJobStatus = async (req, res) => {
  try {
    const job = await PhotoJob.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Stylist job not found' });

    res.json({
      success: true,
      job: {
        id: job._id,
        status: job.status,
        originalUrl: job.originalUrl,
        resultKey: job.resultKey,
        detailKey: job.detailKey,
        styled_ok: job.styled_ok ?? job.meta?.styled_ok,
        mode_used: job.mode_used ?? job.meta?.mode_used,
        variants: job.variants,
        options: job.options,
        meta: job.meta,
        error: job.error
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stylist job status' });
  }
};

// Restyle Photo from Stored Original
exports.postStylistRestyle = async (req, res) => {
  try {
    const { mode, hanger, background } = req.body;
    const job = await photoJobWorker.retryJob(req.params.id, { mode, hanger, background });
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to restyle photo' });
  }
};

// Retry Failed Job
exports.postStylistRetry = async (req, res) => {
  try {
    const job = await photoJobWorker.retryJob(req.params.id);
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to retry photo job' });
  }
};

// Delete Photo Job and disk files
exports.postStylistDelete = async (req, res) => {
  try {
    const job = await PhotoJob.findById(req.params.id);
    if (job) {
      photoJobWorker.deleteJobFiles(job);
      await job.deleteOne();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete photo job' });
  }
};

// Stylist Service & Queue Health / Stats
exports.getStylistStatus = async (req, res) => {
  try {
    const stats = await photoJobWorker.getStylistStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get photo stylist status' });
  }
};

