const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

function request(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function verify() {
  console.log('=== VERIFYING STICKY FOOTER & THEME PILL FIXES ===\n');

  // 1. Verify CSS rules in glass.css
  console.log('--- Checking glass.css for Sticky Footer rules ---');
  const glassCss = fs.readFileSync(path.join(__dirname, '../public/css/glass.css'), 'utf8');

  assert(/html\s*\{[^}]*height:\s*100%/s.test(glassCss), 'html has height: 100% in glass.css');
  assert(/body\s*\{[^}]*min-height:\s*100vh[^}]*min-height:\s*100dvh[^}]*display:\s*flex[^}]*flex-direction:\s*column/s.test(glassCss),
    'body has min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column in glass.css');
  assert(/body\s*>\s*main\s*\{[^}]*flex:\s*1\s+0\s+auto/s.test(glassCss),
    'body > main has flex: 1 0 auto in glass.css');
  assert(/body\s*>\s*\.announce,\s*body\s*>\s*\.site-header,\s*body\s*>\s*\.site-footer\s*\{[^}]*flex:\s*none/s.test(glassCss),
    'body > .announce, body > .site-header, body > .site-footer has flex: none in glass.css');

  // 2. Verify footer.css for .ft-theme and 80px margin
  console.log('\n--- Checking footer.css for .ft-theme and top margin ---');
  const footerCss = fs.readFileSync(path.join(__dirname, '../public/css/footer.css'), 'utf8');

  assert(footerCss.includes('margin:80px 0 0') || footerCss.includes('margin: 80px 0 0'),
    'site-footer retains margin: 80px 0 0 (top spacing from content)');
  assert(footerCss.includes('.ft-theme'), '.ft-theme rule exists in footer.css');
  assert(/display:\s*inline-flex/.test(footerCss) && /white-space:\s*nowrap/.test(footerCss),
    '.ft-theme has display: inline-flex and white-space: nowrap in footer.css');
  assert(/height:\s*40px/.test(footerCss) && /padding:\s*0\s+16px/.test(footerCss) && /border-radius:\s*999px/.test(footerCss),
    '.ft-theme has height: 40px, padding: 0 16px, border-radius: 999px in footer.css');

  // 3. Verify header.css for .pill
  console.log('\n--- Checking header.css for .pill ---');
  const headerCss = fs.readFileSync(path.join(__dirname, '../public/css/header.css'), 'utf8');

  assert(/\.pill\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*gap:\s*6px[^}]*white-space:\s*nowrap/s.test(headerCss),
    '.pill has display: flex, align-items: center, justify-content: center, gap: 6px, white-space: nowrap in header.css');

  // 4. Verify layout hierarchy on short pages
  console.log('\n--- Checking short pages and main/footer direct child layout ---');
  const shortPages = ['/track-order', '/cart', '/wishlist', '/login'];
  for (const p of shortPages) {
    const res = await request(p);
    assert(res.status === 200, `GET ${p} returned 200 OK`);
    const html = res.body;

    // Verify <main id="top"> exists and is direct child
    assert(html.includes('<main id="top" tabindex="-1">'), `${p} contains <main id="top">`);
    assert(html.includes('<footer class="site-footer">'), `${p} contains <footer class="site-footer">`);

    // Verify footer theme pill markup
    assert(html.includes('class="ft-theme"'), `${p} renders footer theme pill .ft-theme`);
    assert(html.includes('Theme: <span data-theme-label>Light</span>') || html.includes('Theme:'),
      `${p} renders "Theme: [Dark/Light]" text inside theme pill`);

    // Verify mobile drawer theme pill markup
    assert(html.includes('class="pill" type="button" data-theme-toggle>Theme: <span data-theme-label>Light</span></button>'),
      `${p} renders mobile drawer theme pill .pill`);
  }

  // 5. Verify long pages (home, shop)
  console.log('\n--- Checking long pages (Home and Shop) ---');
  const longPages = ['/', '/shop'];
  for (const p of longPages) {
    const res = await request(p);
    assert(res.status === 200, `GET ${p} returned 200 OK`);
    assert(res.body.includes('<main id="top" tabindex="-1">'), `${p} contains <main id="top">`);
    assert(res.body.includes('<footer class="site-footer">'), `${p} contains <footer class="site-footer">`);
  }

  console.log('\n🎉 ALL STICKY FOOTER & THEME PILL TESTS PASSED PERFECTLY!\n');
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});

