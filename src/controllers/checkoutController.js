const crypto = require('crypto');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const {
  createRazorpayOrder,
  verifyPaymentSignature,
  refundRazorpayPayment,
  fetchRazorpayPayment,
  captureRazorpayPayment,
  key_id
} = require('../services/razorpay');

// Helper to generate human-readable Order ID e.g. NEST-100234
function generateReadableOrderId() {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `NEST-${randomSuffix}`;
}

// Generates a cryptographically signed HMAC token for an Order ID
function generateOrderToken(orderId) {
  const secret = process.env.SESSION_SECRET || 'secret_nest_ammakkili_order_tokens';
  return crypto.createHmac('sha256', secret).update(String(orderId)).digest('hex');
}

// Timing-safe verification of signed Order Token
function verifyOrderToken(orderId, token) {
  if (!orderId || !token || typeof token !== 'string') return false;
  const expected = generateOrderToken(orderId);
  const bufA = Buffer.from(token, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Determines unique checkout session key for customer / guest
function getCheckoutSessionKey(req) {
  if (req.user && req.user._id) {
    return `user_${req.user._id}`;
  }
  const isProd = process.env.NODE_ENV === 'production';
  const guestCookieName = isProd ? '__Host-nest_guest' : 'nest_guest';
  const guestCookie = req.signedCookies ? (req.signedCookies[guestCookieName] || req.signedCookies['nest_guest'] || req.signedCookies['__Host-nest_guest']) : null;
  if (guestCookie) {
    return `guest_${guestCookie}`;
  }
  if (req.cookies && req.cookies['connect.sid']) {
    return `sess_${req.sessionID}`;
  }
  const cartToken = req.headers['x-cart-token'] || req.headers['x-guest-id'];
  if (cartToken) {
    return `cart_${cartToken}`;
  }
  return `ip_${req.ip || 'anon'}`;
}

// Computes deterministic sha256 hash of cart items
function computeCartHash(items) {
  const sorted = items
    .map(it => `${String(it.productId)}:${String(it.size)}:${parseInt(it.quantity, 10)}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

/**
 * Atomically returns reserved inventory back to products exactly once.
 * Uses conditional update on Order.findOneAndUpdate({ _id, stockReturned: { $ne: true } })
 * to guarantee that multiple parallel calls/workers cannot return stock twice.
 */
async function returnStockForOrder(order) {
  if (!order || !order.items || !order.items.length) return false;

  const marked = await Order.findOneAndUpdate(
    {
      _id: order._id,
      stockReturned: { $ne: true }
    },
    {
      $set: { stockReturned: true },
      $unset: { activeCartReservation: 1 }
    }
  );

  if (!marked) {
    // Inventory was already returned or another process handled it
    return false;
  }

  for (const item of order.items) {
    await Product.updateOne(
      { _id: item.productId, 'sizes.size': item.size },
      { $inc: { 'sizes.$.stock': item.quantity } }
    );
  }

  return true;
}

/**
 * Releases expired 15-minute reservations and restores stock exactly once
 */
async function releaseExpiredReservations() {
  try {
    const now = new Date();
    const expiredOrders = await Order.find({
      status: 'pending_payment',
      reservedUntil: { $lte: now }
    });

    for (const expOrder of expiredOrders) {
      const marked = await Order.findOneAndUpdate(
        {
          _id: expOrder._id,
          status: 'pending_payment',
          reservedUntil: { $lte: now }
        },
        {
          $set: {
            status: 'failed',
            adminNotes: 'Reservation expired after 15 minutes without payment.'
          }
        }
      );
      if (marked) {
        await returnStockForOrder(expOrder);
      }
    }
  } catch (err) {
    console.error('Error releasing expired reservations:', err);
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

// Create Order & Initialize Razorpay Payment with Atomic Multi-Process Stock Reservation
exports.createOrder = async (req, res) => {
  const decrementedItems = [];
  let checkoutSessionKey = '';
  let cartHash = '';
  try {
    const { items, customer, agreeNoReturns, saveAddress, addressLabel } = req.body;

    // If login is required at checkout
    if (process.env.REQUIRE_LOGIN_AT_CHECKOUT === 'true' && (!req.isAuthenticated || !req.isAuthenticated())) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Please sign in to proceed with checkout.' },
        requestId: req.id
      });
    }

    // 1. Validate mandatory policies checkbox
    if (!agreeNoReturns) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'You must confirm that sizes cannot be changed and no returns are allowed.'
        },
        requestId: req.id
      });
    }

    // 2. Validate customer details
    if (!customer || !customer.name || !customer.phone || !customer.address || !customer.city || !customer.pin) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please provide all required delivery details.'
        },
        requestId: req.id
      });
    }

    const cleanPhone = customer.phone.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please provide a valid 10-digit Indian mobile number.'
        },
        requestId: req.id
      });
    }

    const cleanPin = customer.pin.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanPin)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please enter a valid 6-digit Indian PIN code.'
        },
        requestId: req.id
      });
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
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Your cart is empty.'
        },
        requestId: req.id
      });
    }

    // 4. IGNORE CLIENT PRICES: Reload each product from DB and calculate actual subtotal
    const productIds = items.map(it => it.productId || it.id).filter(Boolean);
    const dbProducts = await Product.find({ _id: { $in: productIds }, active: true });

    let subtotal = 0;
    const validatedItems = [];

    for (const clientItem of items) {
      const pid = String(clientItem.productId || clientItem.id || '');
      const dbProduct = dbProducts.find(p => p._id.toString() === pid);
      if (!dbProduct) {
        return res.status(400).json({
          error: {
            code: 'SOLD_OUT',
            message: `Sold out: Product no longer available: ${clientItem.name || 'Item'}`
          },
          requestId: req.id
        });
      }

      if (!clientItem.size) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Please select a size for ${dbProduct.getName(req.cookies.nest_lang || 'en')}`
          },
          requestId: req.id
        });
      }

      const sizeOption = dbProduct.sizes.find(s => s.size === clientItem.size);
      if (!sizeOption) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid size ${clientItem.size} for ${dbProduct.getName(req.cookies.nest_lang || 'en')}`
          },
          requestId: req.id
        });
      }

      const rawQty = parseInt(clientItem.qty !== undefined ? clientItem.qty : clientItem.quantity, 10);
      if (isNaN(rawQty) || rawQty <= 0) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Quantity must be at least 1 for ${dbProduct.getName(req.cookies.nest_lang || 'en')}`
          },
          requestId: req.id
        });
      }
      const qty = rawQty;

      validatedItems.push({
        productId: dbProduct._id,
        name: dbProduct.getName('en'),
        displayName: dbProduct.getName(req.cookies.nest_lang || 'en'),
        size: clientItem.size,
        quantity: qty,
        price: dbProduct.price,
        image: typeof dbProduct.getMainImage === 'function'
          ? dbProduct.getMainImage()
          : (dbProduct.images && dbProduct.images[0] ? (dbProduct.images[0].url || dbProduct.images[0]) : '/img/brand/logo-mark-256.png')
      });
      subtotal += dbProduct.price * qty;
    }

    // 5. ATOMIC CONDITIONAL STOCK RESERVATION
    // Idempotent reuse: if the same session and the same cart already has a pending_payment order that has not expired,
    // reuse it (extend reservedUntil if needed) and return the same Razorpay order instead of creating a second one.
    checkoutSessionKey = getCheckoutSessionKey(req);
    cartHash = computeCartHash(validatedItems);

    const now = new Date();
    const existingOrder = await Order.findOne({
      status: 'pending_payment',
      stockReturned: { $ne: true },
      reservedUntil: { $gt: now },
      checkoutSessionKey,
      cartHash
    });

    if (existingOrder && existingOrder.payment && existingOrder.payment.razorpayOrderId) {
      existingOrder.reservedUntil = new Date(Date.now() + 15 * 60 * 1000);
      await existingOrder.save();

      return res.json({
        success: true,
        orderId: existingOrder.orderId,
        razorpayOrderId: existingOrder.payment.razorpayOrderId,
        amount: Math.round(existingOrder.total * 100),
        currency: 'INR',
        keyId: key_id,
        orderToken: generateOrderToken(existingOrder.orderId),
        customer: {
          name: existingOrder.customer.name,
          email: existingOrder.customer.email,
          phone: existingOrder.customer.phone
        }
      });
    }

    // For each item, run one conditional update: Product.updateOne({ _id, sizes: { $elemMatch: { size, stock: { $gte: qty } } } }, { $inc: { 'sizes.$.stock': -qty } })
    // If modifiedCount is 0, roll back items already taken and return "Sold out".
    for (const item of validatedItems) {
      const reserveResult = await Product.updateOne(
        {
          _id: item.productId,
          sizes: {
            $elemMatch: {
              size: item.size,
              stock: { $gte: item.quantity }
            }
          }
        },
        {
          $inc: { 'sizes.$.stock': -item.quantity }
        }
      );

      if (reserveResult.modifiedCount === 0) {
        // Rollback any items already reserved for this request
        for (const rolled of decrementedItems) {
          await Product.updateOne(
            { _id: rolled.productId, 'sizes.size': rolled.size },
            { $inc: { 'sizes.$.stock': rolled.quantity } }
          );
        }
        return res.status(400).json({
          error: {
            code: 'SOLD_OUT',
            message: `Sold out: Insufficient stock for ${item.displayName} (Size ${item.size}). The requested quantity is no longer available.`
          },
          requestId: req.id
        });
      }

      decrementedItems.push(item);
    }

    // 6. Add shipping charge from Settings
    const settings = await Settings.getSettings();
    const shipping = settings.shippingCharge || 60;
    const total = subtotal + shipping;

    // 7. Generate readable Order ID
    const orderId = generateReadableOrderId();

    // 8. Call Razorpay to generate order with payment_capture: 1
    const rzpOrder = await createRazorpayOrder({
      amountInRupees: total,
      receipt: orderId,
      notes: {
        orderId,
        customerName: customer.name,
        customerPhone: cleanPhone
      }
    });

    // 9. Create Order Document with 15-minute reservation
    const reservedUntil = new Date(Date.now() + 15 * 60 * 1000);
    const newOrder = await Order.create({
      orderId,
      customerId: req.user ? req.user._id : null,
      items: validatedItems.map(vi => ({
        productId: vi.productId,
        name: vi.name,
        price: vi.price,
        size: vi.size,
        quantity: vi.quantity,
        image: vi.image
      })),
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
      reservedUntil,
      stockReturned: false,
      checkoutSessionKey,
      cartHash,
      activeCartReservation: `${checkoutSessionKey}:${cartHash}`,
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
      orderToken: generateOrderToken(newOrder.orderId),
      customer: {
        name: newOrder.customer.name,
        email: newOrder.customer.email,
        phone: newOrder.customer.phone
      }
    });
  } catch (err) {
    if (err.code === 11000 && (err.message?.includes('activeCartReservation') || err.keyPattern?.activeCartReservation)) {
      for (const rolled of decrementedItems) {
        try {
          await Product.updateOne(
            { _id: rolled.productId, 'sizes.size': rolled.size },
            { $inc: { 'sizes.$.stock': rolled.quantity } }
          );
        } catch (rbErr) {}
      }
      let existingOrder = await Order.findOne({
        status: 'pending_payment',
        checkoutSessionKey,
        cartHash
      });
      if (!existingOrder) {
        await new Promise(r => setTimeout(r, 60));
        existingOrder = await Order.findOne({
          status: 'pending_payment',
          checkoutSessionKey,
          cartHash
        });
      }
      if (existingOrder && existingOrder.payment && existingOrder.payment.razorpayOrderId) {
        return res.json({
          success: true,
          orderId: existingOrder.orderId,
          razorpayOrderId: existingOrder.payment.razorpayOrderId,
          amount: Math.round(existingOrder.total * 100),
          currency: 'INR',
          keyId: key_id,
          orderToken: generateOrderToken(existingOrder.orderId),
          customer: {
            name: existingOrder.customer.name,
            email: existingOrder.customer.email,
            phone: existingOrder.customer.phone
          }
        });
      }
    }
    // If order creation throws, roll back reserved inventory
    for (const rolled of decrementedItems) {
      try {
        await Product.updateOne(
          { _id: rolled.productId, 'sizes.size': rolled.size },
          { $inc: { 'sizes.$.stock': rolled.quantity } }
        );
      } catch (rollbackErr) {
        console.error(`[Request ${req.id}] Failed to rollback stock after order creation error:`, rollbackErr);
      }
    }
    console.error(`[Request ${req.id}] Checkout create order error:`, err);
    res.status(502).json({
      error: {
        code: 'PAYMENT_SERVICE_UNAVAILABLE',
        message: 'Payment service is temporarily unavailable. Please try again in a few moments.'
      },
      requestId: req.id
    });
  }
};

// Verify Payment Signature & Bind Strictly to Razorpay Order ID
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification details.' });
    }

    // STRICT BINDING: Look up order strictly by razorpay_order_id (ignoring any client-provided orderId)
    const order = await Order.findOne({ 'payment.razorpayOrderId': razorpay_order_id });
    if (!order) {
      return res.status(404).json({ error: 'Order not found for this Razorpay order ID.' });
    }

    // Idempotency: if already paid or further along, return success immediately
    if (order.status === 'paid' || order.status === 'packed' || order.status === 'shipped' || order.status === 'delivered') {
      return res.json({ success: true, orderId: order.orderId });
    }

    // If order was already refunded
    if (order.status === 'refunded' || order.status === 'refund_pending' || order.status === 'refund_needed') {
      return res.status(409).json({
        error: 'This order was expired or cancelled and a refund has been initiated.',
        status: order.status,
        orderId: order.orderId
      });
    }

    // 1. Verify HMAC signature strictly using timingSafeEqual
    const isValid = verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Payment signature verification failed.' });
    }

    // 2. Fetch payment directly from Razorpay API
    const payment = await fetchRazorpayPayment(razorpay_payment_id);
    let paymentStatus = payment.status;

    // If status is 'authorized', capture it for the exact order amount
    if (paymentStatus === 'authorized') {
      const captured = await captureRazorpayPayment(razorpay_payment_id, Math.round(order.total * 100), 'INR');
      paymentStatus = captured.status;
    }

    // Require status === 'captured', amount === order.total * 100, currency === 'INR', order_id === order's Razorpay order id
    const expectedAmountInPaise = Math.round(order.total * 100);
    if (
      paymentStatus !== 'captured' ||
      payment.amount !== expectedAmountInPaise ||
      payment.currency !== 'INR' ||
      payment.order_id !== order.payment.razorpayOrderId
    ) {
      console.error(`[Payment Verification] Details mismatch for order ${order.orderId}:`, {
        paymentStatus,
        paymentAmount: payment.amount,
        expectedAmount: expectedAmountInPaise,
        currency: payment.currency,
        paymentOrderId: payment.order_id,
        expectedOrderId: order.payment.razorpayOrderId
      });
      return res.status(400).json({
        error: 'Payment validation failed: payment not captured, amount/currency mismatch, or invalid order reference.'
      });
    }

    // 3. Check if reservation expired or order was previously marked failed
    const now = new Date();
    const isExpired = order.status === 'failed' || (order.reservedUntil && order.reservedUntil <= now) || order.stockReturned === true;

    // If reservation expired or order cannot be fulfilled, return stock once & issue immediate automatic refund
    if (isExpired) {
      console.warn(`[Payment Verification] Order ${order.orderId} cannot be fulfilled (expired: ${isExpired}). Restoring stock & initiating refund...`);
      await returnStockForOrder(order);

      order.status = 'refund_pending';
      order.payment.razorpayPaymentId = razorpay_payment_id;
      order.payment.razorpaySignature = razorpay_signature;
      await order.save();

      try {
        const refundRes = await refundRazorpayPayment({
          paymentId: razorpay_payment_id,
          amountInPaise: expectedAmountInPaise,
          notes: {
            orderId: order.orderId,
            reason: 'Late payment received on expired reservation'
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
        order.adminNotes = `Payment received on expired order. Full refund issued: ${refundRes.id}`;
        await order.save();

        return res.status(409).json({
          error: 'Your order could not be fulfilled because the 15-minute reservation expired. A full refund has been automatically initiated.',
          refunded: true,
          orderId: order.orderId
        });
      } catch (refundErr) {
        console.error(`[Payment Verification] Refund API call failed for order ${order.orderId}:`, refundErr);
        order.status = 'refund_needed';
        order.refund = {
          failureReason: refundErr.message,
          status: 'failed',
          initiatedAt: new Date()
        };
        order.payment.status = 'refund_needed';
        order.adminNotes = `Refund needed: Automatic refund failed (${refundErr.message}). Please refund manually in Razorpay dashboard.`;
        await order.save();

        return res.status(409).json({
          error: 'Reservation expired and automated refund failed. Our support team will process your refund manually.',
          refundNeeded: true,
          orderId: order.orderId
        });
      }
    }

    // 4. Mark the order paid with ONE conditional update:
    // findOneAndUpdate({ _id, status: { $in: ['pending_payment'] } }, { $set: { status: 'paid', ... } })
    const updated = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: { $in: ['pending_payment'] }
      },
      {
        $set: {
          status: 'paid',
          'payment.status': 'captured',
          'payment.razorpayPaymentId': razorpay_payment_id,
          'payment.razorpaySignature': razorpay_signature,
          reservedUntil: null,
          paidAt: new Date()
        },
        $unset: { activeCartReservation: 1 }
      },
      { returnDocument: 'after' }
    );

    // If nothing matched, treat as already processed and return 200
    res.json({ success: true, orderId: order.orderId });
  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
};

// Cancel Order & Release Reserved Stock on Modal Dismiss or Payment Failure
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId, orderToken, reason } = req.body;
    if (!orderId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Order ID is required.' },
        requestId: req.id
      });
    }

    if (!orderToken || !verifyOrderToken(orderId, orderToken)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Invalid or missing order token.' },
        requestId: req.id
      });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found.' },
        requestId: req.id
      });
    }

    if (order.status === 'pending_payment') {
      order.status = 'failed';
      order.adminNotes = `Order cancelled by client: ${reason || 'Checkout popup dismissed or payment failed'}`;
      await order.save();
      await returnStockForOrder(order);
    }

    return res.json({ success: true, released: true });
  } catch (err) {
    console.error(`[Request ${req.id}] Cancel order error:`, err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel order.' },
      requestId: req.id
    });
  }
};

// Record Payment Failure and Return Stock Exactly Once
exports.failPayment = async (req, res) => {
  try {
    const { orderId, orderToken, reason } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required.' });
    }
    if (orderToken && !verifyOrderToken(orderId, orderToken)) {
      return res.status(403).json({ error: 'Invalid order token.' });
    }
    const order = await Order.findOne({ orderId });
    if (order && order.status === 'pending_payment') {
      order.status = 'failed';
      order.adminNotes = `Payment failure reported: ${reason || 'User payment failed/cancelled'}`;
      await order.save();
      await returnStockForOrder(order);
    }
    res.json({ success: true, released: true });
  } catch (err) {
    console.error('Payment failure recording error:', err);
    res.status(500).json({ error: 'Failed to record payment failure.' });
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

module.exports.returnStockForOrder = returnStockForOrder;
module.exports.releaseExpiredReservations = releaseExpiredReservations;
