const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { validateEnvironment } = require('./utils/envGuard');
validateEnvironment();
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const mongoose = require('mongoose');

const i18nMiddleware = require('./middleware/i18n');
const { csrfTokenMiddleware, doubleCsrfProtection } = require('./middleware/csrf');
const passport = require('./config/passport');
const { customerLocalsMiddleware } = require('./middleware/customerAuth');
const Settings = require('./models/Settings');
const Banner = require('./models/Banner');

const app = express();
app.disable('x-powered-by');

// Health check endpoints (monitoring & container orchestrators)
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/readyz', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ status: 'unavailable' });
    }
    await mongoose.connection.db.admin().ping();
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable' });
  }
});

// 1. Trust proxy configured via TRUST_PROXY_HOPS env (default 1 hop)
const trustProxyHops = process.env.TRUST_PROXY_HOPS !== undefined ? parseInt(process.env.TRUST_PROXY_HOPS, 10) : 1;
app.set('trust proxy', isNaN(trustProxyHops) ? 1 : trustProxyHops);

// 1b. Per-request ID tracking
app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || `req_${crypto.randomUUID().slice(0, 8)}`;
  req.id = reqId;
  res.setHeader('x-request-id', reqId);
  next();
});

// 2. Compression for high performance
app.use(compression());

// 3. Static assets with sensible caching
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
  etag: true,
  lastModified: true
}));

// 4. Per-request CSP Nonce Generation for strict script execution
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

// 5. Helmet Security Headers (strict scriptSrc without 'unsafe-inline' and without api.razorpay.com)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          'https://checkout.razorpay.com'
        ],
        frameSrc: [
          "'self'",
          'https://checkout.razorpay.com',
          'https://api.razorpay.com',
          'https://www.youtube.com',
          'https://www.youtube-nocookie.com'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'"
        ],
        fontSrc: [
          "'self'"
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://res.cloudinary.com',
          'https://checkout.razorpay.com',
          'https://img.youtube.com',
          'https://lh3.googleusercontent.com'
        ],
        connectSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com',
          'https://lumberjack.razorpay.com'
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: process.env.NODE_ENV === 'production' ? {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true
    } : false
  })
);

// 5b. Permissions-Policy, Cache-Control, and Pre-launch X-Robots-Tag
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com")');

  if (
    req.path === '/admin' || req.path.startsWith('/admin/') ||
    req.path === '/account' || req.path.startsWith('/account/') ||
    req.path === '/checkout' || req.path.startsWith('/checkout/')
  ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }

  const siteUrl = process.env.SITE_URL || '';
  if (process.env.NODE_ENV !== 'production' || !siteUrl.includes('nestammakkili.com')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }

  next();
});

// 6. Body Parsers with 100 KB max limit
// NOTE: /webhooks/razorpay uses raw body for HMAC signature verification.
app.use('/webhooks/razorpay', express.raw({ type: 'application/json', limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser(process.env.SESSION_SECRET || 'nest_secret_key_12345'));

// 6b. NoSQL Operator Sanitization & Cross-Site Origin Verification
const { sanitizeInputMiddleware } = require('./middleware/sanitizeInput');
const { originCheckMiddleware } = require('./middleware/originCheck');
app.use(sanitizeInputMiddleware);
app.use(originCheckMiddleware);

// 6. View Engine Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// 7. Segregated Session Configurations with MongoStore (Customer vs Admin)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';
const isProd = process.env.NODE_ENV === 'production';
const isLocalDb = !process.env.MONGODB_URI || MONGODB_URI.includes('127.0.0.1') || MONGODB_URI.includes('localhost');
const useMemoryStore = Boolean(process.env.VERCEL && isLocalDb);

const customerSessionMiddleware = session({
  name: isProd ? '__Host-nest_sess' : 'nest_sess',
  secret: process.env.SESSION_SECRET || 'nest_customer_session_secret_local',
  resave: false,
  saveUninitialized: false,
  store: useMemoryStore ? new session.MemoryStore() : MongoStore.create({
    mongoUrl: MONGODB_URI,
    mongoOptions: {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000
    },
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60 // 14 days
  }),
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
});

const adminSessionMiddleware = session({
  name: isProd ? '__Host-nest_admin_sess' : 'nest_admin_sess',
  secret: process.env.SESSION_SECRET || 'nest_admin_session_secret_local',
  resave: false,
  saveUninitialized: false,
  store: useMemoryStore ? new session.MemoryStore() : MongoStore.create({
    mongoUrl: MONGODB_URI,
    mongoOptions: {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000
    },
    collectionName: 'admin_sessions',
    ttl: 8 * 60 * 60 // 8 hours absolute
  }),
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 30 * 60 * 1000 // 30 mins rolling idle
  }
});

app.set('adminSessionMiddleware', adminSessionMiddleware);

app.use((req, res, next) => {
  const isAdminCallback = req.path === '/auth/google/callback' &&
    typeof req.query.state === 'string' &&
    req.query.state.startsWith('admin_');

  if (req.path === '/admin' || req.path.startsWith('/admin/') || isAdminCallback) {
    return adminSessionMiddleware(req, res, next);
  }
  return customerSessionMiddleware(req, res, next);
});

// 8. Passport Authentication (Customer Google Sign-in on non-admin routes only)
app.use((req, res, next) => {
  const isAdminCallback = req.path === '/auth/google/callback' &&
    typeof req.query.state === 'string' &&
    req.query.state.startsWith('admin_');

  if (req.path.startsWith('/admin') || isAdminCallback) {
    return next();
  }
  passport.initialize()(req, res, (err) => {
    if (err) return next(err);
    passport.session()(req, res, next);
  });
});
app.use(customerLocalsMiddleware);

// Admin Status Detection for Storefront Previews
const cookieSignature = require('cookie-signature');
app.use(async (req, res, next) => {
  res.locals.isAdmin = false;
  if (req.session && req.session.adminId) {
    res.locals.isAdmin = true;
    return next();
  }
  const adminCookieName = isProd ? '__Host-nest_admin_sess' : 'nest_admin_sess';
  const sessionId = (req.signedCookies && req.signedCookies[adminCookieName]) ||
    (req.cookies && req.cookies[adminCookieName] && typeof req.cookies[adminCookieName] === 'string' && req.cookies[adminCookieName].startsWith('s:')
      ? cookieSignature.unsign(req.cookies[adminCookieName].slice(2), process.env.SESSION_SECRET || 'nest_admin_session_secret_local')
      : null);

  if (sessionId && mongoose.connection.readyState === 1) {
    try {
      const sessionDoc = await mongoose.connection.collection('admin_sessions').findOne({ _id: sessionId });
      if (sessionDoc && sessionDoc.session) {
        const sessData = typeof sessionDoc.session === 'string' ? JSON.parse(sessionDoc.session) : sessionDoc.session;
        if (sessData && sessData.adminId) {
          res.locals.isAdmin = true;
        }
      }
    } catch (e) {}
  }
  next();
});

// 9. Internationalization (i18n)
app.use(i18nMiddleware);

// 9. Load Global Settings & Active Banner into res.locals
app.use(async (req, res, next) => {
  res.locals.path = req.path;
  const computedHost = req.get('host');
  const baseProto = (req.headers['x-forwarded-proto'] || req.protocol || 'https');
  const hostUrl = `${baseProto}://${computedHost}`;
  res.locals.siteUrl = (process.env.SITE_URL && !process.env.SITE_URL.includes('localhost')) ? process.env.SITE_URL : hostUrl;
  res.locals.currentUrl = `${hostUrl}${req.originalUrl}`;

  if (mongoose.connection.readyState !== 1) {
    res.locals.settings = {
      shippingCharge: 60,
      whatsappNumber: process.env.WHATSAPP_NUMBER || '919876543210',
      announcementText: {
        en: 'Soft, breathable nighties crafted for restful comfort. Prepaid orders only • Flat ₹60 shipping.',
        ml: 'സുഖകരവും ഗുണമേന്മയുള്ളതുമായ നൈറ്റികൾ. പ്രീപെയ്ഡ് ഓർഡറുകൾ മാത്രം • ഷിപ്പിംഗ് ₹60.'
      }
    };
    res.locals.whatsappNumber = res.locals.settings.whatsappNumber;
    res.locals.banner = null;
    return next();
  }

  try {
    const globalSettings = await Settings.getSettings();
    res.locals.settings = globalSettings;
    res.locals.whatsappNumber = globalSettings.whatsappNumber || '919876543210';

    // Find current active festival or seasonal banner
    const now = new Date();
    const banner = await Banner.findOne({
      active: true,
      startsAt: { $lte: now },
      $or: [{ endsAt: null }, { endsAt: { $gte: now } }]
    }).sort({ createdAt: -1 });

    res.locals.banner = banner;
    next();
  } catch (err) {
    console.error('Global settings middleware error:', err);
    res.locals.settings = { shippingCharge: 60, whatsappNumber: '919876543210' };
    res.locals.banner = null;
    next();
  }
});

// 10. Rate Limiters
// IP-based checkout limiter: raised to 60 requests per 15 minutes.
// Many Indian mobile customers share cellular carrier CGNAT IPs (e.g., Jio, Airtel, Vi).
// Raising the IP limit to 60 per 15 minutes avoids falsely blocking multiple legitimate buyers sharing a cell tower IP.
const checkoutIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 checkout requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMITS !== 'true',
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many checkout requests from this network, please try again in 15 minutes.'
      },
      requestId: req.id
    });
  }
});

// Per-session or per-cart limiter: 10 requests per 15 minutes.
// While network IP is shared among multiple mobile subscribers, session ID is unique per device/browser.
// Limiting to 10 creates per 15m stops automated bot abuse and cart flooding without affecting other users.
const checkoutSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?._id) return `user_${req.user._id}`;
    const guestCookie = req.signedCookies ? (req.signedCookies['nest_guest'] || req.signedCookies['__Host-nest_guest']) : null;
    if (guestCookie) return `guest_${guestCookie}`;
    if (req.cookies && req.cookies['connect.sid']) return `sess_${req.sessionID}`;
    const cartToken = req.headers['x-cart-token'] || req.headers['x-guest-id'];
    if (cartToken) return `cart_${cartToken}`;
    return ipKeyGenerator(req.ip, 64);
  },
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMITS !== 'true',
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many checkout attempts for this session. Please try again in 15 minutes.'
      },
      requestId: req.id
    });
  }
});

app.use('/checkout', checkoutIpLimiter);
app.use('/checkout/create', checkoutSessionLimiter);

// 11. CSRF Protection
// Exclude Razorpay webhooks and test login from CSRF check,
// but protect all other state-changing routes.
app.use(csrfTokenMiddleware);

app.use((req, res, next) => {
  if (
    req.path.startsWith('/webhooks') ||
    req.path.startsWith('/_') ||
    req.path === '/track' ||
    req.path === '/track-order' ||
    req.path === '/admin/login' ||
    req.path === '/account/wishlist/sync' ||
    req.path === '/account/delete' ||
    req.path === '/cart/validate' ||
    req.path === '/admin/products/add' ||
    req.path.startsWith('/admin/products/edit/') ||
    req.path === '/admin/stylist/upload'
  ) {
    return next();
  }
  return doubleCsrfProtection(req, res, next);
});

// Language Switch Route
const handleLangSwitch = (req, res) => {
  const targetLang = req.params.lang === 'ml' ? 'ml' : 'en';
  res.cookie('nest_lang', targetLang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
  const rawTarget = req.query.returnTo || req.get('Referrer') || req.get('referer');
  if (rawTarget) {
    try {
      if (rawTarget.startsWith('/') && !rawTarget.startsWith('//')) {
        return res.redirect(rawTarget);
      }
      const parsed = new URL(rawTarget, 'http://localhost');
      if (parsed.hostname === req.hostname || parsed.host === req.get('host')) {
        return res.redirect(parsed.pathname + parsed.search);
      }
    } catch (e) {}
  }
  res.redirect('/');
};
app.get('/set-lang/:lang', handleLangSwitch);
app.get('/lang/:lang', handleLangSwitch);

// Test harness integration: strictly loaded conditionally only in test environment
if (process.env.NODE_ENV === 'test') {
  try {
    const setupTestHarness = require('../tests/harness');
    setupTestHarness(app);
  } catch (err) {
    // Harness omitted in production builds
  }
} else {
  // In production builds, explicitly ensure test-only login endpoints return 404
  app.use((req, res, next) => {
    if (req.path === '/admin/test-login') {
      return res.status(404).send('Not Found');
    }
    next();
  });
}

// Import and mount routers
const storefrontRouter = require('./routes/storefront');
const authRouter = require('./routes/auth');
const accountRouter = require('./routes/account');
const cartRouter = require('./routes/cart');
const checkoutRouter = require('./routes/checkout');
const adminRouter = require('./routes/admin');
const webhookRouter = require('./routes/webhook');
const seoRouter = require('./routes/seo');

app.use('/', seoRouter); // sitemap.xml, robots.txt
app.use('/', authRouter); // /login, /logout, /auth/google
app.use('/account', accountRouter); // /account
app.use('/', storefrontRouter);
app.use('/cart', cartRouter);
app.use('/checkout', checkoutRouter);
app.use('/webhooks', webhookRouter);
app.use('/admin', adminRouter);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).render('pages/404', {
    title: 'Page Not Found',
    metaDesc: 'The requested page could not be found.'
  });
});

// 500 Global Error Handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/checkout') || req.path.startsWith('/cart')) {
      return res.status(403).json({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please reload the page to refresh your token.'
        },
        requestId: req.id
      });
    }
    return res.status(403).send('Forbidden: Invalid or missing CSRF token');
  }
  console.error(`[Request ${req.id}] [Unhandled Error]:`, err);
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/checkout') || req.path.startsWith('/cart')) {
    return res.status(err.status || 500).json({
      error: {
        code: 'PAYMENT_SERVICE_UNAVAILABLE',
        message: 'Payment service is temporarily unavailable. Please try again in a few moments.'
      },
      requestId: req.id
    });
  }
  res.status(err.status || 500).render('pages/500', {
    title: 'Server Error',
    metaDesc: 'An unexpected error occurred.',
    error: process.env.NODE_ENV === 'development' ? err : null
  });
});

module.exports = app;
