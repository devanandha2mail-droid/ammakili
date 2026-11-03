const { doubleCsrf } = require('csrf-csrf');

const CSRF_SECRET = process.env.CSRF_SECRET || 'csrf_secret_nest_ammakkili_min32chars_long!';

const {
  generateToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  cookieName: 'x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => {
    return req.body?._csrf || req.headers['x-csrf-token'] || req.query?._csrf;
  },
});

const csrfTokenMiddleware = (req, res, next) => {
  // Generate token and attach to res.locals for templates
  try {
    const token = generateToken(req, res);
    res.locals.csrfToken = token;
  } catch (err) {
    res.locals.csrfToken = '';
  }
  next();
};

module.exports = {
  doubleCsrfProtection,
  csrfTokenMiddleware,
  generateToken
};

