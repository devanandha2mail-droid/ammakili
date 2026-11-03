const mongoose = require('mongoose');
const Admin = require('../src/models/Admin');
const Order = require('../src/models/Order');

async function testAdminFlow() {
  await mongoose.connect('mongodb://127.0.0.1:27017/nest_ammakkili');

  // 1. Test Admin Login POST
  console.log('[Admin Test] Attempting login with seeded credentials...');
  const loginRes = await fetch('http://localhost:3000/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      email: 'admin@nestammakkili.com',
      password: 'AdminNest2026!'
    }),
    redirect: 'manual'
  });

  const cookieHeader = loginRes.headers.get('set-cookie');
  console.log(`[Admin Test] Login status: ${loginRes.status}, Redirect: ${loginRes.headers.get('location')}`);
  if (loginRes.status !== 302 || !cookieHeader) {
    throw new Error('Admin login failed or did not set session cookie!');
  }

  const sessionCookie = cookieHeader.split(';')[0];
  console.log('[Admin Test] Session established successfully.');

  // 2. Test Admin Dashboard GET
  const dashRes = await fetch('http://localhost:3000/admin', {
    headers: { 'Cookie': sessionCookie }
  });
  console.log(`[Admin Test] GET /admin: status ${dashRes.status}`);
  const dashHtml = await dashRes.text();
  if (!dashHtml.includes('Dashboard') || !dashHtml.includes('Orders To Pack')) {
    throw new Error('Dashboard page failed to load!');
  }
  console.log('[Admin Test] Dashboard metrics rendered cleanly.');

  // 3. Test GET /admin/products
  const prodRes = await fetch('http://localhost:3000/admin/products', {
    headers: { 'Cookie': sessionCookie }
  });
  console.log(`[Admin Test] GET /admin/products: status ${prodRes.status}`);
  const prodHtml = await prodRes.text();
  if (!prodHtml.includes('Rose Garden Nighty')) {
    throw new Error('Product list failed to show seeded nighties!');
  }

  // 4. Test Orders List & Status Update
  const testOrder = await Order.findOne().sort({ createdAt: -1 });
  if (!testOrder) throw new Error('No test order found!');
  console.log(`[Admin Test] Found order to manage: ${testOrder.orderId}`);

  // Update order to packed and shipped
  const updateRes = await fetch(`http://localhost:3000/admin/orders/${testOrder._id}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': sessionCookie
    },
    body: new URLSearchParams({
      status: 'shipped',
      courier: 'ST Courier Kerala',
      trackingId: 'STKRL998877IN',
      adminNotes: 'Inspected and dispatched from Kochi hub.'
    }),
    redirect: 'manual'
  });

  console.log(`[Admin Test] Order status update: status ${updateRes.status}`);
  const updatedOrder = await Order.findById(testOrder._id);
  if (updatedOrder.status !== 'shipped' || updatedOrder.tracking.trackingId !== 'STKRL998877IN') {
    throw new Error('Order status or tracking update failed in DB!');
  }
  console.log(`[Admin Test] Order updated in DB to status: ${updatedOrder.status}, trackingId: ${updatedOrder.tracking.trackingId}`);

  // 5. Test Printable Packing Slip
  const slipRes = await fetch(`http://localhost:3000/admin/orders/${testOrder._id}/packing-slip`, {
    headers: { 'Cookie': sessionCookie }
  });
  console.log(`[Admin Test] Packing Slip GET: status ${slipRes.status}`);
  const slipHtml = await slipRes.text();
  if (!slipHtml.includes('PACKING SLIP') || !slipHtml.includes(testOrder.orderId)) {
    throw new Error('Packing slip view failed!');
  }

  // 6. Test Export CSV
  const csvRes = await fetch('http://localhost:3000/admin/orders/export/csv', {
    headers: { 'Cookie': sessionCookie }
  });
  console.log(`[Admin Test] CSV Export GET: status ${csvRes.status}`);
  const csvText = await csvRes.text();
  if (!csvText.includes('Order ID') || !csvText.includes(testOrder.orderId)) {
    throw new Error('CSV export failed or missing order rows!');
  }
  console.log('[Admin Test] CSV export verified successfully.');

  // 7. Test Settings
  const settingsRes = await fetch('http://localhost:3000/admin/settings', {
    headers: { 'Cookie': sessionCookie }
  });
  console.log(`[Admin Test] GET /admin/settings: status ${settingsRes.status}`);

  console.log(`\n🎉 ALL ADMIN INTEGRATION TESTS PASSED!\n`);
  process.exit(0);
}

testAdminFlow().catch(err => {
  console.error('[Admin Test Error]:', err);
  process.exit(1);
});
