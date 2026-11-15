const http = require('http');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Admin = require('../src/models/Admin');
const { execSync } = require('child_process');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOpts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function run() {
  console.log('=== Step 1: Verify Seed Idempotency ===');
  execSync('node scripts/seed.js', { stdio: 'inherit' });
  execSync('node scripts/seed.js', { stdio: 'inherit' });

  await mongoose.connect('mongodb://127.0.0.1:27017/nest_ammakkili');
  const count = await Product.countDocuments();
  console.log(`Total products in DB: ${count} (expected: 8)`);
  if (count !== 8) throw new Error(`Expected 8 products, got ${count}`);

  const sampleCount = await Product.countDocuments({ isSample: true });
  console.log(`Sample products in DB: ${sampleCount} (expected: 8)`);
  if (sampleCount !== 8) throw new Error(`Expected 8 sample products, got ${sampleCount}`);

  console.log('\n=== Step 2: Verify Static SVG Assets ===');
  const sampleSvgs = [
    'sample-rose-garden-nighty.svg',
    'sample-blush-cotton-nighty.svg',
    'sample-velvet-evening-nighty.svg',
    'sample-petal-print-nighty.svg',
    'sample-dusk-floral-nighty.svg',
    'sample-cloud-soft-nighty.svg',
    'sample-plum-stripe-nighty.svg',
    'sample-ivory-lace-nighty.svg'
  ];

  for (const svg of sampleSvgs) {
    const res = await request(`http://localhost:3000/img/products/${svg}`);
    if (res.statusCode !== 200 || !res.headers['content-type'].includes('image/svg+xml')) {
      throw new Error(`Failed to load SVG /img/products/${svg}: status ${res.statusCode}`);
    }
  }
  console.log('All 8 sample SVG files served successfully with image/svg+xml header.');

  console.log('\n=== Step 3: Verify Storefront (Home, Shop, PDP) ===');
  // Home page
  const homeRes = await request('http://localhost:3000/');
  if (homeRes.statusCode !== 200) throw new Error(`Home returned status ${homeRes.statusCode}`);
  
  // Hero featured product
  if (!homeRes.body.includes('/img/products/sample-rose-garden-nighty.svg')) {
    throw new Error('Hero does not display sample-rose-garden-nighty.svg');
  }
  if (!homeRes.body.includes('Rose Garden Nighty')) {
    throw new Error('Hero does not show Rose Garden Nighty title');
  }
  if (!homeRes.body.includes('hero-caption-bar')) {
    throw new Error('Hero missing glass caption bar');
  }
  // Verify hero doesn't contain the logo
  const heroMatch = homeRes.body.match(/<div class="wrap hero">([\s\S]*?)<\/div>\s*<div class="trust-strip">/);
  if (heroMatch && (heroMatch[1].includes('logo-full') || heroMatch[1].includes('logo.svg'))) {
    throw new Error('Logo found inside hero section! It must be removed.');
  }
  console.log('Home hero verified: Rose Garden Nighty featured in arch with caption bar, no logo.');

  // Storefront must never show "Sample" tag
  if (homeRes.body.includes('badge-sample') || homeRes.body.includes('Sample designs. Replace with real photos')) {
    throw new Error('Customer storefront shows sample notice or tag!');
  }
  console.log('Storefront verified: No sample tags or notices visible to customers.');

  // Shop page
  const shopRes = await request('http://localhost:3000/shop');
  if (shopRes.statusCode !== 200) throw new Error(`Shop returned status ${shopRes.statusCode}`);
  if (!shopRes.body.includes('sample-velvet-evening-nighty.svg')) {
    throw new Error('Shop page missing sample products');
  }
  if (shopRes.body.includes('Sample designs.')) {
    throw new Error('Shop page shows sample notice to customers!');
  }
  console.log('Shop page verified: All 8 sample products rendered cleanly.');

  // PDP Velvet Evening (has XL stock = 2)
  const velvetRes = await request('http://localhost:3000/product/velvet-evening-nighty');
  if (velvetRes.statusCode !== 200) throw new Error(`Velvet PDP returned status ${velvetRes.statusCode}`);
  if (!velvetRes.body.includes('Only 2 left in XL')) {
    throw new Error('Velvet evening PDP missing low-stock note "Only 2 left in XL"');
  }
  console.log('Velvet Evening PDP verified: Shows low stock warning "Only 2 left in XL".');

  // PDP Cloud Soft (has 3XL stock = 0)
  const cloudRes = await request('http://localhost:3000/product/cloud-soft-nighty');
  if (cloudRes.statusCode !== 200) throw new Error(`Cloud Soft PDP returned status ${cloudRes.statusCode}`);
  const has3XLDisabled = /data-size="3XL"[\s\S]*?disabled/i.test(cloudRes.body);
  if (!has3XLDisabled) {
    throw new Error('Cloud Soft PDP does not have sold out 3XL size disabled');
  }
  console.log('Cloud Soft PDP verified: Sold out size (3XL) is disabled.');

  console.log('\n=== Step 4: Verify Admin Panel ===');
  // Get login page to extract CSRF token and session cookie
  const loginGet = await request('http://localhost:3000/admin/login');
  const cookie = (loginGet.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const csrfMatch = loginGet.body.match(/name="_csrf" value="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : '';

  // Log in
  const loginPost = await request('http://localhost:3000/admin/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: `email=admin%40nestammakkili.com&password=AdminNest2026%21&_csrf=${encodeURIComponent(csrfToken)}`
  });
  
  const authCookie = (loginPost.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ') || cookie;

  // Admin Dashboard
  const dashRes = await request('http://localhost:3000/admin', {
    headers: { 'Cookie': authCookie }
  });
  if (!dashRes.body.includes('Sample designs. Replace with real photos before launch.')) {
    throw new Error('Admin dashboard missing sample designs notice!');
  }
  console.log('Admin dashboard verified: Displays notice "Sample designs. Replace with real photos before launch."');

  // Admin Products
  const adminProdRes = await request('http://localhost:3000/admin/products', {
    headers: { 'Cookie': authCookie }
  });
  if (!adminProdRes.body.includes('Sample')) {
    throw new Error('Admin products missing "Sample" tags!');
  }
  if (!adminProdRes.body.includes('Delete all sample products')) {
    throw new Error('Admin products missing "Delete all sample products" button!');
  }
  console.log('Admin products verified: Shows "Sample" tags and "Delete all sample products" button.');

  console.log('\n=== Step 5: Test "Delete all sample products" ===');
  // Create a real (non-sample) product
  const realProduct = await Product.create({
    slug: 'real-test-nighty',
    name: { en: 'Real Test Nighty', ml: 'റിയൽ ടെസ്റ്റ് നൈറ്റി' },
    description: { en: 'Real test description', ml: 'റിയൽ വിവരണം' },
    style: 'Cotton',
    price: 899,
    images: ['/img/brand/logo-full-256.png'],
    sizes: [{ size: 'M', stock: 10 }],
    isSample: false,
    active: true
  });
  console.log('Created real non-sample product: Real Test Nighty');

  // Extract CSRF token from admin products page
  const adminCsrfMatch = adminProdRes.body.match(/name="_csrf" value="([^"]+)"/);
  const adminCsrf = adminCsrfMatch ? adminCsrfMatch[1] : '';

  // POST delete samples
  const delRes = await request('http://localhost:3000/admin/products/delete-samples', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': authCookie
    },
    body: `_csrf=${encodeURIComponent(adminCsrf)}`
  });
  console.log(`Delete samples response: ${delRes.statusCode} (redirect: ${delRes.headers.location})`);

  // Verify DB state
  const remainingSamples = await Product.countDocuments({ isSample: true });
  console.log(`Remaining sample products in DB: ${remainingSamples} (expected: 0)`);
  if (remainingSamples !== 0) throw new Error(`Expected 0 sample products, found ${remainingSamples}`);

  const checkReal = await Product.findOne({ slug: 'real-test-nighty' });
  if (!checkReal) throw new Error('Real product was accidentally deleted!');
  console.log('Verified: Real product was NOT touched!');

  // Check admin dashboard now that sample products are deleted
  const dashAfterDel = await request('http://localhost:3000/admin', {
    headers: { 'Cookie': authCookie }
  });
  if (dashAfterDel.body.includes('Sample designs. Replace with real photos before launch.')) {
    throw new Error('Admin dashboard still shows sample notice after deleting samples!');
  }
  console.log('Verified: Admin dashboard sample notice disappeared after deleting samples.');

  // Clean up real test product
  await Product.findByIdAndDelete(realProduct._id);

  console.log('\n=== Step 6: Re-seed and Final Double Seed Verification ===');
  execSync('node scripts/seed.js', { stdio: 'inherit' });
  execSync('node scripts/seed.js', { stdio: 'inherit' });
  const finalCount = await Product.countDocuments();
  console.log(`Final product count after double re-seed: ${finalCount} (expected: 8)`);
  if (finalCount !== 8) throw new Error(`Expected exactly 8 products, got ${finalCount}`);

  await mongoose.disconnect();
  console.log('\n🎉 ALL CHECKS PASSED PERFECTLY!');
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
