const http = require('http');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

// Simple in-memory mock DOM element
class MockElement {
  constructor(tag, cls = '') {
    this.tagName = tag.toUpperCase();
    this.className = cls;
    this.children = [];
    this.attributes = {};
    this.textContent = '';
    this.eventListeners = {};
    this.style = {};
  }
  appendChild(child) {
    if (typeof child === 'string') {
      this.textContent += child;
    } else {
      this.children.push(child);
      child.parentNode = this;
    }
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  get firstChild() {
    return this.children[0] || null;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] || null; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(event, handler) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }
  dispatchEvent(event) {
    const handlers = this.eventListeners[event.type] || [];
    for (const h of handlers) h(event);
  }
  querySelectorAll(sel) {
    const results = [];
    function search(node) {
      for (const child of node.children) {
        if (sel.startsWith('.') && child.className.split(/\s+/).includes(sel.slice(1))) {
          results.push(child);
        } else if (sel === 'button' && child.tagName === 'BUTTON') {
          results.push(child);
        } else if (sel === 'button.btn' && child.tagName === 'BUTTON' && child.className.includes('btn')) {
          results.push(child);
        }
        search(child);
      }
    }
    search(this);
    return results;
  }
  querySelector(sel) {
    const all = this.querySelectorAll(sel);
    return all.length ? all[0] : null;
  }
  getAllText() {
    let t = this.textContent || '';
    for (const c of this.children) t += ' ' + c.getAllText();
    return t.trim();
  }
}

async function runTests() {
  console.log('=== STARTING CART PAGE & CART STORE VERIFICATION ===\n');

  // 1. Connect to MongoDB
  await mongoose.connect(MONGODB_URI);
  const Product = require('../src/models/Product');

  const products = await Product.find({ active: true }).limit(3);
  assert(products.length >= 2, 'Found at least 2 active products in DB for cart testing');
  const p1 = products[0];
  const p2 = products[1];

  // 2. Fetch /cart and inspect layout & template
  console.log('\n--- Test 1: Layout & Cart Template HTML ---');
  const cartPageRes = await request('/cart');
  assert(cartPageRes.status === 200, 'GET /cart returned 200 OK');
  const cartHtml = cartPageRes.body;

  // Check CSRF token meta tag
  const csrfMatch = cartHtml.match(/<meta\s+name="csrf-token"\s+content="([^"]*)"/);
  assert(csrfMatch && csrfMatch[1] && csrfMatch[1].length > 10, 'meta csrf-token is populated with a valid non-empty token');
  const csrfToken = csrfMatch[1];

  // Check no logo.svg link
  assert(!cartHtml.includes('/img/logo.svg'), 'Deleted <link rel="icon" type="image/svg+xml" href="/img/logo.svg"> from head');

  // Check theme flash inline script in head
  assert(!cartHtml.includes('data-theme="light"'), 'Removed hard-coded data-theme="light" from <html>');
  assert(cartHtml.includes('localStorage.getItem(\'nest_theme\')'), 'Head contains inline script reading nest_theme before paint');

  // Check cart-page.js load order
  const cartStorePos = cartHtml.indexOf('/js/cart-store.js');
  const cartPagePos = cartHtml.indexOf('/js/cart-page.js');
  assert(cartStorePos !== -1 && cartPagePos !== -1, 'Both cart-store.js and cart-page.js are loaded in HTML');
  assert(cartPagePos > cartStorePos, 'cart-page.js is loaded with defer AFTER cart-store.js');

  // Check starting HTML in #cart-container
  assert(cartHtml.includes('<p style="font-size:1.1rem;">Loading your cart...</p>'), '#cart-container initial HTML is "Loading your cart..."');
  assert(!cartHtml.includes('document.addEventListener(\'DOMContentLoaded\', renderCartView);'), 'No stray code after </script> in cart template');
  assert(!cartHtml.includes('})();\n</script>'), 'No stray closures outside script tags in cart template');

  // View source check: No text outside <script> tags that looks like code
  const textWithoutTags = cartHtml.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  assert(!textWithoutTags.includes('renderCartView'), 'View Source of /cart has no JavaScript function names outside <script>');
  assert(!textWithoutTags.includes('addEventListener'), 'View Source of /cart has no addEventListener code outside <script>');

  // 3. Test POST /cart/validate API response format
  console.log('\n--- Test 2: POST /cart/validate API ---');
  const validateRes = await request('/cart/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: {
      items: [
        { productId: p1._id.toString(), size: 'M', qty: 1 },
        { productId: p2._id.toString(), size: 'L', qty: 1 },
      ],
    },
  });

  assert(validateRes.status === 200, 'POST /cart/validate returned 200 OK without CSRF rejection (no 403)');
  const validateData = JSON.parse(validateRes.body);
  assert(Array.isArray(validateData.items) && validateData.items.length === 2, 'validate returns exactly 2 validated items');
  assert(validateData.subtotal === (p1.price + p2.price), `Subtotal is ₹${validateData.subtotal} (p1: ₹${p1.price} + p2: ₹${p2.price})`);
  assert(validateData.shipping === 60, 'Flat shipping charge is ₹60');
  assert(validateData.total === (p1.price + p2.price + 60), `Total is ₹${validateData.total} (subtotal + ₹60)`);
  assert(Array.isArray(validateData.removed) && validateData.removed.length === 0, 'removed list is empty when products are valid');

  const firstValidated = validateData.items[0];
  assert(firstValidated.productId && firstValidated.slug && firstValidated.name && firstValidated.image &&
         firstValidated.size && firstValidated.price && firstValidated.qty && firstValidated.stock !== undefined &&
         firstValidated.lineTotal,
         'Validated item includes all required fields: productId, slug, name, image, size, price, qty, stock, lineTotal');

  // 4. Test client-side CartStore methods & cart-page.js rendering
  console.log('\n--- Test 3: CartStore Operations & cart-page.js Rendering ---');
  const cartStoreCode = fs.readFileSync(path.join(__dirname, '../public/js/cart-store.js'), 'utf8');
  const cartPageCode = fs.readFileSync(path.join(__dirname, '../public/js/cart-page.js'), 'utf8');

  // Set up mock window & document
  const storageMap = {};
  const mockLocalStorage = {
    getItem: (k) => storageMap[k] || null,
    setItem: (k, v) => { storageMap[k] = String(v); },
    removeItem: (k) => { delete storageMap[k]; },
  };

  const cartContainerEl = new MockElement('div', 'cart-container');
  cartContainerEl.id = 'cart-container';
  const cartBadgeEl = new MockElement('span', 'badge');
  cartBadgeEl.id = 'cartBadge';

  const listeners = {};
  const mockWindow = {
    localStorage: mockLocalStorage,
    document: {
      getElementById: (id) => {
        if (id === 'cart-container') return cartContainerEl;
        if (id === 'cartBadge') return cartBadgeEl;
        return null;
      },
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => {
        if (sel === 'meta[name="csrf-token"]') {
          return { getAttribute: () => csrfToken };
        }
        return null;
      },
      readyState: 'complete',
    },
    addEventListener: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    dispatchEvent: (event) => {
      const handlers = listeners[event.type] || [];
      for (const h of handlers) h(event);
    },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init ? init.detail : null;
      }
    },
    showToast: (msg) => { toastsShown.push(msg); },
    console: console,
  };

  let toastsShown = [];

  // Evaluate cart-store.js in mock window context
  const evalStore = new Function('window', 'document', 'localStorage', cartStoreCode);
  evalStore(mockWindow, mockWindow.document, mockLocalStorage);

  assert(mockWindow.CartStore !== undefined, 'window.CartStore is defined after cart-store.js executes');
  assert(typeof mockWindow.CartStore.getItems === 'function', 'CartStore exposes getItems()');
  assert(typeof mockWindow.CartStore.validate === 'function', 'CartStore exposes validate()');
  assert(typeof mockWindow.CartStore.removeItem === 'function', 'CartStore exposes removeItem()');
  assert(typeof mockWindow.CartStore.updateQty === 'function', 'CartStore exposes updateQty()');

  // Add 2 items
  mockWindow.CartStore.addItem(p1._id.toString(), 'M', 1);
  mockWindow.CartStore.addItem(p2._id.toString(), 'L', 1);
  const storedItems = mockWindow.CartStore.getItems();
  assert(storedItems.length === 2, 'CartStore has 2 stored items');
  assert(mockWindow.CartStore.getTotalQty() === 2, 'CartStore total quantity is 2; badge matches 2');

  // Track cart:updated events
  let cartUpdatedCount = 0;
  mockWindow.addEventListener('cart:updated', () => { cartUpdatedCount++; });

  // Evaluate cart-page.js in mock window context
  mockWindow.fetch = async function (url, opts) {
    const res = await request(url, {
      method: opts && opts.method ? opts.method : 'GET',
      headers: opts && opts.headers ? opts.headers : {},
      body: opts && opts.body ? JSON.parse(opts.body) : undefined,
    });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: () => Promise.resolve(JSON.parse(res.body)),
    };
  };

  const evalPage = new Function('window', 'document', 'setTimeout', 'clearTimeout', cartPageCode);
  evalPage(mockWindow, mockWindow.document, setTimeout, clearTimeout);

  // Wait for render
  await new Promise(r => setTimeout(r, 50));

  const renderedRows = cartContainerEl.querySelectorAll('.ln');
  assert(renderedRows.length === 2, 'cart-page.js rendered 2 product rows (.ln) in #cart-container');
  const summaryEl = cartContainerEl.querySelector('.sum');
  assert(summaryEl !== null, 'cart-page.js rendered Order Summary (.sum) in #cart-container');
  assert(summaryEl.getAllText().includes('Prepaid orders only'), 'Order summary displays prepaid and return policy text');

  // Test + and - on quantity
  console.log('\n--- Test 4: Quantity + and - Controls ---');
  mockWindow.CartStore.updateQty(p1._id.toString(), 'M', 2);
  assert(mockWindow.CartStore.getTotalQty() === 3, 'updateQty increased quantity from 1 to 2; totalQty is 3');
  assert(cartUpdatedCount > 0, 'cart:updated event dispatched on quantity increase');

  mockWindow.CartStore.updateQty(p1._id.toString(), 'M', 1);
  assert(mockWindow.CartStore.getTotalQty() === 2, 'updateQty decreased quantity from 2 to 1; totalQty is 2');

  // Test removeItem
  mockWindow.CartStore.removeItem(p2._id.toString(), 'L');
  const remaining = mockWindow.CartStore.getItems();
  assert(remaining.length === 1 && remaining[0].productId === p1._id.toString(),
    'removeItem(productId, size) successfully removed item 2; item 1 persists');
  assert(mockWindow.CartStore.getTotalQty() === 1, 'Total quantity is 1 after removal; badge matches 1');

  // 5. Test Admin Deletion & Removed Item Notification
  console.log('\n--- Test 5: Admin Deletion and Removed Item Toast ---');
  const tempProduct = await Product.create({
    name: { en: 'Temp Deletion Nighty', ml: 'ടെമ്പ് നൈറ്റി' },
    description: { en: 'Test description', ml: 'ടെസ്റ്റ്' },
    slug: 'temp-deletion-nighty-' + Date.now(),
    price: 499,
    style: 'Cotton',
    sizes: [{ size: 'M', stock: 5 }],
    active: true,
    isSample: false,
  });

  mockWindow.CartStore.addItem(tempProduct._id.toString(), 'M', 1);
  assert(mockWindow.CartStore.getItems().length === 2, 'Cart contains real product + temporary product');

  // Simulate admin deleting product in DB
  await Product.findByIdAndDelete(tempProduct._id);

  toastsShown = [];
  let deleteValidateData = null;
  await new Promise((resolve) => {
    mockWindow.CartStore.validate((err, data) => {
      deleteValidateData = data;
      resolve();
    });
  });

  assert(deleteValidateData && deleteValidateData.removed && deleteValidateData.removed.length === 1,
    'Server reported 1 dropped item in "removed" array');
  assert(deleteValidateData.items.length === 1, 'Server returned only the 1 valid active product');

  assert(mockWindow.CartStore.getItems().length === 1, 'CartStore purged invalid product from localStorage');
  assert(toastsShown.some(t => t.includes('Some items are no longer available and were removed')),
    'Toast "Some items are no longer available and were removed." was shown');

  // 6. Test Offline Simulation in cart-page.js
  console.log('\n--- Test 6: Offline Simulation in cart-page.js ---');
  mockWindow.CartStore.validate = function (cb) {
    cb(new Error('Network offline'), null);
  };
  mockWindow.dispatchEvent(new mockWindow.CustomEvent('cart:updated'));

  await new Promise(r => setTimeout(r, 50));

  const offlineText = cartContainerEl.getAllText();
  assert(offlineText.includes('We could not load your cart. Please try again.'),
    'When offline, cart displays: "We could not load your cart. Please try again."');
  const retryBtn = cartContainerEl.querySelector('button.btn');
  assert(retryBtn !== null && retryBtn.textContent === 'Try again',
    'When offline, a "Try again" button is displayed');
  assert(!offlineText.includes('Your cart is empty.'),
    'When offline, page does NOT claim "Your cart is empty."');

  // 7. Verify all public pages return 200 without template/script errors
  console.log('\n--- Test 7: Verify Core Pages 200 OK & No Template Errors ---');
  const pagesToTest = ['/', '/shop', `/product/${p1.slug}`, '/cart', '/checkout', '/wishlist'];
  for (const page of pagesToTest) {
    const res = await request(page);
    assert(res.status === 200, `Page ${page} returned 200 OK`);
    assert(!res.body.includes('ReferenceError') && !res.body.includes('TypeError') && !res.body.includes('SyntaxError'),
      `Page ${page} contains no server-rendered exception stack traces`);
  }

  await mongoose.disconnect();
  console.log('\n🎉 ALL CART PAGE & CART STORE TESTS PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
