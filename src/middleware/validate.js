/**
 * Request Validation Middleware using Zod
 * Rejects requests with unexpected fields or invalid types.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message
      }));
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/checkout') || req.path.startsWith('/cart')) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body or unexpected fields.',
            details: issues
          },
          requestId: req.id
        });
      }
      return res.status(400).send(`Invalid request: ${issues.map(i => i.path + ': ' + i.message).join(', ')}`);
    }
    // Replace req.body with the sanitized parsed data
    req.body = result.data;
    next();
  };
}

module.exports = {
  validateBody
};

