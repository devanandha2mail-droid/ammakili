/**
 * Secondary Rate Limiter per Order ID:
 * Max 5 failed tracking attempts per hour per order ID.
 * Returns a generic error message to prevent brute-force phone enumeration.
 */
// Use a globally scoped Map so even if modules are re-instantiated in tests, tracking attempts persist consistently
if (!global.__failedTrackingAttempts) {
  global.__failedTrackingAttempts = new Map();
}
const failedTrackingAttempts = global.__failedTrackingAttempts;

function trackOrderFailure(orderId) {
  const cleanId = String(orderId || '').trim().toUpperCase();
  if (!cleanId) return;
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const list = (failedTrackingAttempts.get(cleanId) || []).filter(t => t > oneHourAgo);
  list.push(now);
  failedTrackingAttempts.set(cleanId, list);
}

function resetOrderTrackingFailures(orderId) {
  const cleanId = String(orderId || '').trim().toUpperCase();
  failedTrackingAttempts.delete(cleanId);
}

function isOrderTrackingRateLimited(orderId) {
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMITS !== 'true') return false;
  const cleanId = String(orderId || '').trim().toUpperCase();
  if (!cleanId) return false;
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const list = (failedTrackingAttempts.get(cleanId) || []).filter(t => t > oneHourAgo);
  return list.length >= 5;
}

const orderIdTrackLimiter = (req, res, next) => {
  const orderId = req.body?.orderId;
  if (orderId && isOrderTrackingRateLimited(orderId)) {
    const errorMsg = 'Too many tracking attempts for this order. Please try again later.';
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(429).json({ error: errorMsg });
    }
    return res.status(429).render('pages/track', {
      title: res.locals.t ? res.locals.t('tracking.title') : 'Track Order',
      metaDesc: res.locals.t ? res.locals.t('tracking.lead') : 'Track your order',
      error: errorMsg,
      order: null,
      orderId,
      phone: req.body.phone || '',
      searched: true
    });
  }
  next();
};

module.exports = {
  trackOrderFailure,
  resetOrderTrackingFailures,
  isOrderTrackingRateLimited,
  orderIdTrackLimiter
};
