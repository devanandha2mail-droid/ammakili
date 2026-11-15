/**
 * Verification Script: Storefront Polish (Hero, Product Cards, Shop Filter, Product Page)
 */
const http = require('http');
const assert = require('assert');

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  console.log('🧪 Starting Storefront Polish verification...\n');

  // 1. Home page check
  console.log('1. Checking Home page (Hero, Trust strip, Product cards)...');
  const homeRes = await request('/');
  assert.strictEqual(homeRes.status, 200, 'Home page must return 200');
  const homeHtml = homeRes.body;

  // Verify Hero headline
  assert(homeHtml.includes('Nightwear, <em>softly</em> considered') || homeHtml.includes('softly</em> considered'),
    'Hero must contain "Nightwear, <em>softly</em> considered"');
  assert(homeHtml.includes('/shop') && homeHtml.includes('Explore the collection'),
    'Hero must contain primary CTA "Explore the collection"');
  assert(homeHtml.includes('/sizes') && homeHtml.includes('Find your size'),
    'Hero must contain quiet text link "Find your size"');

  // Verify Hero does NOT show logo
  assert(!homeHtml.includes('class="hero-logo"') && !homeHtml.includes('alt="Nest by Ammakkili logo" loading="lazy" width="400"'),
    'Hero arch must NOT show logo');

  // Verify Hero media & fetchpriority
  assert(homeHtml.includes('hero-arch-frame') || homeHtml.includes('hero-slider'),
    'Hero must contain hero-arch-frame or hero-slider');
  assert(homeHtml.includes('fetchpriority="high"'),
    'Hero first image must have fetchpriority="high"');

  // Verify Trust strip with 3 icons
  assert(homeHtml.includes('trust-strip'), 'Trust strip must be present');
  assert(homeHtml.includes('Prepaid and secure'), 'Trust strip must include "Prepaid and secure"');
  assert(homeHtml.includes('Clear size guide'), 'Trust strip must include "Clear size guide"');
  assert(homeHtml.includes('WhatsApp support'), 'Trust strip must include "WhatsApp support"');

  // Verify New Arrivals product cards
  assert(homeHtml.includes('arrivals-scroll'), 'New arrivals section must have arrivals-scroll');
  assert(homeHtml.includes('p-card'), 'Product cards must use .p-card class');
  assert(homeHtml.includes('p-card__media'), 'Product cards must have .p-card__media');
  assert(homeHtml.includes('p-card__heart'), 'Product cards must have .p-card__heart (wishlist)');
  assert(homeHtml.includes('Quick add') || homeHtml.includes('p-card__quick-add'),
    'Product cards must have Quick add');
  console.log('  ✓ Home hero, trust strip, and product cards verified successfully.');

  // 2. Shop page check (HTML & AJAX)
  console.log('2. Checking Shop page (Sticky Filter bar, Chips, Sort, AJAX)...');
  const shopRes = await request('/shop');
  assert.strictEqual(shopRes.status, 200, 'Shop page must return 200');
  const shopHtml = shopRes.body;

  assert(shopHtml.includes('shop-filter-bar'), 'Shop page must have sticky filter bar');
  assert(shopHtml.includes('shop-chip'), 'Shop page must have style chips');
  assert(shopHtml.includes('Cotton') && shopHtml.includes('Satin') && shopHtml.includes('Printed') && shopHtml.includes('Plain'),
    'Shop page must include core styles: Cotton, Satin, Printed, Plain');
  assert(shopHtml.includes('shop-sort-select') || shopHtml.includes('id="shopSortSelect"'),
    'Shop page must have sort dropdown');

  // Test AJAX filter
  const ajaxRes = await request('/shop?style=Cotton&sort=price-asc&ajax=1', {
    headers: { 'Accept': 'application/json' }
  });
  assert.strictEqual(ajaxRes.status, 200, 'Shop AJAX must return 200');
  const ajaxData = JSON.parse(ajaxRes.body);
  assert(Array.isArray(ajaxData.products), 'Shop AJAX must return products array');
  assert(typeof ajaxData.totalCount === 'number', 'Shop AJAX must return totalCount');
  assert(typeof ajaxData.currentPage === 'number', 'Shop AJAX must return currentPage');
  assert(typeof ajaxData.totalPages === 'number', 'Shop AJAX must return totalPages');

  if (ajaxData.products.length > 0) {
    const firstP = ajaxData.products[0];
    assert(firstP.slug && firstP.name && typeof firstP.price === 'number',
      'Shop AJAX product must include slug, name, price');
    assert(firstP.style === 'Cotton', 'Filtered products must match Cotton style');
  }

  // Test AJAX empty state
  const emptyRes = await request('/shop?q=nonexistentproductqueryxyz123&ajax=1', {
    headers: { 'Accept': 'application/json' }
  });
  const emptyData = JSON.parse(emptyRes.body);
  assert.strictEqual(emptyData.products.length, 0, 'Nonexistent query must return 0 products');
  assert.strictEqual(emptyData.totalCount, 0, 'Total count must be 0 for nonexistent query');
  console.log('  ✓ Shop filter bar, chips, and AJAX API verified successfully.');

  // 3. Product Detail Page check
  console.log('3. Checking Product page (Gallery, 2x Zoom, Lightbox, Radiogroup, Drawers, Accordions, Sticky Bar)...');
  // Get first product slug from AJAX
  const testProduct = ajaxData.products.length > 0 ? ajaxData.products[0] : null;
  assert(testProduct, 'Must have at least one test product');

  const pdpRes = await request(`/product/${testProduct.slug}`);
  assert.strictEqual(pdpRes.status, 200, `Product page for ${testProduct.slug} must return 200`);
  const pdpHtml = pdpRes.body;

  // Gallery & Zoom
  assert(pdpHtml.includes('pdp-arch-frame'), 'PDP must have arch frame for main image');
  assert(pdpHtml.includes('pdp-zoom-layer'), 'PDP must have 2x zoom layer');
  assert(pdpHtml.includes('pdp-lightbox'), 'PDP must have full-screen lightbox container');

  // Size Radiogroup
  assert(pdpHtml.includes('role="radiogroup"'), 'PDP must have accessible size selector role="radiogroup"');
  assert(pdpHtml.includes('role="radio"'), 'PDP size pills must have role="radio"');
  assert(pdpHtml.includes('pdpSizeWarning'), 'PDP must have aria-live region for size warning');

  // Quantity & Add to Cart
  assert(pdpHtml.includes('pdp-qty-stepper'), 'PDP must have quantity stepper');
  assert(pdpHtml.includes('id="pdpAddToCartBtn"'), 'PDP must have Add to cart button');

  // Drawers: Size Guide & Mini Cart
  assert(pdpHtml.includes('pdpSizeDrawer'), 'PDP must include Size Guide drawer');
  assert(pdpHtml.includes('pdpMiniCartDrawer'), 'PDP must include Mini Cart drawer');
  assert(pdpHtml.includes('drawer-backdrop'), 'PDP must include drawer backdrop');

  // Accordions
  assert(pdpHtml.includes('pdp-accordions'), 'PDP must include accordions container');
  assert(pdpHtml.includes('Description') || pdpHtml.includes('വിവരണം'), 'PDP must have Description accordion');
  assert(pdpHtml.includes('Shipping and policies') || pdpHtml.includes('ഷിപ്പിംഗും പോളിസികളും'),
    'PDP must have Shipping and policies accordion');

  // Mobile Sticky Bottom Bar
  assert(pdpHtml.includes('mobile-sticky-bar'), 'PDP must have mobile sticky bottom bar');

  // WhatsApp Features
  assert(pdpHtml.includes('pdp-share-wa-btn'), 'PDP must have Share on WhatsApp button');
  assert(pdpHtml.includes('pdpAskWaLink'), 'PDP must have Ask on WhatsApp container');

  // Related Products
  assert(pdpHtml.includes('pdp-related-section'), 'PDP must include related products section');

  // JSON-LD Schema
  assert(pdpHtml.includes('"@type":"Product"') || pdpHtml.includes('"@type": "Product"'),
    'PDP must include Product JSON-LD schema');
  assert(pdpHtml.includes('schema.org/InStock') || pdpHtml.includes('schema.org/LimitedAvailability') || pdpHtml.includes('schema.org/OutOfStock'),
    'PDP JSON-LD must specify schema availability');
  console.log('  ✓ Product Detail Page features verified successfully.');

  // 4. Product Model Methods check
  console.log('4. Checking Product model fabric, care, fit methods...');
  const Product = require('../src/models/Product');
  const dummyProduct = new Product({
    slug: 'dummy-test-nighty',
    name: { en: 'Test Nighty', ml: 'ടെസ്റ്റ് നൈറ്റി' },
    description: { en: 'Soft fabric', ml: 'നല്ല തുണി' },
    style: 'Cotton',
    price: 499,
    fabric: { en: '100% Combed Cotton', ml: '100% കോട്ടൺ' },
    care: { en: 'Machine wash cold', ml: 'തണുത്ത വെള്ളത്തിൽ കഴുകുക' },
    fit: { en: 'Relaxed fit', ml: 'അയഞ്ഞ ഫിറ്റ്' }
  });

  assert.strictEqual(dummyProduct.getFabric('en'), '100% Combed Cotton');
  assert.strictEqual(dummyProduct.getFabric('ml'), '100% കോട്ടൺ');
  assert.strictEqual(dummyProduct.getCare('en'), 'Machine wash cold');
  assert.strictEqual(dummyProduct.getCare('ml'), 'തണുത്ത വെള്ളത്തിൽ കഴുകുക');
  assert.strictEqual(dummyProduct.getFit('en'), 'Relaxed fit');
  assert.strictEqual(dummyProduct.getFit('ml'), 'അയഞ്ഞ ഫിറ്റ്');
  console.log('  ✓ Product model methods verified successfully.');

  console.log('\n🎉 ALL STOREFRONT POLISH VERIFICATION CHECKS PASSED!\n');
}

run().catch(err => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});

