/**
 * Origin & Referer Verification Middleware
 * Rejects state-changing requests (POST, PUT, PATCH, DELETE) whose Origin or Referer
 * does not match SITE_URL (allows localhost in dev/test).
 */
function originCheckMiddleware(req, res, next) {
  // Only inspect state-changing requests
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!stateChangingMethods.includes(req.method)) {
    return next();
  }

  // Exempt external webhooks that use cryptographic HMAC signatures
  if (req.path.startsWith('/webhooks')) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer || req.headers.referrer;

  // Determine allowed hosts
  const configuredSiteUrl = process.env.SITE_URL || '';
  let allowedHost = '';
  if (configuredSiteUrl) {
    try {
      allowedHost = new URL(configuredSiteUrl).host;
    } catch (e) {}
  }
  const hostHeader = req.get('host');

  const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

  function isHostAllowed(urlStr) {
    if (!urlStr) return false;
    try {
      const u = new URL(urlStr);
      if (allowedHost && u.host === allowedHost) return true;
      if (hostHeader && u.host === hostHeader) return true;
      if (isDevOrTest && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  // At least one of origin or referer must be present and valid
  const hasValidOrigin = origin ? isHostAllowed(origin) : false;
  const hasValidReferer = referer ? isHostAllowed(referer) : false;

  if (origin && !hasValidOrigin) {
    return res.status(403).json({
      error: { code: 'INVALID_ORIGIN', message: 'Forbidden: Request origin does not match trusted site domain.' },
      requestId: req.id
    });
  }

  if (!origin && referer && !hasValidReferer) {
    return res.status(403).json({
      error: { code: 'INVALID_ORIGIN', message: 'Forbidden: Request referer does not match trusted site domain.' },
      requestId: req.id
    });
  }

  next();
}

module.exports = {
  originCheckMiddleware
};

