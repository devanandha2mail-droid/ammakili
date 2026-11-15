async function verifyFooter() {
  const res = await fetch('http://localhost:3000/');
  const html = await res.text();

  console.log('--- Checking Compact Footer Elements ---');
  console.log('site-footer present:', html.includes('class="site-footer"'));
  console.log('logo 56x56 present:', html.includes('width="56"') && html.includes('height="56"'));
  console.log('logo srcset present:', html.includes('srcset="/img/brand/logo-full-128.png 1x, /img/brand/logo-full-256.png 2x"'));
  console.log('ft-name present:', html.includes('class="ft-name"'));
  console.log('Nest by Ammakkili lockup:', html.includes('<b>Nest</b><small>by Ammakkili</small>'));
  
  const footerHtml = html.substring(html.indexOf('<footer'), html.indexOf('</footer>') + 9);
  console.log('ft-links present:', footerHtml.includes('class="ft-links"'));
  console.log('Shop link present:', footerHtml.includes('href="/shop"'));
  console.log('Size guide link present:', footerHtml.includes('href="/size-guide"'));
  console.log('About link present:', footerHtml.includes('href="/about"'));
  console.log('Contact link present:', footerHtml.includes('href="/contact"'));
  console.log('YouTube icon button:', footerHtml.includes('class="ft-ico"') && footerHtml.includes('https://www.youtube.com/@nestammakkili'));
  console.log('WhatsApp icon button:', footerHtml.includes('https://wa.me/'));
  console.log('No Admin Access link:', !footerHtml.includes('Admin Access'));
  console.log('footer.css link in head:', html.includes('/css/footer.css'));
  console.log('Theme toggle in footer:', footerHtml.includes('data-theme-toggle'));
  console.log('Current year present:', footerHtml.includes(new Date().getFullYear().toString()));

  // Verify image responds 200
  const img128Res = await fetch('http://localhost:3000/img/brand/logo-full-128.png');
  console.log('/img/brand/logo-full-128.png status:', img128Res.status);
  const img256Res = await fetch('http://localhost:3000/img/brand/logo-full-256.png');
  console.log('/img/brand/logo-full-256.png status:', img256Res.status);
}

verifyFooter().catch(console.error);
