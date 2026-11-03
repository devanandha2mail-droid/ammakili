function safeReturnUrl(url) {
  if (!url || typeof url !== 'string') return '/account';
  const clean = url.trim();
  // Must start with a single / and NOT // or /\ or contain protocol schemes
  if (clean.startsWith('/') && !clean.startsWith('//') && !clean.startsWith('/\\') && !clean.includes('://')) {
    return clean;
  }
  return '/account';
}

const requireCustomer = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  const returnTo = safeReturnUrl(req.originalUrl || req.url);
  return res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
};

const customerLocalsMiddleware = (req, res, next) => {
  // Attach current authenticated customer to res.locals for EJS views
  res.locals.customer = req.user || null;
  res.locals.requireLoginAtCheckout = process.env.REQUIRE_LOGIN_AT_CHECKOUT === 'true';
  next();
};

module.exports = {
  requireCustomer,
  customerLocalsMiddleware,
  safeReturnUrl
};
