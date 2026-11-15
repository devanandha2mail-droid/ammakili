const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');

async function testCustomerFlow() {
  await mongoose.connect('mongodb://127.0.0.1:27017/nest_ammakkili');
  console.log('[Customer Test] Connected to database.');

  // 1. Test Google Simulated Sign-in / Session Creation
  console.log('[Customer Test] Simulating Google OAuth login...');
  const loginRes = await fetch('http://localhost:3000/auth/google/test-login?email=priya.test@example.com&name=Priya%20Nair&returnTo=/account', {
    redirect: 'manual'
  });

  const cookieHeader = loginRes.headers.get('set-cookie');
  console.log(`[Customer Test] Login status: ${loginRes.status}, Redirect: ${loginRes.headers.get('location')}`);
  if (loginRes.status !== 302 || !cookieHeader) {
    throw new Error('Google test login failed!');
  }

  const sidMatch = cookieHeader.match(/connect\.sid=([^;]+)/);
  const sessionCookie = sidMatch ? `connect.sid=${sidMatch[1]}` : cookieHeader.split(';')[0];
  console.log('[Customer Test] Customer session cookie established.');

  // 2. Test Accessing /account
  const accountRes = await fetch('http://localhost:3000/account', {
    headers: { 'Cookie': sessionCookie }
  });
  console.log(`[Customer Test] GET /account status: ${accountRes.status}`);
  const accountHtml = await accountRes.text();
  if (!accountHtml.includes('Priya Nair') || !accountHtml.includes('priya.test@example.com')) {
    throw new Error('Account page failed to show logged-in customer details!');
  }
  console.log('[Customer Test] Account portal rendered customer name and Google email.');

  // 3. Test Security Separation: Customer trying to access /admin
  const adminAttemptRes = await fetch('http://localhost:3000/admin', {
    headers: { 'Cookie': sessionCookie },
    redirect: 'manual'
  });
  console.log(`[Customer Test] Customer accessing /admin: Status ${adminAttemptRes.status}, Redirect: ${adminAttemptRes.headers.get('location')}`);
  if (adminAttemptRes.status !== 302 || !adminAttemptRes.headers.get('location').includes('/admin/login')) {
    throw new Error('Security flaw: Customer session was allowed to access /admin!');
  }
  console.log('[Customer Test] Security confirmed: Customer session was strictly blocked and redirected from /admin.');

  // 4. Test Open Redirect Protection
  const { safeReturnUrl } = require('../src/middleware/customerAuth');
  if (safeReturnUrl('https://evil.com') !== '/account' || safeReturnUrl('//evil.com') !== '/account') {
    throw new Error('Open redirect vulnerability in safeReturnUrl!');
  }
  console.log('[Customer Test] Open redirect vulnerability test passed.');

  // 5. Test Adding a Saved Address via /account/address/add
  const addAddrRes = await fetch('http://localhost:3000/account/address/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': sessionCookie
    },
    body: new URLSearchParams({
      label: 'Home Kochi',
      name: 'Priya Nair',
      phone: '9847055555',
      address: 'Flat 4B, Marine Drive Towers',
      city: 'Ernakulam',
      state: 'Kerala',
      pin: '682031',
      isDefault: 'true'
    }),
    redirect: 'manual'
  });
  console.log(`[Customer Test] Add address status: ${addAddrRes.status}`);

  const customerInDb = await Customer.findOne({ email: 'priya.test@example.com' });
  const savedAddr = customerInDb.addresses.find(a => a.label === 'Home Kochi');
  if (!savedAddr || savedAddr.pin !== '682031') {
    throw new Error('Saved address not found in DB!');
  }
  console.log('[Customer Test] Address saved to customer profile in MongoDB.');

  // 6. Test Placing an Order Linked to Customer Account
  const product = await Product.findOne({ active: true });
  const checkoutCreateRes = await fetch('http://localhost:3000/checkout/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      items: [{ id: product._id.toString(), size: 'L', quantity: 1 }],
      customer: {
        name: savedAddr.name,
        phone: savedAddr.phone,
        email: customerInDb.email,
        address: savedAddr.address,
        city: savedAddr.city,
        pin: savedAddr.pin
      },
      agreeNoReturns: true
    })
  });

  const checkoutData = await checkoutCreateRes.json();
  console.log(`[Customer Test] Customer order created: ${checkoutData.orderId}`);

  // Verify payment
  await fetch('http://localhost:3000/checkout/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      orderId: checkoutData.orderId,
      razorpay_order_id: checkoutData.razorpayOrderId,
      razorpay_payment_id: 'pay_cust_test_' + Date.now(),
      razorpay_signature: 'mock_test_signature'
    })
  });

  const verifiedOrder = await Order.findOne({ orderId: checkoutData.orderId });
  if (!verifiedOrder || !verifiedOrder.customerId || verifiedOrder.customerId.toString() !== customerInDb._id.toString()) {
    throw new Error('Order was not linked to customerId!');
  }
  console.log(`[Customer Test] Order ${verifiedOrder.orderId} successfully associated with customerId ${verifiedOrder.customerId}.`);

  // 7. Test Customer Order History
  const checkHistoryRes = await fetch('http://localhost:3000/account?tab=orders', {
    headers: { 'Cookie': sessionCookie }
  });
  const historyHtml = await checkHistoryRes.text();
  if (!historyHtml.includes(verifiedOrder.orderId)) {
    throw new Error('Order does not appear in customer order history!');
  }
  console.log('[Customer Test] Order confirmed visible in customer order history.');

  // 8. Test Wishlist Sync
  const syncWishRes = await fetch('http://localhost:3000/account/wishlist/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      items: [product._id.toString()]
    })
  });
  const syncData = await syncWishRes.json();
  console.log(`[Customer Test] Wishlist sync status:`, syncData);
  if (!syncData.success || !syncData.wishlist.includes(product._id.toString())) {
    throw new Error('Wishlist sync failed!');
  }
  console.log('[Customer Test] Wishlist synced to customer profile in MongoDB.');

  // 9. Test Admin Customers List
  // Log in as admin to verify read-only customer list
  const adminLoginRes = await fetch('http://localhost:3000/__test/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      email: 'admin@nestammakkili.com',
      role: 'owner'
    }),
    redirect: 'manual'
  });
  const adminRawCookie = adminLoginRes.headers.get('set-cookie') || '';
  const adminSidMatch = adminRawCookie.match(/connect\.sid=([^;]+)/);
  const adminCookie = adminSidMatch ? `connect.sid=${adminSidMatch[1]}` : adminRawCookie.split(';')[0];
  const adminCustRes = await fetch('http://localhost:3000/admin/customers', {
    headers: { 'Cookie': adminCookie }
  });
  const adminCustHtml = await adminCustRes.text();
  if (!adminCustHtml.includes('Priya Nair') || !adminCustHtml.includes('priya.test@example.com')) {
    throw new Error('Admin customer directory failed to display customer!');
  }
  console.log('[Customer Test] Customer confirmed visible in Admin Customer Directory.');

  // 10. Test Account Deletion (GDPR Right to Erasure)
  console.log('[Customer Test] Testing account deletion...');
  const deleteRes = await fetch('http://localhost:3000/account/delete', {
    method: 'POST',
    headers: { 'Cookie': sessionCookie },
    redirect: 'manual'
  });
  console.log(`[Customer Test] Delete status: ${deleteRes.status}`);

  const customerDeleted = await Customer.findOne({ email: 'priya.test@example.com' });
  if (customerDeleted) {
    throw new Error('Customer account was not deleted from DB!');
  }
  const orderAfterDelete = await Order.findOne({ orderId: checkoutData.orderId });
  if (orderAfterDelete.customerId !== null) {
    throw new Error('Order customerId was not detached after account deletion!');
  }
  console.log('[Customer Test] Account deleted cleanly; order preserved for accounting and detached.');

  console.log('\n🎉 ALL CUSTOMER ACCOUNTS & GOOGLE OAUTH TESTS PASSED!\n');
  process.exit(0);
}

testCustomerFlow().catch(err => {
  console.error('[Customer Test Error]:', err);
  process.exit(1);
});

