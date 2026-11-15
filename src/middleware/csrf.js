const { doubleCsrf } = require('csrf-csrf');
const crypto = require('crypto');

const CSRF_SECRET = process.env.CSRF_SECRET || 'csrf_secret_nest_ammakkili_min32chars_long!';
const isProd = process.env.NODE_ENV === 'production';
const GUEST_COOKIE_NAME = isProd ? '__Host-nest_guest' : 'nest_guest';

const GUEST_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  signed: true,
  path: '/'
};

function getSessionIdentifier(req) {
  // If user is authenticated in session (admin or customer), use user ID or session ID
  if (req.session && (req.session.adminId || req.session.admin || req.session.passport?.user)) {
    return String(req.session.adminId || req.session.admin?.id || req.session.passport?.user || req.session.id);
  }

  // For anonymous visitors, use signed guest cookie or in-flight generated guest ID
  const guestId = req.signedCookies ? req.signedCookies[GUEST_COOKIE_NAME] : null;
  if (guestId) {
    return guestId;
  }
  if (req._generatedGuestId) {
    return req._generatedGuestId;
  }
  return 'guest';
}

const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  getSessionIdentifier,
  cookieName: isProd ? '__Host-x-csrf-token' : 'x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: isProd,
    httpOnly: true,
  },
  size: 32,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req) => {
    return req.body?._csrf || req.headers['x-csrf-token'] || req.headers['csrf-token'] || req.query?._csrf;
  },
});

const FORM_PAGE_PREFIXES = [
  '/cart',
  '/checkout',
  '/admin',
  '/account',
  '/track',
  '/login',
  '/auth'
];

function isFormPageOrApi(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    return true;
  }
  const p = req.path.toLowerCase();
  return FORM_PAGE_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'));
}

const csrfTokenMiddleware = (req, res, next) => {
  // Only issue guest cookie and generate CSRF token on pages with forms or API endpoints
  if (!isFormPageOrApi(req)) {
    res.locals.csrfToken = '';
    return next();
  }

  try {
    const hasAuthSession = req.session && (req.session.adminId || req.session.admin || req.session.passport?.user);
    const existingGuest = req.signedCookies ? req.signedCookies[GUEST_COOKIE_NAME] : null;

    if (!hasAuthSession && !existingGuest) {
      const newGuestId = crypto.randomBytes(16).toString('hex');
      req._generatedGuestId = newGuestId;
      res.cookie(GUEST_COOKIE_NAME, newGuestId, GUEST_COOKIE_OPTIONS);
    }

    const token = generateCsrfToken(req, res);
    res.locals.csrfToken = token;
  } catch (err) {
    res.locals.csrfToken = '';
  }
  next();
};

module.exports = {
  doubleCsrfProtection,
  csrfTokenMiddleware,
  generateToken: generateCsrfToken,
  GUEST_COOKIE_NAME
};
