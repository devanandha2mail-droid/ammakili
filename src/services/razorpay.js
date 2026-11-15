const Razorpay = require('razorpay');
const crypto = require('crypto');

const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholderKeyId';
const key_secret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_placeholderKeySecret';
const webhook_secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_test';

let instance = null;
try {
  instance = new Razorpay({
    key_id,
    key_secret
  });
} catch (err) {
  console.warn('[Razorpay] Initialization warning:', err.message);
}

/**
 * Creates an order in Razorpay (amount in paise)
 */
async function createRazorpayOrder({ amountInRupees, receipt, notes = {} }) {
  const amountInPaise = Math.round(amountInRupees * 100);

  if (!instance) {
    throw new Error('Razorpay SDK is not initialized. Please verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }

  const order = await instance.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: String(receipt).slice(0, 40),
    payment_capture: 1, // Auto-capture payment on authorization
    notes
  });

  return {
    id: order.id,
    amount: order.amount,
    currency: order.currency
  };
}

/**
 * Verifies payment signature returned by Razorpay Checkout using timingSafeEqual
 */
function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (
    typeof razorpay_order_id !== 'string' ||
    typeof razorpay_payment_id !== 'string' ||
    typeof razorpay_signature !== 'string' ||
    !razorpay_order_id.trim() ||
    !razorpay_payment_id.trim() ||
    !razorpay_signature.trim()
  ) {
    return false;
  }

  const secret = process.env.RAZORPAY_KEY_SECRET || key_secret;
  if (!secret) return false;

  const generatedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const genBuf = Buffer.from(generatedSignature, 'utf8');
  const sigBuf = Buffer.from(razorpay_signature, 'utf8');

  if (genBuf.length !== sigBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(genBuf, sigBuf);
}

/**
 * Verifies webhook signature against raw request buffer using timingSafeEqual
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !rawBody || typeof signature !== 'string') {
    return false;
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || webhook_secret;
  if (!secret) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expBuf = Buffer.from(expectedSignature, 'utf8');
  const sigBuf = Buffer.from(signature, 'utf8');

  if (expBuf.length !== sigBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expBuf, sigBuf);
}

/**
 * Initiates an automatic refund via the Razorpay API
 */
async function refundRazorpayPayment({ paymentId, amountInPaise, notes = {} }) {
  if (!paymentId) {
    throw new Error('Payment ID is required to process refund.');
  }

  if (!instance) {
    throw new Error('Razorpay SDK is not initialized. Please verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }

  const refundOptions = {
    notes
  };

  if (amountInPaise && Number.isInteger(amountInPaise)) {
    refundOptions.amount = amountInPaise;
  }

  const refund = await instance.payments.refund(paymentId, refundOptions);

  return {
    id: refund.id,
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status || 'processed'
  };
}

/**
 * Fetches payment details from Razorpay API
 */
async function fetchRazorpayPayment(paymentId) {
  if (!paymentId) throw new Error('Payment ID is required to fetch payment details.');
  if (!instance) throw new Error('Razorpay SDK is not initialized.');
  return await instance.payments.fetch(paymentId);
}

/**
 * Captures an authorized payment for an exact amount in paise
 */
async function captureRazorpayPayment(paymentId, amountInPaise, currency = 'INR') {
  if (!paymentId) throw new Error('Payment ID is required to capture payment.');
  if (!instance) throw new Error('Razorpay SDK is not initialized.');
  return await instance.payments.capture(paymentId, amountInPaise, currency);
}

/**
 * Fetches all payments associated with a Razorpay Order ID (used for reconciliation)
 */
async function fetchOrderPayments(razorpayOrderId) {
  if (!razorpayOrderId) throw new Error('Razorpay Order ID is required to fetch payments.');
  if (!instance) throw new Error('Razorpay SDK is not initialized.');
  return await instance.orders.fetchPayments(razorpayOrderId);
}

/**
 * Performs a harmless API check to validate Razorpay credentials in non-production.
 * Never prints or leaks secrets.
 */
async function validateRazorpayKeys() {
  if (!instance) {
    console.log('Razorpay keys INVALID: SDK failed to initialize');
    return false;
  }
  try {
    await instance.orders.all({ count: 1 });
    console.log('Razorpay keys OK (test mode)');
    return true;
  } catch (err) {
    const reason = err.error?.description || err.message || (err.statusCode ? `HTTP ${err.statusCode}` : 'Authentication failed');
    console.log(`Razorpay keys INVALID: ${reason}`);
    return false;
  }
}

module.exports = {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  refundRazorpayPayment,
  fetchRazorpayPayment,
  captureRazorpayPayment,
  fetchOrderPayments,
  validateRazorpayKeys,
  key_id
};
