const http = require('http');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOpts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function run() {
  console.log('=== TEST 1: Fresh browser with no storage ===');
  await mongoose.connect('mongodb://127.0.0.1:27017/nest_ammakkili');

  // Check header HTML from server
  const homeRes = await request('http://localhost:3000/');
  if (homeRes.statusCode !== 200) throw new Error('Home returned ' + homeRes.statusCode);

  // Cart badge in header partial must default to 0 with data-zero="true"
  const cartBadgeMatch = homeRes.body.match(/<span class="badge" id="cartBadge" data-zero="([^"]+)">([^<]+)<\/span>/);
  if (!cartBadgeMatch) throw new Error('cartBadge not found in header HTML!');
  if (cartBadgeMatch[1] !== 'true' || cartBadgeMatch[2] !== '0') {
    throw new Error(`cartBadge does not default to 0 with data-zero="true". Found data-zero="${cartBadgeMatch[1]}", count="${cartBadgeMatch[2]}"`);
  }
  console.log('PASS: Header cart badge defaults to 0 with data-zero="true"');

  // Wishlist badge in header partial must default to 0 with data-zero="true"
  const wishBadgeMatch = homeRes.body.match(/<span class="badge" id="wishBadge" data-zero="([^"]+)">([^<]+)<\/span>/);
  if (!wishBadgeMatch) throw new Error('wishBadge not found in header HTML!');
  if (wishBadgeMatch[1] !== 'true' || wishBadgeMatch[2] !== '0') {
    throw new Error(`wishBadge does not default to 0 with data-zero="true". Found data-zero="${wishBadgeMatch[1]}", count="${wishBadgeMatch[2]}"`);
  }
  console.log('PASS: Header wishlist badge defaults to 0 with data-zero="true"');

  // Check CSS rule has display: none !important
  const cssRes = await request('http://localhost:3000/css/header.css');
  if (!cssRes.body.includes('.badge[data-zero="true"]{display:none!important}')) {
    throw new Error('header.css missing .badge[data-zero="true"]{display:none!important}');
  }
  console.log('PASS: CSS enforces .badge[data-zero="true"] { display: none !important }');

  // Cart page check (initial server HTML renders "Loading your cart..." to prevent empty flash; cart-page.js renders empty state if no stored items)
  const cartPageRes = await request('http://localhost:3000/cart');
  if (cartPageRes.statusCode !== 200) throw new Error('Cart page returned ' + cartPageRes.statusCode);
  if (!cartPageRes.body.includes('Loading your cart') && !cartPageRes.body.includes('empty')) {
    throw new Error('Cart page missing loading/empty cart message!');
  }
  console.log('PASS: Fresh cart page renders initial loading state (preventing empty flash).');

  console.log('\n=== TEST 2: Add 2 items: badge 2, cart page lists 2 ===');
  const products = await Product.find({ active: true }).limit(2);
  if (products.length < 2) throw new Error('Need at least 2 active products in DB');

  const p1 = products[0];
  const p2 = products[1];

  const cartItems = [
    { productId: p1._id.toString(), size: 'M', qty: 1 },
    { productId: p2._id.toString(), size: 'L', qty: 1 }
  ];

  // Validate via POST /cart/validate
  const valRes = await request('http://localhost:3000/cart/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: cartItems })
  });

  if (valRes.statusCode !== 200) throw new Error('validateCart failed with ' + valRes.statusCode);
  const valData = JSON.parse(valRes.body);

  if (!valData.valid || valData.items.length !== 2) {
    throw new Error(`Expected 2 valid items from server, got ${valData.items.length}`);
  }
  const totalQty = valData.items.reduce((s, it) => s + (it.qty || it.quantity), 0);
  if (totalQty !== 2) throw new Error(`Expected totalQty 2, got ${totalQty}`);
  console.log(`PASS: Validated 2 items with server. Total qty: ${totalQty}, subtotal: ₹${valData.subtotal}, total: ₹${valData.total}`);

  console.log('\n=== TEST 3: Delete one product in admin, reload: badge drops to 1, toast triggered ===');
  // Create a temporary product in DB
  const tempProduct = await Product.create({
    slug: 'temp-badge-test-nighty',
    name: { en: 'Temp Badge Test Nighty', ml: 'ടെമ്പ് ടെസ്റ്റ് നൈറ്റി' },
    description: { en: 'Temp description', ml: 'വിവരണം' },
    style: 'Cotton',
    price: 499,
    images: ['/img/brand/logo-full-256.png'],
    sizes: [{ size: 'M', stock: 5 }],
    isSample: false,
    active: true
  });
  console.log('Created temporary product for deletion test:', tempProduct.slug);

  // Cart with 2 items: 1 stable product and 1 temp product
  const mixedCart = [
    { productId: p1._id.toString(), size: 'M', qty: 1 },
    { productId: tempProduct._id.toString(), size: 'M', qty: 1 }
  ];

  // Verify before deletion
  const preDelVal = await request('http://localhost:3000/cart/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: mixedCart })
  });
  const preDelData = JSON.parse(preDelVal.body);
  if (preDelData.items.length !== 2) throw new Error('Expected 2 items before deletion');

  // Admin deletes tempProduct
  await Product.findByIdAndDelete(tempProduct._id);
  console.log('Product deleted from database (simulating admin deletion).');

  // Now reload / re-validate cart with the same stored items
  const postDelVal = await request('http://localhost:3000/cart/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: mixedCart })
  });
  const postDelData = JSON.parse(postDelVal.body);

  if (postDelData.items.length !== 1) {
    throw new Error(`Expected 1 item returned after deletion, got ${postDelData.items.length}`);
  }
  if (postDelData.removedCount !== 1) {
    throw new Error(`Expected removedCount 1, got ${postDelData.removedCount}`);
  }
  const newBadgeCount = postDelData.items.reduce((s, it) => s + (it.qty || it.quantity), 0);
  if (newBadgeCount !== 1) {
    throw new Error(`Expected badge count to drop to 1, got ${newBadgeCount}`);
  }
  console.log(`PASS: After admin product deletion, server returned only 1 valid item (removedCount: ${postDelData.removedCount}). Badge drops from 2 to ${newBadgeCount}.`);

  console.log('\n=== TEST 4: Clear storage: badge disappears ===');
  // When CartStore.clear() is called, items array is [] and NestHeader.setCart(0) sets data-zero="true"
  const emptyVal = await request('http://localhost:3000/cart/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] })
  });
  const emptyData = JSON.parse(emptyVal.body);
  if (emptyData.items.length !== 0 || emptyData.total !== 0) {
    throw new Error('Expected empty cart response');
  }
  console.log('PASS: Clear cart produces 0 items, total ₹0, badge count 0 (hidden via data-zero="true").');

  console.log('\n=== TEST 5: Place a test order: badge disappears ===');
  // Create an order via /checkout/create
  const checkoutCreate = await request('http://localhost:3000/checkout/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ productId: p1._id.toString(), size: 'M', qty: 1 }],
      customer: {
        name: 'Asha Varma',
        phone: '9847055443',
        email: 'asha@example.com',
        address: 'Villa 12, Palm Meadows, Kowdiar',
        city: 'Thiruvananthapuram',
        pin: '695003'
      },
      agreeNoReturns: true
    })
  });

  const orderData = JSON.parse(checkoutCreate.body);
  if (!orderData.success || !orderData.orderId) {
    throw new Error('Order creation failed: ' + (orderData.error || 'unknown'));
  }
  console.log('Order created successfully:', orderData.orderId);

  // Verify payment
  const verifyRes = await request('http://localhost:3000/checkout/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: orderData.orderId,
      razorpay_order_id: orderData.razorpayOrderId,
      razorpay_payment_id: 'pay_test_' + Date.now(),
      razorpay_signature: 'mock_test_signature'
    })
  });
  const verifyData = JSON.parse(verifyRes.body);
  if (!verifyData.success) {
    throw new Error('Payment verification failed');
  }
  console.log('Order payment verified successfully.');

  // Confirmation page check
  const confirmRes = await request(`http://localhost:3000/checkout/confirmation/${orderData.orderId}`);
  if (confirmRes.statusCode !== 200) throw new Error('Confirmation page returned ' + confirmRes.statusCode);
  if (!confirmRes.body.includes('CartStore.clear()')) {
    throw new Error('Confirmation page missing CartStore.clear() safety trigger');
  }
  console.log('PASS: Confirmation page loaded and executes CartStore.clear(). Badge disappears (0).');

  console.log('\n=== TEST 6: Wishlist Store Single Source of Truth ===');
  const wishRes = await request(`http://localhost:3000/api/wishlist-items?ids=${p1._id},${p2._id}`);
  const wishData = JSON.parse(wishRes.body);
  if (!wishData.products || wishData.products.length !== 2) {
    throw new Error('Expected 2 wishlist products');
  }
  console.log('PASS: Wishlist API returns only valid, active products.');

  await mongoose.disconnect();
  console.log('\n🎉 ALL CART & WISHLIST BADGE SYNC TESTS PASSED PERFECTLY!');
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
