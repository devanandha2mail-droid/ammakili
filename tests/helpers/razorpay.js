const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_test_xyz';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_nestammakkili_test';

/**
 * Creates a signed Razorpay webhook payload
 * Computes the HMAC SHA256 of the raw payload string using the webhook secret
 */
function createSignedWebhookPayload(event, entity = {}, customSecret = null, customPayload = null) {
  let payload = customPayload;
  if (!payload) {
    if (event === 'refund.processed') {
      payload = {
        entity: 'event',
        account_id: 'acc_test123',
        event: event,
        contains: ['refund'],
        payload: {
          refund: {
            entity: entity
          }
        },
        created_at: Math.floor(Date.now() / 1000)
      };
    } else {
      payload = {
        entity: 'event',
        account_id: 'acc_test123',
        event: event,
        contains: ['payment'],
        payload: {
          payment: {
            entity: entity
          }
        },
        created_at: Math.floor(Date.now() / 1000)
      };
    }
  }

  const rawBody = JSON.stringify(payload);
  const secret = (typeof customSecret === 'string') ? customSecret : WEBHOOK_SECRET;
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  return {
    rawBody,
    signature,
    payload
  };
}

/**
 * Generates an HMAC SHA256 payment signature matching Razorpay client verification
 */
function generatePaymentSignature(razorpayOrderId, razorpayPaymentId, customSecret = null) {
  const secret = customSecret !== null ? customSecret : KEY_SECRET;
  return crypto
    .createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

module.exports = {
  createSignedWebhookPayload,
  generatePaymentSignature,
  WEBHOOK_SECRET,
  KEY_SECRET
};
