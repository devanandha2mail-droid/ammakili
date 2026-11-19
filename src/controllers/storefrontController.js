const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { trackOrderFailure, resetOrderTrackingFailures } = require('../middleware/trackOrderLimiter');

let sampleProductsCache = null;
function getSampleProducts() {
  if (!sampleProductsCache) {
    try {
      const list = require('../../tests/fixtures/test-products.json');
      sampleProductsCache = list.map(item => new Product(item));
    } catch (e) {
      sampleProductsCache = [];
    }
  }
  return sampleProductsCache;
}

// Home Page
exports.getHome = async (req, res, next) => {
  try {
    let newArrivals = [];
    let featuredProducts = [];

    if (mongoose.connection.readyState === 1) {
      [newArrivals, featuredProducts] = await Promise.all([
        Product.find({ active: true }).sort({ createdAt: -1 }).limit(8),
        Product.find({ active: true, featured: true }).sort({ createdAt: -1 }).limit(3)
      ]);
    }

    if (!newArrivals || !newArrivals.length) {
      const all = getSampleProducts();
      newArrivals = all.slice(0, 8);
      featuredProducts = all.filter(p => p.featured).slice(0, 3);
    }

    // Use explicit featured products if available, fallback to empty array or first product
    const heroProducts = featuredProducts.length > 0 ? featuredProducts : [];
    const heroProduct = heroProducts[0] || newArrivals[0] || null;

    res.render('pages/home', {
      title: res.locals.t('site.tagline'),
      metaDesc: res.locals.t('site.description'),
      products: newArrivals,
      featuredProduct: heroProduct,
      featuredProducts: heroProducts
    });
  } catch (err) {
    next(err);
  }
};

// Shop Page with Search, Category Filter, Sort, and Pagination
exports.getShop = async (req, res, next) => {
  try {
    const { q, style, sort, page = 1, ajax } = req.query;
    const limit = 12;
    const skip = (parseInt(page, 10) - 1) * limit;

    let products = [];
    let totalCount = 0;
    let styles = [];

    if (mongoose.connection.readyState === 1) {
      const query = { active: true };

      if (style && style.trim() !== '' && style.toLowerCase() !== 'all') {
        query.style = style.trim();
      }

      if (q && q.trim() !== '') {
        const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        query.$or = [
          { 'name.en': regex },
          { 'name.ml': regex },
          { 'description.en': regex },
          { 'description.ml': regex }
        ];
      }

      let sortObj = { featured: -1, createdAt: -1 };
      if (sort === 'price-asc' || sort === 'lo') sortObj = { price: 1 };
      else if (sort === 'price-desc' || sort === 'hi') sortObj = { price: -1 };
      else if (sort === 'newest') sortObj = { createdAt: -1 };
      else if (sort === 'featured') sortObj = { featured: -1, createdAt: -1 };
      else if (sort === 'az') sortObj = { 'name.en': 1 };

      [products, totalCount, styles] = await Promise.all([
        Product.find(query).sort(sortObj).skip(skip).limit(limit),
        Product.countDocuments(query),
        Product.distinct('style', { active: true })
      ]);
    }

    if (!products || !products.length) {
      let all = getSampleProducts();
      styles = Array.from(new Set(all.map(p => p.style)));
      if (style && style.trim() !== '' && style.toLowerCase() !== 'all') {
        all = all.filter(p => p.style.toLowerCase() === style.trim().toLowerCase());
      }
      totalCount = all.length;
      products = all.slice(skip, skip + limit);
    }

    const totalPages = Math.ceil(totalCount / limit) || 1;
    const isAjax = ajax === '1' || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

    if (isAjax) {
      return res.json({
        products: products.map(p => ({
          _id: p._id,
          slug: p.slug,
          name: p.getName(res.locals.lang),
          price: p.price,
          style: p.style,
          tag: p.tag,
          images: typeof p.getOrderedImages === 'function' ? p.getOrderedImages().map(i => i.url) : p.images,
          sizes: p.sizes,
          totalStock: p.totalStock
        })),
        totalCount,
        currentPage: parseInt(page, 10) || 1,
        totalPages,
        hasMore: (parseInt(page, 10) || 1) < totalPages
      });
    }

    res.render('pages/shop', {
      title: res.locals.t('shop.title'),
      metaDesc: res.locals.t('shop.lead'),
      products,
      styles,
      currentStyle: style || '',
      searchQuery: q || '',
      currentSort: sort || '',
      currentPage: parseInt(page, 10) || 1,
      totalPages,
      totalCount
    });
  } catch (err) {
    next(err);
  }
};

// Product Detail Page (PDP)
exports.getProductDetail = async (req, res, next) => {
  try {
    const { slug } = req.params;
    let product = null;
    let related = [];

    if (mongoose.connection.readyState === 1) {
      product = await Product.findOne({ slug, active: true });
      if (product) {
        related = await Product.find({
          active: true,
          _id: { $ne: product._id }
        })
          .sort({ createdAt: -1 })
          .limit(4);
      }
    }

    if (!product) {
      const all = getSampleProducts();
      product = all.find(p => p.slug === slug);
      if (product) {
        related = all.filter(p => p.slug !== slug).slice(0, 4);
      }
    }

    if (!product) {
      return res.status(404).render('pages/404', {
        title: 'Product Not Found',
        metaDesc: 'This nighty design is no longer available or has moved.'
      });
    }

    // Build Product Schema JSON-LD for rich snippet SEO
    const firstImage = typeof product.getMainImage === 'function'
      ? product.getMainImage()
      : (product.images && product.images.length > 0 ? (product.images[0].url || product.images[0]) : '/img/brand/logo-mark-256.png');
    const absImage = firstImage.startsWith('http') ? firstImage : `${res.locals.currentUrl.split('/product')[0]}${firstImage}`;
    
    const inStock = product.sizes.some(s => s.stock > 0);
    const lowStock = product.sizes.some(s => s.stock > 0 && s.stock <= 3);
    const availability = !inStock
      ? "https://schema.org/OutOfStock"
      : (lowStock ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock");

    const jsonLd = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": product.getName(res.locals.lang),
      "image": [absImage],
      "description": product.getDescription(res.locals.lang),
      "brand": {
        "@type": "Brand",
        "name": "Nest by Ammakkili"
      },
      "offers": {
        "@type": "Offer",
        "url": res.locals.currentUrl,
        "priceCurrency": "INR",
        "price": product.price,
        "availability": availability,
        "itemCondition": "https://schema.org/NewCondition"
      }
    };

    res.render('pages/product', {
      title: product.getName(res.locals.lang),
      metaDesc: product.getDescription(res.locals.lang).substring(0, 155),
      product,
      related,
      jsonLd,
      ogImage: absImage,
      ogType: 'product'
    });
  } catch (err) {
    next(err);
  }
};

// Size Guide & Bust Calculator
exports.getSizeGuide = (req, res) => {
  res.render('pages/sizes', {
    title: res.locals.t('sizes.title'),
    metaDesc: res.locals.t('sizes.lead')
  });
};

// How to order
exports.getHowToOrder = (req, res) => {
  res.render('pages/how-to-order', {
    title: res.locals.t('sizes.howToOrderTitle'),
    metaDesc: 'Step-by-step guide on how to choose your nighty, verify your bust measurement, and place prepaid orders online.'
  });
};

// Wishlist Page
exports.getWishlist = (req, res) => {
  res.render('pages/wishlist', {
    title: res.locals.t('wishlist.title'),
    metaDesc: res.locals.t('wishlist.lead'),
    bodyClass: 'page-wishlist'
  });
};

// API to resolve items for wishlist page
exports.getWishlistProducts = async (req, res) => {
  try {
    const ids = req.query.ids ? req.query.ids.split(',').filter(Boolean) : [];
    if (!ids.length) {
      return res.json({ products: [] });
    }
    let products = [];
    if (mongoose.connection.readyState === 1) {
      products = await Product.find({ _id: { $in: ids }, active: true });
    }
    if (!products.length) {
      const all = getSampleProducts();
      products = all.filter(p => ids.includes(p._id.toString()) || ids.includes(p.slug));
    }
    res.json({
      products: products.map(p => ({
        id: p._id,
        slug: p.slug,
        name: p.getName(req.cookies.nest_lang || 'en'),
        price: p.price,
        image: typeof p.getMainImage === 'function' ? p.getMainImage() : (p.images && p.images[0] ? (p.images[0].url || p.images[0]) : '/img/brand/logo-mark-256.png'),
        style: p.style,
        tag: p.tag
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch wishlist products' });
  }
};

// About Page
exports.getAbout = (req, res) => {
  res.render('pages/about', {
    title: res.locals.t('about.title'),
    metaDesc: res.locals.t('about.p1')
  });
};

// Contact Page (WhatsApp prefilled message)
exports.getContact = (req, res) => {
  res.render('pages/contact', {
    title: res.locals.t('contact.title'),
    metaDesc: res.locals.t('contact.lead')
  });
};

// Pricing Policy
exports.getPricing = (req, res) => {
  res.render('pages/pricing', {
    title: res.locals.t('pricing.title'),
    metaDesc: res.locals.t('pricing.lead')
  });
};

// Shipping Policy
exports.getShipping = (req, res) => {
  res.render('pages/shipping', {
    title: res.locals.t('shipping.title'),
    metaDesc: res.locals.t('shipping.lead')
  });
};

// Terms and Conditions
exports.getTerms = (req, res) => {
  res.render('pages/terms', {
    title: res.locals.t('terms.title'),
    metaDesc: res.locals.t('terms.lead')
  });
};

// Privacy Policy
exports.getPrivacy = (req, res) => {
  res.render('pages/privacy', {
    title: res.locals.t('privacy.title'),
    metaDesc: res.locals.t('privacy.lead')
  });
};

// Refund & Cancellation Policy
exports.getRefundPolicy = (req, res) => {
  res.render('pages/refund-policy', {
    title: res.locals.t('refundPolicy.title'),
    metaDesc: res.locals.t('refundPolicy.lead')
  });
};

// Grievance Redressal
exports.getGrievance = (req, res) => {
  res.render('pages/grievance', {
    title: res.locals.t('grievance.title'),
    metaDesc: res.locals.t('grievance.lead')
  });
};

// Shop Policies (Redirect / Alias to Refund Policy or Hub)
exports.getPolicies = (req, res) => {
  res.render('pages/policies', {
    title: res.locals.t('policies.title'),
    metaDesc: 'Nest by Ammakkili shop policies regarding prepaid orders, no returns or exchanges, and flat ₹60 shipping.'
  });
};

// FAQ
exports.getFaq = (req, res) => {
  res.render('pages/faq', {
    title: res.locals.t('faq.title'),
    metaDesc: res.locals.t('faq.lead')
  });
};

// Track Order Page
exports.getTrackOrder = (req, res) => {
  res.render('pages/track', {
    title: res.locals.t('tracking.title'),
    metaDesc: res.locals.t('tracking.lead'),
    order: null,
    searched: false
  });
};

// Track Order Post
exports.postTrackOrder = async (req, res, next) => {
  try {
    const { orderId, phone } = req.body;
    let order = null;

    if (orderId && phone) {
      const cleanPhone = phone.trim().replace(/\D/g, '').slice(-10);
      const cleanId = orderId.trim().toUpperCase();

      order = await Order.findOne({
        orderId: cleanId,
        'customer.phone': { $regex: new RegExp(cleanPhone + '$') }
      });
    }

    if (!order && orderId) {
      trackOrderFailure(orderId);
    } else if (order && orderId) {
      resetOrderTrackingFailures(orderId);
    }

    res.render('pages/track', {
      title: res.locals.t('tracking.title'),
      metaDesc: res.locals.t('tracking.lead'),
      order,
      orderId: orderId || '',
      phone: phone || '',
      searched: true
    });
  } catch (err) {
    next(err);
  }
};

