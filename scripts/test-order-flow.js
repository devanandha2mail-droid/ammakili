const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');

async function testOrderFlow() {
  await mongoose.connect('mongodb://127.0.0.1:27017/nest_ammakkili');

  // Ensure test product has at least 5 in stock for size M
  await Product.updateOne(
    { slug: 'rose-garden-nighty', 'sizes.size': 'M' },
    { $set: { 'sizes.$.stock': 6 } }
  );

  // Find demo product
  const product = await Product.findOne({ slug: 'rose-garden-nighty' });
  const initialStock = product.sizes.find(s => s.size === 'M').stock;
  console.log(`[Test] Initial M stock for ${product.name.en}: ${initialStock}`);

  // 1. Test POST /cart/validate
  const validateRes = await fetch('http://localhost:3000/cart/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: product._id.toString(), size: 'M', quantity: 2 }]
    })
  });
  const validateData = await validateRes.json();
  console.log(`[Test] /cart/validate status: ${validateRes.status}, valid: ${validateData.valid}, total: ₹${validateData.total} (subtotal ${validateData.subtotal} + shipping ${validateData.shipping})`);

  if (!validateData.valid || validateData.total !== (product.price * 2 + 60)) {
    throw new Error('Cart validation mismatch!');
  }

  // 2. Test POST /checkout/create
  const createRes = await fetch('http://localhost:3000/checkout/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: product._id.toString(), size: 'M', quantity: 2, price: 1 }], // attempt to tamper price to ₹1!
      customer: {
        name: 'Lakshmi Nair',
        phone: '9847012345',
        email: 'lakshmi@example.com',
        address: 'Tharavadu House, MG Road',
        city: 'Kochi',
        state: 'Kerala',
        pin: '682001'
      },
      agreeNoReturns: true
    })
  });

  const createData = await createRes.json();
  console.log(`[Test] /checkout/create:`, createData);

  if (!createData.success || !createData.orderId) {
    throw new Error('Order creation failed: ' + JSON.stringify(createData));
  }

  // Verify price tampering was ignored by checking order in DB
  const createdOrder = await Order.findOne({ orderId: createData.orderId });
  console.log(`[Test] Created Order in DB: ID=${createdOrder.orderId}, subtotal=₹${createdOrder.subtotal}, shipping=₹${createdOrder.shipping}, total=₹${createdOrder.total}, status=${createdOrder.status}`);

  if (createdOrder.subtotal !== product.price * 2) {
    throw new Error(`Security violation! Server accepted tampered price. Subtotal: ${createdOrder.subtotal}, expected: ${product.price * 2}`);
  }
  console.log(`[Test] Security verified: Tampered client price was strictly ignored! Server charged official DB price ₹${product.price} * 2.`);

  // 3. Test POST /checkout/verify
  const verifyRes = await fetch('http://localhost:3000/checkout/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: createData.orderId,
      razorpay_order_id: createData.razorpayOrderId,
      razorpay_payment_id: 'pay_test_' + Date.now(),
      razorpay_signature: 'mock_test_signature'
    })
  });

  const verifyData = await verifyRes.json();
  console.log(`[Test] /checkout/verify:`, verifyData);

  if (!verifyData.success) {
    throw new Error('Payment verification failed!');
  }

  // Verify stock was decremented by 2
  const updatedProduct = await Product.findById(product._id);
  const newStock = updatedProduct.sizes.find(s => s.size === 'M').stock;
  console.log(`[Test] Stock after payment: ${newStock} (was ${initialStock})`);

  if (newStock !== initialStock - 2) {
    throw new Error(`Stock decrement failed! Expected ${initialStock - 2}, got ${newStock}`);
  }
  console.log(`[Test] Stock atomically decremented by 2.`);

  // 4. Test Idempotency: verify again and ensure stock is NOT decremented a second time
  await fetch('http://localhost:3000/checkout/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: createData.orderId,
      razorpay_order_id: createData.razorpayOrderId,
      razorpay_payment_id: 'pay_test_duplicate',
      razorpay_signature: 'mock_test_signature'
    })
  });

  const checkProductAgain = await Product.findById(product._id);
  const stockAfterDuplicate = checkProductAgain.sizes.find(s => s.size === 'M').stock;
  if (stockAfterDuplicate !== newStock) {
    throw new Error(`Idempotency failed! Stock was decremented twice: ${stockAfterDuplicate}`);
  }
  console.log(`[Test] Idempotency confirmed: Repeated verification did NOT double-decrement stock.`);

  // 5. Test Order Confirmation Page
  const confRes = await fetch(`http://localhost:3000/checkout/confirmation/${createData.orderId}`);
  console.log(`[Test] Confirmation page GET /checkout/confirmation/${createData.orderId}: status ${confRes.status}`);
  const confHtml = await confRes.text();
  if (!confHtml.includes(createData.orderId) || !confHtml.includes('https://wa.me/')) {
    throw new Error('Confirmation page missing order ID or WhatsApp link!');
  }
  console.log(`[Test] Confirmation page renders correctly with prefilled WhatsApp button.`);

  // 6. Test Order Tracking
  const trackRes = await fetch('http://localhost:3000/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      orderId: createData.orderId,
      phone: '9847012345'
    })
  });
  const trackHtml = await trackRes.text();
  if (trackHtml.includes('PAID') && trackHtml.includes(createData.orderId)) {
    console.log(`[Test] Order tracking verified: successfully shows order status as PAID.`);
  } else {
    throw new Error('Order tracking verification failed!');
  }

  console.log(`\n🎉 ALL CHECKOUT & PAYMENT INTEGRATION TESTS PASSED!\n`);
  process.exit(0);
}

testOrderFlow().catch(err => {
  console.error('[Test Failure]:', err);
  process.exit(1);
});

