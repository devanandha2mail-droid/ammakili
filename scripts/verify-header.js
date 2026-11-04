const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');

async function verify() {
  const homeRes = await fetch('http://localhost:3000/');
  const homeHtml = await homeRes.text();

  console.log('--- Checking HTML Elements ---');
  console.log('site-header present:', homeHtml.includes('class="site-header" id="siteHeader"'));
  console.log('logo 52x52 present:', homeHtml.includes('width="52" height="52"'));
  console.log('Nest by Ammakkili lockup:', homeHtml.includes('<b>Nest</b><small>by Ammakkili</small>'));
  console.log('main-nav present:', homeHtml.includes('class="main-nav" aria-label="Main"'));
  console.log('acctMenu present:', homeHtml.includes('id="acctMenu" hidden'));
  console.log('wishBadge present:', homeHtml.includes('id="wishBadge" data-zero="true"'));
  console.log('cartBadge present:', homeHtml.includes('id="cartBadge" data-zero="true"'));
  console.log('drawer present:', homeHtml.includes('id="drawer" hidden'));
  console.log('header.css loaded after glass.css:', homeHtml.indexOf('/css/glass.css') < homeHtml.indexOf('/css/header.css'));
  console.log('header.js loaded with defer:', homeHtml.includes('src="/js/header.js" defer'));
  console.log('Cormorant Garamond font loaded:', homeHtml.includes('Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500'));
  console.log('Jost font loaded:', homeHtml.includes('family=Jost:wght@400;500'));

  const shopRes = await fetch('http://localhost:3000/shop');
  const shopHtml = await shopRes.text();
  console.log('shop aria-current="page":', shopHtml.includes('href="/shop" aria-current="page"'));

  const sizeRes = await fetch('http://localhost:3000/size-guide');
  const sizeHtml = await sizeRes.text();
  console.log('size-guide status:', sizeRes.status, 'aria-current="page":', sizeHtml.includes('href="/size-guide" aria-current="page"'));

  const aboutRes = await fetch('http://localhost:3000/about');
  const aboutHtml = await aboutRes.text();
  console.log('about status:', aboutRes.status, 'aria-current="page":', aboutHtml.includes('href="/about" aria-current="page"'));

  const contactRes = await fetch('http://localhost:3000/contact');
  const contactHtml = await contactRes.text();
  console.log('contact status:', contactRes.status, 'aria-current="page":', contactHtml.includes('href="/contact" aria-current="page"'));

  const trackRes = await fetch('http://localhost:3000/track-order');
  console.log('track-order status:', trackRes.status);

  // Check language switch
  const mlRes = await fetch('http://localhost:3000/lang/ml', { redirect: 'manual' });
  const cookie = mlRes.headers.get('set-cookie');
  console.log('lang/ml set-cookie:', cookie);
  if (cookie) {
    const mlPageRes = await fetch('http://localhost:3000/', { headers: { Cookie: cookie.split(';')[0] } });
    const mlHtml = await mlPageRes.text();
    console.log('ML page shows EN tool:', mlHtml.includes('href="/lang/en" lang="en" hreflang="en">EN</a>'));
  }

  // Check logged-in customer in header
  const loginRes = await fetch('http://localhost:3000/auth/google/test-login?email=athira@example.com&name=Athira+Menon', { redirect: 'manual' });
  const authCookie = loginRes.headers.get('set-cookie');
  if (authCookie) {
    const authHomeRes = await fetch('http://localhost:3000/', { headers: { Cookie: authCookie.split(';')[0] } });
    const authHtml = await authHomeRes.text();
    console.log('Customer name in account dropdown:', authHtml.includes('Athira Menon'));
    console.log('My account link in dropdown:', authHtml.includes('href="/account">My account</a>'));
    console.log('Orders link in dropdown:', authHtml.includes('href="/orders">Orders</a>'));
    console.log('Sign out link in dropdown:', authHtml.includes('href="/logout">Sign out</a>'));
  }
}

verify().catch(console.error);
