const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const i18nMiddleware = require('./middleware/i18n');
const { csrfTokenMiddleware, doubleCsrfProtection } = require('./middleware/csrf');
const Settings = require('./models/Settings');
const Banner = require('./models/Banner');

const app = express();

// 1. Trust proxy if behind reverse proxy
app.set('trust proxy', 1);

// 2. Compression for high performance
app.use(compression());

// 3. Static assets with sensible caching
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : '0',
  etag: true
}));

// 4. Helmet Security Headers with Razorpay, Google Fonts & YouTube CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Needed for inline scripts in templates
          'https://checkout.razorpay.com',
          'https://api.razorpay.com'
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
          "'unsafe-inline'",
          'https://fonts.googleapis.com'
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com'
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://res.cloudinary.com',
          'https://checkout.razorpay.com',
          'https://img.youtube.com'
        ],
        connectSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com',
          'https://lumberjack.razorpay.com'
        ]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// 5. Body Parsers
// NOTE: /webhooks/razorpay uses raw body for HMAC signature verification.
// We configure raw body capture for webhook route first!
app.use('/webhooks/razorpay', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET || 'nest_secret_key_12345'));

// 6. View Engine Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// 7. Session Configuration with MongoStore
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'nest_session_secret_local_2026',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGODB_URI,
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000
    }
  })
);

// 8. Internationalization (i18n)
app.use(i18nMiddleware);

// 9. Load Global Settings & Active Banner into res.locals
app.use(async (req, res, next) => {
  try {
    res.locals.path = req.path;
    res.locals.currentUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    res.locals.settings = await Settings.getSettings();

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

// 10. CSRF Protection
// Exclude Razorpay webhook and checkout JSON API from standard HTML form CSRF check if needed,
// but attach CSRF token to all templates.
app.use(csrfTokenMiddleware);

// 11. Rate limiters
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // max 30 checkout attempts per 15 minutes per IP
  message: { error: 'Too many checkout requests from this IP, please try again in 15 minutes.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // max 10 failed logins per 15m
  message: 'Too many login attempts. Please try again later.'
});

app.use('/admin/login', (req, res, next) => {
  if (req.method === 'POST') {
    return loginLimiter(req, res, next);
  }
  next();
});

// Language Switch Route
app.get('/set-lang/:lang', (req, res) => {
  const targetLang = req.params.lang === 'ml' ? 'ml' : 'en';
  res.cookie('nest_lang', targetLang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
  const referrer = req.get('Referrer');
  if (referrer && referrer.startsWith(req.protocol + '://' + req.get('host'))) {
    return res.redirect(referrer);
  }
  res.redirect('/');
});

// Import and mount routers
const storefrontRouter = require('./routes/storefront');
const cartRouter = require('./routes/cart');
const checkoutRouter = require('./routes/checkout');
const adminRouter = require('./routes/admin');
const webhookRouter = require('./routes/webhook');
const seoRouter = require('./routes/seo');

app.use('/', seoRouter); // sitemap.xml, robots.txt
app.use('/', storefrontRouter);
app.use('/cart', cartRouter);
app.use('/checkout', checkoutLimiter, checkoutRouter);
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
  console.error('[Unhandled Error]:', err);
  res.status(err.status || 500).render('pages/500', {
    title: 'Server Error',
    metaDesc: 'An unexpected error occurred.',
    error: process.env.NODE_ENV === 'development' ? err : null
  });
});

module.exports = app;
