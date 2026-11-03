const Product = require('../models/Product');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const { createRazorpayOrder, verifyPaymentSignature, key_id } = require('../services/razorpay');

// Helper to generate human-readable Order ID e.g. NEST-100234
function generateReadableOrderId() {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `NEST-${randomSuffix}`;
}

// Atomic stock decrement helper
async function decrementStockForOrder(order) {
  for (const item of order.items) {
    const res = await Product.updateOne(
      {
        _id: item.productId,
        'sizes.size': item.size,
        'sizes.stock': { $gte: item.quantity }
      },
      {
        $inc: { 'sizes.$.stock': -item.quantity }
      }
    );

    if (res.modifiedCount === 0) {
      console.warn(`[Stock Warning] Could not decrement stock for product ${item.productId} size ${item.size}. Inventory may have been depleted.`);
    }
  }
}

// Render Checkout Page
exports.getCheckout = async (req, res) => {
  // If login is strictly required at checkout
  if (process.env.REQUIRE_LOGIN_AT_CHECKOUT === 'true' && (!req.isAuthenticated || !req.isAuthenticated())) {
    return res.redirect('/login?returnTo=/checkout');
  }

  const settings = await Settings.getSettings();
  let savedAddresses = [];
  if (req.user) {
    savedAddresses = req.user.addresses || [];
  }

  res.render('pages/checkout', {
    title: res.locals.t('checkout.title'),
    metaDesc: 'Complete your order with secure prepaid payment.',
    shippingCharge: settings.shippingCharge || 60,
    razorpayKeyId: key_id,
    savedAddresses,
    customer: req.user || null
  });
};

// Create Order & Initialize Razorpay Payment
exports.createOrder = async (req, res) => {
  try {
    const { items, customer, agreeNoReturns, saveAddress, addressLabel } = req.body;

    // If login is required at checkout
    if (process.env.REQUIRE_LOGIN_AT_CHECKOUT === 'true' && (!req.isAuthenticated || !req.isAuthenticated())) {
      return res.status(401).json({ error: 'Please sign in to proceed with checkout.' });
    }

    // 1. Validate mandatory policies checkbox
    if (!agreeNoReturns) {
      return res.status(400).json({
        error: 'You must confirm that sizes cannot be changed and no returns are allowed.'
      });
    }

    // 2. Validate customer details
    if (!customer || !customer.name || !customer.phone || !customer.address || !customer.city || !customer.pin) {
      return res.status(400).json({ error: 'Please provide all required delivery details.' });
    }

    const cleanPhone = customer.phone.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Please provide a valid 10-digit Indian mobile number.' });
    }

    const cleanPin = customer.pin.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit Indian PIN code.' });
    }

    // Optionally save address to customer profile if ticked
    if (req.user && saveAddress) {
      try {
        const Customer = require('../models/Customer');
        const dbCust = await Customer.findById(req.user._id);
        if (dbCust) {
          const exists = dbCust.addresses.some(a => a.address === customer.address.trim() && a.pin === cleanPin);
          if (!exists) {
            dbCust.addresses.push({
              label: addressLabel?.trim() || 'Saved Address',
              name: customer.name.trim(),
              phone: cleanPhone,
              address: customer.address.trim(),
              city: customer.city.trim(),
              state: customer.state || 'Kerala',
              pin: cleanPin,
              isDefault: dbCust.addresses.length === 0
            });
            await dbCust.save();
          }
        }
      } catch (saveAddrErr) {
        console.warn('Could not save address to customer profile:', saveAddrErr.message);
      }
    }

    // 3. Validate Cart Items
    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    // 4. IGNORE CLIENT PRICES: Reload each product from DB and calculate actual subtotal
    const productIds = items.map(it => it.id);
    const dbProducts = await Product.find({ _id: { $in: productIds }, active: true });

    let subtotal = 0;
    const orderItems = [];

    for (const clientItem of items) {
      const dbProduct = dbProducts.find(p => p._id.toString() === clientItem.id);
      if (!dbProduct) {
        return res.status(400).json({
          error: `Product no longer available: ${clientItem.name || 'Item'}`
        });
      }

      const sizeOption = dbProduct.sizes.find(s => s.size === clientItem.size);
      if (!sizeOption) {
        return res.status(400).json({
          error: `Invalid size ${clientItem.size} for ${dbProduct.getName(req.cookies.nest_lang || 'en')}`
        });
      }

      const qty = Math.max(1, parseInt(clientItem.quantity, 10) || 1);
      if (sizeOption.stock < qty) {
        return res.status(400).json({
          error: `Insufficient stock for ${dbProduct.getName(req.cookies.nest_lang || 'en')} (Size ${clientItem.size}). Only ${sizeOption.stock} left.`
        });
      }

      const verifiedPrice = dbProduct.price; // Official DB price
      subtotal += verifiedPrice * qty;

      orderItems.push({
        productId: dbProduct._id,
        name: dbProduct.getName('en'),
        price: verifiedPrice,
        size: clientItem.size,
        quantity: qty,
        image: dbProduct.images && dbProduct.images[0] ? dbProduct.images[0] : '/img/logo.svg'
      });
    }

    // 5. Add shipping charge from Settings
    const settings = await Settings.getSettings();
    const shipping = settings.shippingCharge || 60;
    const total = subtotal + shipping;

    // 6. Generate readable Order ID
    const orderId = generateReadableOrderId();

    // 7. Call Razorpay to generate order
    const rzpOrder = await createRazorpayOrder({
      amountInRupees: total,
      receipt: orderId,
      notes: {
        orderId,
        customerName: customer.name,
        customerPhone: cleanPhone
      }
    });

    // 8. Create Order Document with status 'pending_payment'
    const newOrder = await Order.create({
      orderId,
      customerId: req.user ? req.user._id : null,
      items: orderItems,
      customer: {
        name: customer.name.trim(),
        phone: cleanPhone,
        email: (customer.email || '').trim().toLowerCase(),
        address: customer.address.trim(),
        city: customer.city.trim(),
        state: customer.state || 'Kerala',
        pin: cleanPin
      },
      subtotal,
      shipping,
      total,
      status: 'pending_payment',
      payment: {
        razorpayOrderId: rzpOrder.id,
        status: 'pending',
        method: 'Razorpay'
      }
    });

    res.json({
      success: true,
      orderId: newOrder.orderId,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount, // in paise
      currency: 'INR',
      keyId: key_id,
      isMock: rzpOrder.isMock || false,
      customer: {
        name: newOrder.customer.name,
        email: newOrder.customer.email,
        phone: newOrder.customer.phone
      }
    });
  } catch (err) {
    console.error('Checkout create order error:', err);
    res.status(500).json({ error: 'Failed to initiate order. Please try again.' });
  }
};

// Verify Payment Signature & Atomically Decrement Stock
exports.verifyPayment = async (req, res) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!orderId || !razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ error: 'Missing payment verification details.' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // Idempotency: if already paid, return success immediately
    if (order.status === 'paid' || order.status === 'packed' || order.status === 'shipped') {
      return res.json({ success: true, orderId: order.orderId });
    }

    // Verify HMAC signature
    const isValid = verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Payment signature verification failed.' });
    }

    // Mark paid and atomically decrement inventory
    order.status = 'paid';
    order.payment.razorpayPaymentId = razorpay_payment_id;
    order.payment.razorpaySignature = razorpay_signature;
    order.payment.status = 'captured';
    await order.save();

    await decrementStockForOrder(order);

    res.json({ success: true, orderId: order.orderId });
  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
};

// Render Order Confirmation Page
exports.getConfirmation = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).render('pages/404', {
        title: 'Order Not Found',
        metaDesc: 'Order details could not be found.'
      });
    }

    const settings = await Settings.getSettings();
    const whatsappNumber = settings.whatsappNumber || '919876543210';

    // Build prefilled WhatsApp message
    const itemsSummary = order.items
      .map(item => `• ${item.name} (Size: ${item.size}) × ${item.quantity} - ₹${item.price * item.quantity}`)
      .join('\n');

    const message = `Hello Nest by Ammakkili,\nI have placed order ${order.orderId}.\n\nItems:\n${itemsSummary}\n\nShipping: ₹${order.shipping}\nTotal Paid: ₹${order.total}\nPayment Status: ${order.status.toUpperCase()}\n\nDelivery To:\n${order.customer.name}\n${order.customer.address}, ${order.customer.city} - ${order.customer.pin}\nPhone: ${order.customer.phone}\n\nPlease confirm my order. Thank you!`;

    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    res.render('pages/confirmation', {
      title: `${res.locals.t('confirmation.title')} – ${order.orderId}`,
      metaDesc: `Order confirmation for ${order.orderId}.`,
      order,
      whatsappUrl
    });
  } catch (err) {
    next(err);
  }
};

