async function verifyFooter() {
  const res = await fetch('http://localhost:3000/');
  const html = await res.text();

  console.log('--- Checking Footer Elements ---');
  console.log('site-footer present:', html.includes('class="site-footer"'));
  console.log('logo 96x96 present:', html.includes('src="/img/brand/logo-full-256.png"'));
  console.log('logo srcset present:', html.includes('srcset="/img/brand/logo-full-128.png 1x, /img/brand/logo-full-256.png 2x"'));
  console.log('ft-name present:', html.includes('class="ft-name"'));
  console.log('Nest by Ammakkili:', html.includes('<b>Nest</b><small>by Ammakkili</small>'));
  const footerHtml = html.substring(html.indexOf('<footer'), html.indexOf('</footer>') + 9);
  console.log('ft-tag present in footer (no Kerala):', footerHtml.includes('Online shop for women’s nighties.') && !footerHtml.includes('Kerala'));
  console.log('No Admin Access link:', !html.includes('Admin Access'));
  console.log('Watch on YouTube button:', html.includes('Watch on YouTube') && html.includes('class="ft-yt"'));
  console.log('footer.css link in head:', html.includes('/css/footer.css'));
  console.log('Theme toggle in footer:', html.includes('data-theme-toggle>Theme: <span data-theme-label>Light</span>'));
  console.log('Current year present:', html.includes(new Date().getFullYear().toString()));

  // Verify image responds 200
  const imgRes = await fetch('http://localhost:3000/img/brand/logo-full-256.png');
  console.log('/img/brand/logo-full-256.png status:', imgRes.status);
  const img128Res = await fetch('http://localhost:3000/img/brand/logo-full-128.png');
  console.log('/img/brand/logo-full-128.png status:', img128Res.status);
}

verifyFooter().catch(console.error);

