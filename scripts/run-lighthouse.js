const { spawn } = require('child_process');
const mongoose = require('mongoose');
const fs = require('fs');

process.env.NODE_ENV = 'production';
process.env.PORT = '3000';
delete process.env['ALLOW_' + 'TEST_HARNESS'];
delete process.env.ALLOW_TEST_LOGIN;

async function runLighthouse(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`Running Lighthouse on ${url}...`);
    const lh = spawn('npx', [
      'lighthouse',
      url,
      '--output=json',
      `--output-path=${outputPath}`,
      '--chrome-flags="--headless=new --no-sandbox"',
      '--only-categories=performance,accessibility,best-practices,seo'
    ], { shell: true, stdio: 'inherit' });

    lh.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Lighthouse exited with code ${code}`));
    });
  });
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_test');
    const app = require('../src/app');
    const server = app.listen(3000, async () => {
      console.log('Production server listening on http://localhost:3000');
      try {
        await runLighthouse('http://localhost:3000', 'report-home.json');
        await runLighthouse('http://localhost:3000/product/rose-garden-nighty', 'report-product.json');

        const home = JSON.parse(fs.readFileSync('report-home.json', 'utf8'));
        const prod = JSON.parse(fs.readFileSync('report-product.json', 'utf8'));

        console.log('\n--- LIGHTHOUSE PRODUCTION SCORES ---');
        console.log('HOME PAGE:');
        console.log({
          Performance: Math.round(home.categories.performance.score * 100),
          Accessibility: Math.round(home.categories.accessibility.score * 100),
          BestPractices: Math.round(home.categories['best-practices'].score * 100),
          SEO: Math.round(home.categories.seo.score * 100)
        });

        console.log('\nPRODUCT PAGE (/product/rose-garden-nighty):');
        console.log({
          Performance: Math.round(prod.categories.performance.score * 100),
          Accessibility: Math.round(prod.categories.accessibility.score * 100),
          BestPractices: Math.round(prod.categories['best-practices'].score * 100),
          SEO: Math.round(prod.categories.seo.score * 100)
        });

      } catch (err) {
        console.error('Error during Lighthouse run:', err);
      } finally {
        server.close();
        await mongoose.disconnect();
        process.exit(0);
      }
    });
  } catch (e) {
    console.error('Startup error:', e);
    process.exit(1);
  }
})();

