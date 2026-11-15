const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Product = require('../models/Product');

// Get Customer Account Page
exports.getAccount = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.user._id).populate('wishlist');

    // Fetch order history: orders associated with customerId OR guest orders placed with customer's email!
    const orders = await Order.find({
      $or: [
        { customerId: customer._id },
        { 'customer.email': customer.email }
      ]
    }).sort({ createdAt: -1 });

    res.render('pages/account', {
      title: 'My Account',
      metaDesc: 'Manage your profile, saved delivery addresses, past orders, and synced wishlist.',
      customer,
      orders,
      activeTab: req.query.tab || 'orders',
      savedMsg: req.query.saved === '1' ? 'Changes saved successfully.' : null,
      errorMsg: req.query.error || null
    });
  } catch (err) {
    next(err);
  }
};

// Get Customer Order Detail by ID (IDOR Protected)
exports.getOrderDetail = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).render('pages/404', {
        title: 'Order Not Found',
        metaDesc: 'The requested order could not be found.'
      });
    }

    // Strict IDOR Check: order must belong to req.user._id or req.user.email
    const isOwner = (order.customerId && order.customerId.toString() === req.user._id.toString()) ||
                    (order.customer && order.customer.email && order.customer.email.toLowerCase() === req.user.email.toLowerCase());
    if (!isOwner) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You do not have permission to view this order.'
        },
        requestId: req.id
      });
    }

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, order });
    }

    res.render('pages/track', {
      title: `Order #${order.orderId}`,
      metaDesc: 'View order status and details',
      order,
      orderId: order.orderId,
      phone: order.customer?.phone || '',
      searched: true
    });
  } catch (err) {
    next(err);
  }
};

// Update Customer Profile (phone)
exports.postUpdateProfile = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const customer = await Customer.findById(req.user._id);
    if (!customer) return res.redirect('/login');

    if (phone !== undefined) {
      customer.phone = phone.replace(/\D/g, '').slice(-10);
    }

    await customer.save();
    res.redirect('/account?tab=profile&saved=1');
  } catch (err) {
    next(err);
  }
};

// Add Saved Address
exports.postAddAddress = async (req, res, next) => {
  try {
    const { label, name, phone, address, city, state, pin, isDefault } = req.body;
    const customer = await Customer.findById(req.user._id);

    if (!name || !phone || !address || !city || !pin) {
      return res.redirect('/account?tab=addresses&error=' + encodeURIComponent('All address fields are required.'));
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const cleanPin = pin.replace(/\D/g, '');

    // If marked default or first address, reset other default flags
    const makeDefault = Boolean(isDefault) || customer.addresses.length === 0;
    if (makeDefault) {
      customer.addresses.forEach(a => { a.isDefault = false; });
    }

    customer.addresses.push({
      label: label?.trim() || 'Home',
      name: name.trim(),
      phone: cleanPhone,
      address: address.trim(),
      city: city.trim(),
      state: state?.trim() || 'Kerala',
      pin: cleanPin,
      isDefault: makeDefault
    });

    await customer.save();
    res.redirect('/account?tab=addresses&saved=1');
  } catch (err) {
    next(err);
  }
};

// Edit Saved Address
exports.postEditAddress = async (req, res, next) => {
  try {
    const { addressId, label, name, phone, address, city, state, pin, isDefault } = req.body;
    const customer = await Customer.findById(req.user._id);

    const addr = customer.addresses.id(addressId);
    if (!addr) {
      return res.redirect('/account?tab=addresses&error=' + encodeURIComponent('Address not found.'));
    }

    if (isDefault) {
      customer.addresses.forEach(a => { a.isDefault = false; });
      addr.isDefault = true;
    }

    addr.label = label?.trim() || addr.label;
    addr.name = name.trim();
    addr.phone = phone.replace(/\D/g, '').slice(-10);
    addr.address = address.trim();
    addr.city = city.trim();
    addr.state = state?.trim() || 'Kerala';
    addr.pin = pin.replace(/\D/g, '');

    await customer.save();
    res.redirect('/account?tab=addresses&saved=1');
  } catch (err) {
    next(err);
  }
};

// Delete Saved Address
exports.postDeleteAddress = async (req, res, next) => {
  try {
    const { addressId } = req.body;
    const customer = await Customer.findById(req.user._id);
    customer.addresses.pull(addressId);
    await customer.save();
    res.redirect('/account?tab=addresses&saved=1');
  } catch (err) {
    next(err);
  }
};

// Set Default Address
exports.postSetDefaultAddress = async (req, res, next) => {
  try {
    const { addressId } = req.body;
    const customer = await Customer.findById(req.user._id);
    customer.addresses.forEach(a => {
      a.isDefault = a._id.toString() === addressId;
    });
    await customer.save();
    res.redirect('/account?tab=addresses&saved=1');
  } catch (err) {
    next(err);
  }
};

// API: Sync/Merge browser wishlist with customer database
exports.postSyncWishlist = async (req, res) => {
  try {
    const { items } = req.body; // array of product IDs
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid items array' });
    }

    const customer = await Customer.findById(req.user._id);
    if (!customer) return res.status(401).json({ error: 'Unauthorized' });

    const mongoose = require('mongoose');
    const validObjectIds = items.filter(id => mongoose.Types.ObjectId.isValid(id));
    const slugs = items.filter(id => typeof id === 'string' && !mongoose.Types.ObjectId.isValid(id));

    // Validate that these products still exist and are active
    const validProducts = await Product.find({
      $or: [
        { _id: { $in: validObjectIds } },
        { slug: { $in: slugs } }
      ],
      active: true
    }).select('_id');

    const existingSet = new Set(customer.wishlist.map(id => id.toString()));
    validProducts.forEach(p => existingSet.add(p._id.toString()));

    customer.wishlist = Array.from(existingSet);
    await customer.save();

    res.json({
      success: true,
      wishlist: customer.wishlist.map(id => id.toString())
    });
  } catch (err) {
    console.error('Wishlist sync error:', err);
    res.status(500).json({ error: 'Failed to sync wishlist' });
  }
};

// Delete Customer Account (Right to Erasure / GDPR compliance)
// "Removes customer's profile, addresses and wishlist. Keep orders for bookkeeping, but detach them from the profile and remove the Google ID."
exports.postDeleteAccount = async (req, res, next) => {
  try {
    const customerId = req.user._id;

    // 1. Detach past orders from customer profile for bookkeeping
    await Order.updateMany(
      { customerId },
      {
        $set: {
          customerId: null,
          adminNotes: 'Customer account deleted by user request.'
        }
      }
    );

    // 2. Delete customer record
    await Customer.findByIdAndDelete(customerId);

    // 3. Log out session
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.redirect('/?deleted=1');
      });
    });
  } catch (err) {
    next(err);
  }
};

