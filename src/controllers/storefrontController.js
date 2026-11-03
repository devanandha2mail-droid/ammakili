const Product = require('../models/Product');
const Order = require('../models/Order');

// Home Page
exports.getHome = async (req, res, next) => {
  try {
    const newArrivals = await Product.find({ active: true })
      .sort({ createdAt: -1 })
      .limit(6);

    res.render('pages/home', {
      title: res.locals.t('site.tagline'),
      metaDesc: res.locals.t('site.description'),
      products: newArrivals
    });
  } catch (err) {
    next(err);
  }
};

// Shop Page with Search, Category Filter, Sort, and Pagination
exports.getShop = async (req, res, next) => {
  try {
    const { q, style, sort, page = 1 } = req.query;
    const limit = 12;
    const skip = (parseInt(page, 10) - 1) * limit;

    const query = { active: true };

    if (style && style.trim() !== '') {
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
    if (sort === 'lo') sortObj = { price: 1 };
    if (sort === 'hi') sortObj = { price: -1 };
    if (sort === 'az') sortObj = { 'name.en': 1 };

    const [products, totalCount, styles] = await Promise.all([
      Product.find(query).sort(sortObj).skip(skip).limit(limit),
      Product.countDocuments(query),
      Product.distinct('style', { active: true })
    ]);

    const totalPages = Math.ceil(totalCount / limit) || 1;

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
    const product = await Product.findOne({ slug, active: true });

    if (!product) {
      return res.status(404).render('pages/404', {
        title: 'Product Not Found',
        metaDesc: 'This nighty design is no longer available or has moved.'
      });
    }

    // Related products (same style or other featured)
    const related = await Product.find({
      active: true,
      _id: { $ne: product._id }
    })
      .sort({ createdAt: -1 })
      .limit(3);

    // Build Product Schema JSON-LD for rich snippet SEO
    const firstImage = product.images && product.images.length > 0 ? product.images[0] : '/img/logo.svg';
    const absImage = firstImage.startsWith('http') ? firstImage : `${res.locals.currentUrl.split('/product')[0]}${firstImage}`;
    
    const inStock = product.sizes.some(s => s.stock > 0);
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
        "availability": inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
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
    const products = await Product.find({ _id: { $in: ids }, active: true });
    res.json({
      products: products.map(p => ({
        id: p._id,
        slug: p.slug,
        name: p.getName(req.cookies.nest_lang || 'en'),
        price: p.price,
        image: p.images && p.images[0] ? p.images[0] : '/img/logo.svg',
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

// Shop Policies
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
