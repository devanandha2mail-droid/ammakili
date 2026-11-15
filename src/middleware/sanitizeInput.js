/**
 * NoSQL Injection Protection Middleware
 * Strips or rejects $ and . in keys anywhere in request bodies, query params, or URL params.
 */

function hasForbiddenKey(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) {
    return obj.some(item => hasForbiddenKey(item));
  }
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (hasForbiddenKey(obj[key])) return true;
    }
  }
  return false;
}

function sanitizeInputMiddleware(req, res, next) {
  // Check req.body, req.query, req.params
  if (hasForbiddenKey(req.body) || hasForbiddenKey(req.query) || hasForbiddenKey(req.params)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_INPUT_KEY',
        message: 'Invalid input characters detected. Key names cannot start with $ or contain .'
      },
      requestId: req.id
    });
  }
  next();
}

module.exports = {
  sanitizeInputMiddleware,
  hasForbiddenKey
};

