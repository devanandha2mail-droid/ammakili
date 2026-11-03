const bcrypt = require('bcryptjs');
const slugify = require('slugify');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Admin = require('../models/Admin');
const Settings = require('../models/Settings');
const Banner = require('../models/Banner');
const { processUploadedFiles } = require('../services/upload');

// Admin Login GET
exports.getLogin = (req, res) => {
  res.render('admin/login', {
    layout: false,
    title: 'Admin Login',
    error: null
  });
};

// Admin Login POST
exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.render('admin/login', {
        layout: false,
        title: 'Admin Login',
        error: 'Please enter both email and password.'
      });
    }

    const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
    if (!admin) {
      return res.render('admin/login', {
        layout: false,
        title: 'Admin Login',
        error: 'Invalid email or password.'
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.render('admin/login', {
        layout: false,
        title: 'Admin Login',
        error: 'Invalid email or password.'
      });
    }

    // Set session
    req.session.adminId = admin._id;
    res.redirect('/admin');
  } catch (err) {
    console.error('Login error:', err);
    res.render('admin/login', {
      layout: false,
      title: 'Admin Login',
      error: 'An unexpected error occurred.'
    });
  }
};

// Admin Logout
exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
};

// Admin Dashboard
exports.getDashboard = async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();
    const lowStockThreshold = settings.lowStockThreshold || 3;

    // Time ranges
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Queries
    const [
      todayOrdersCount,
      weekOrders,
      monthOrders,
      ordersToPackCount,
      lowStockProducts,
      recentOrders
    ] = await Promise.all([
      // Today orders
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      // Revenue this week (paid orders)
      Order.find({
        status: { $in: ['paid', 'packed', 'shipped', 'delivered'] },
        createdAt: { $gte: sevenDaysAgo }
      }),
      // Revenue this month (paid orders)
      Order.find({
        status: { $in: ['paid', 'packed', 'shipped', 'delivered'] },
        createdAt: { $gte: startOfMonth }
      }),
      // Orders waiting to be packed
      Order.countDocuments({ status: 'paid' }),
      // Products with any size <= threshold
      Product.find({
        active: true,
        'sizes.stock': { $lte: lowStockThreshold }
      }),
      // Recent 8 orders
      Order.find().sort({ createdAt: -1 }).limit(8)
    ]);

    const revenueWeek = weekOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const revenueMonth = monthOrders.reduce((sum, o) => sum + (o.total || 0), 0);

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
      settings
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
exports.getAddProduct = (req, res) => {
  res.render('admin/product-form', {
    layout: 'layouts/admin',
    title: 'Add New Nighty',
    product: null,
    sizes: ['M', 'L', 'XL', 'XXL', '3XL']
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
      tag,
      featured,
      active
    } = req.body;

    const uploadedUrls = await processUploadedFiles(req.files);

    // Build sizes array
    const sizes = ['M', 'L', 'XL', 'XXL', '3XL'].map(s => ({
      size: s,
      stock: Math.max(0, parseInt(req.body[`stock_${s}`], 10) || 0)
    }));

    // Generate unique slug
    let baseSlug = slugify(name_en, { lower: true, strict: true }) || 'nighty';
    let slug = baseSlug;
    let counter = 1;
    while (await Product.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    await Product.create({
      slug,
      name: { en: name_en.trim(), ml: (name_ml || '').trim() },
      description: { en: description_en.trim(), ml: (description_ml || '').trim() },
      style: style || 'Cotton',
      price: parseFloat(price) || 0,
      images: uploadedUrls.length ? uploadedUrls : ['/img/placeholders/rose-garden-1.svg'],
      videoUrl: (videoUrl || '').trim(),
      sizes,
      tag: tag || 'None',
      featured: Boolean(featured),
      active: active !== 'false'
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

    res.render('admin/product-form', {
      layout: 'layouts/admin',
      title: `Edit ${product.name.en}`,
      product,
      sizes: ['M', 'L', 'XL', 'XXL', '3XL']
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
      tag,
      featured,
      active,
      existing_images
    } = req.body;

    const newUploadedUrls = await processUploadedFiles(req.files);

    // Retained images
    let retained = [];
    if (existing_images) {
      retained = Array.isArray(existing_images) ? existing_images : [existing_images];
    }
    const finalImages = [...retained, ...newUploadedUrls];

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
    product.sizes = sizes;
    product.tag = tag || 'None';
    product.featured = Boolean(featured);
    product.active = Boolean(active);

    await product.save();
    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
};

// Toggle or Delete Product
exports.deleteProduct = async (req, res, next) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
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

    if (status && status !== 'all') {
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
    const order = await Order.findById(req.params.id);
    if (!order) return res.redirect('/admin/orders');

    const settings = await Settings.getSettings();

    // Prefill WhatsApp message based on current order status
    let statusText = `Your order ${order.orderId} status has been updated to ${order.status.toUpperCase()}.`;
    if (order.status === 'packed') {
      statusText = `Hello ${order.customer.name},\nYour Nest by Ammakkili nighty order (${order.orderId}) has been packed with care and is ready for courier pickup!`;
    } else if (order.status === 'shipped') {
      statusText = `Hello ${order.customer.name},\nGreat news! Your order (${order.orderId}) has been shipped via ${order.tracking?.courier || 'courier'}. Tracking ID: ${order.tracking?.trackingId || 'In transit'}. You can track your parcel on our website.`;
    }

    const waLink = `https://wa.me/${order.customer.phone}?text=${encodeURIComponent(statusText)}`;

    res.render('admin/order-detail', {
      layout: 'layouts/admin',
      title: `Order ${order.orderId}`,
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
    const order = await Order.findById(req.params.id);
    if (!order) return res.redirect('/admin/orders');

    if (status) order.status = status;
    if (courier !== undefined) order.tracking.courier = courier.trim();
    if (trackingId !== undefined) order.tracking.trackingId = trackingId.trim();
    if (adminNotes !== undefined) order.adminNotes = adminNotes.trim();

    await order.save();
    res.redirect(`/admin/orders/${order._id}`);
  } catch (err) {
    next(err);
  }
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
      shippingCharge,
      whatsappNumber,
      announcement_en,
      announcement_ml,
      lowStockThreshold,
      youtube
    } = req.body;

    const settings = await Settings.getSettings();
    settings.shippingCharge = Math.max(0, parseFloat(shippingCharge) || 60);
    settings.whatsappNumber = (whatsappNumber || '').replace(/\D/g, '') || '919876543210';
    settings.announcementText.en = (announcement_en || '').trim();
    settings.announcementText.ml = (announcement_ml || '').trim();
    settings.lowStockThreshold = Math.max(1, parseInt(lowStockThreshold, 10) || 3);
    if (!settings.social) settings.social = {};
    settings.social.youtube = (youtube || '').trim();

    await settings.save();
    res.redirect('/admin/settings?saved=1');
  } catch (err) {
    next(err);
  }
};
