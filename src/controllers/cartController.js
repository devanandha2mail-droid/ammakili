const mongoose = require('mongoose');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const { getSampleProducts } = require('../utils/sampleCatalog');

exports.getCart = async (req, res) => {
  const settings = res.locals.settings || { shippingCharge: 60 };
  res.render('pages/cart', {
    title: res.locals.t('cart.title'),
    metaDesc: 'Review nighties in your cart before secure prepaid checkout.',
    shippingCharge: settings.shippingCharge || 60
  });
};

// API Endpoint to validate browser cart against latest DB stock and prices
exports.validateCart = async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || !items.length) {
      return res.json({ items: [], subtotal: 0, shipping: 0, total: 0, removed: [], valid: true, removedCount: 0 });
    }

    let shippingChargeSetting = 60;
    if (res.locals && res.locals.settings && typeof res.locals.settings.shippingCharge === 'number') {
      shippingChargeSetting = res.locals.settings.shippingCharge;
    } else if (mongoose.connection.readyState === 1) {
      try {
        const settings = await Settings.getSettings();
        if (settings && typeof settings.shippingCharge === 'number') {
          shippingChargeSetting = settings.shippingCharge;
        }
      } catch (e) {}
    }

    // Extract valid ObjectIds or slugs
    const rawIds = items.map(it => it.productId || it.id || it.slug).filter(Boolean);
    let dbProducts = [];

    if (mongoose.connection.readyState === 1) {
      try {
        const validIds = rawIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length > 0) {
          dbProducts = await Product.find({ _id: { $in: validIds }, active: true });
        }
      } catch (e) {
        dbProducts = [];
      }
    }

    // Fallback to sample catalog if DB is disconnected or returns empty
    if (!dbProducts || dbProducts.length === 0) {
      const sampleList = getSampleProducts();
      dbProducts = sampleList.filter(p => {
        const idStr = p._id ? p._id.toString() : '';
        return rawIds.some(rid => rid === idStr || rid === p.slug);
      });
    }

    let subtotal = 0;
    const validatedItems = [];
    const removed = [];

    for (const item of items) {
      const pid = String(item.productId || item.id || item.slug || '');
      const p = dbProducts.find(doc => (doc._id && doc._id.toString() === pid) || doc.slug === pid);
      if (!p) {
        removed.push({ productId: pid, size: item.size, qty: item.qty || item.quantity || 1 });
        continue;
      }

      const sizeObj = p.sizes && p.sizes.find(s => s.size === item.size);
      if (!sizeObj || sizeObj.stock <= 0) {
        removed.push({ productId: pid, size: item.size, qty: item.qty || item.quantity || 1, name: p.getName(req.cookies.nest_lang || 'en') });
        continue;
      }

      const requestedQty = Math.max(1, parseInt(item.qty || item.quantity, 10) || 1);
      const finalQty = Math.min(sizeObj.stock, requestedQty);
      const lineTotal = p.price * finalQty;
      subtotal += lineTotal;

      const firstImage = typeof p.getMainImage === 'function'
        ? p.getMainImage()
        : ((p.images && p.images.length > 0 && p.images[0]) ? (p.images[0].url || p.images[0]) : '/img/brand/logo-full-256.png');

      validatedItems.push({
        productId: p._id.toString(),
        slug: p.slug,
        name: p.getName(req.cookies.nest_lang || 'en'),
        image: firstImage,
        size: item.size,
        price: p.price,
        qty: finalQty,
        stock: sizeObj.stock,
        lineTotal,
        // Legacy compatibility properties
        id: p._id.toString(),
        quantity: finalQty,
        sizeName: item.size,
        isAvailable: true
      });
    }

    const shippingCharge = validatedItems.length > 0 ? shippingChargeSetting : 0;
    const total = subtotal + shippingCharge;

    res.json({
      items: validatedItems,
      subtotal,
      shipping: shippingCharge,
      total,
      removed,
      valid: removed.length === 0,
      removedCount: removed.length
    });
  } catch (err) {
    console.error('Cart validation error:', err);
    res.status(500).json({ error: 'Failed to validate cart' });
  }
};
