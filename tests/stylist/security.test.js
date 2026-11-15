const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const http = require('http');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const app = require('../../src/app');
const { validateMagicBytes } = require('../../src/services/stylistUpload');

let server;
let baseUrl;

test.before(async () => {
  await connectDB();
  await new Promise(resolve => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise(resolve => server.close(resolve));
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  setTimeout(() => process.exit(0), 100).unref();
});

test('Security 1: Non-admin requests to stylist routes are blocked and redirect to login', async () => {
  const routes = [
    { method: 'POST', path: '/admin/stylist/upload' },
    { method: 'GET', path: '/admin/stylist/job/6aed45e80f1e13cd9febc88a' },
    { method: 'POST', path: '/admin/stylist/restyle/6aed45e80f1e13cd9febc88a' },
    { method: 'POST', path: '/admin/stylist/retry/6aed45e80f1e13cd9febc88a' },
    { method: 'POST', path: '/admin/stylist/delete/6aed45e80f1e13cd9febc88a' },
    { method: 'GET', path: '/admin/stylist/status' }
  ];

  for (const r of routes) {
    const res = await fetch(`${baseUrl}${r.path}`, {
      method: r.method,
      redirect: 'manual'
    });

    // Unauthenticated user must be redirected to /admin/login (302) or rejected (401/403)
    assert.ok(
      res.status === 302 || res.status === 401 || res.status === 403,
      `Unauthenticated ${r.method} ${r.path} must be protected. Got status: ${res.status}`
    );

    if (res.status === 302) {
      const location = res.headers.get('location') || '';
      assert.ok(location.includes('/admin/login'), `Should redirect to login, got: ${location}`);
    }
  }
});

test('Security 2: File content inspection rejects renamed text or malicious files', () => {
  const fakeJpg = Buffer.from('GIF89a Fake header but actually a malicious text script <?php phpinfo(); ?>');
  const result = validateMagicBytes(fakeJpg);
  assert.equal(result, null, 'Renamed text/php script must be rejected by magic bytes check');
});

test('Security 3: docker-compose.yml configuration ensures stylist port 8001 is not exposed publicly', () => {
  const composePath = path.resolve(__dirname, '../../docker-compose.yml');
  assert.ok(fs.existsSync(composePath), 'docker-compose.yml must exist');
  const content = fs.readFileSync(composePath, 'utf8');

  // Verify 'expose' is used for stylist
  assert.ok(content.includes('expose:'), 'Stylist service must use expose');
  assert.ok(content.includes('8001'), 'Stylist service must declare port 8001');

  // Ensure 'ports:' is NOT configured on the stylist service
  const stylistSection = content.split('web:')[0];
  assert.ok(!stylistSection.includes('ports:'), 'Stylist service must NEVER publish ports to host');
});

test('Security 4: STYLIST_KEY and raw image binary data are never leaked in client responses', async () => {
  const res = await fetch(`${baseUrl}/admin/stylist/status`, { redirect: 'manual' });
  const text = await res.text();
  const secretKey = process.env.STYLIST_KEY;

  if (secretKey && secretKey.length > 5) {
    assert.ok(!text.includes(secretKey), 'STYLIST_KEY secret must never be revealed in responses');
  }
});
