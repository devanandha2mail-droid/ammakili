const Product = require('../models/Product');
const Settings = require('../models/Settings');

exports.getCart = async (req, res) => {
  const settings = await Settings.getSettings();
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
      return res.json({ valid: true, items: [], subtotal: 0 });
    }

    const settings = await Settings.getSettings();
    const productIds = items.map(it => it.id);
    const dbProducts = await Product.find({ _id: { $in: productIds }, active: true });

    let subtotal = 0;
    let allValid = true;

    const validatedItems = items.map(item => {
      const p = dbProducts.find(doc => doc._id.toString() === item.id);
      if (!p) {
        allValid = false;
        return { ...item, exists: false, error: 'Product no longer available' };
      }

      const sizeObj = p.sizes.find(s => s.size === item.size);
      const stock = sizeObj ? sizeObj.stock : 0;
      const requestedQty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const isAvailable = stock >= requestedQty;

      if (!isAvailable) {
        allValid = false;
      }

      const lineTotal = p.price * requestedQty;
      subtotal += lineTotal;

      return {
        id: p._id,
        slug: p.slug,
        name: p.getName(req.cookies.nest_lang || 'en'),
        size: item.size,
        price: p.price,
        quantity: requestedQty,
        stock,
        isAvailable,
        image: p.images && p.images[0] ? p.images[0] : '/img/logo.svg',
        lineTotal
      };
    });

    res.json({
      valid: allValid,
      items: validatedItems,
      subtotal,
      shipping: items.length > 0 ? (settings.shippingCharge || 60) : 0,
      total: subtotal + (items.length > 0 ? (settings.shippingCharge || 60) : 0)
    });
  } catch (err) {
    console.error('Cart validation error:', err);
    res.status(500).json({ error: 'Failed to validate cart' });
  }
};

