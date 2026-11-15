const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execSync, execFileSync } = require('child_process');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

const connectDB = require('../../src/config/db');
const app = require('../../src/app');
const Product = require('../../src/models/Product');
const PhotoJob = require('../../src/models/PhotoJob');
const photoJobWorker = require('../../src/services/photoJobWorker');
const photoStylist = require('../../src/services/photoStylist');
const { processStylistUpload } = require('../../src/services/stylistUpload');

let server;
let baseUrl;
let uvicornProcess;

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

  const available = await photoStylist.isAvailable(1000);
  if (!available) {
    const pythonPath = path.resolve(__dirname, '../../services/stylist/.venv/Scripts/python.exe');
    uvicornProcess = spawn(
      pythonPath,
      ['-m', 'uvicorn', 'stylist.app:app', '--host', '127.0.0.1', '--port', '8001'],
      {
        cwd: path.resolve(__dirname, '../../services/stylist'),
        stdio: 'pipe'
      }
    );
    const start = Date.now();
    while (Date.now() - start < 15000) {
      if (await photoStylist.isAvailable(1000)) break;
      await new Promise(r => setTimeout(r, 400));
    }
  }
});

test.after(async () => {
  if (uvicornProcess && uvicornProcess.pid) {
    try {
      execSync(`taskkill /pid ${uvicornProcess.pid} /T /F`);
    } catch {
      try { uvicornProcess.kill('SIGTERM'); } catch {}
    }
  }
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

test('E2E 1: Fixtures testing with real Python pipeline (flat, hanging, worn)', () => {
  const pythonPath = path.resolve(__dirname, '../../services/stylist/.venv/Scripts/python.exe');
  const samplesDir = path.resolve(__dirname, '../../services/stylist/samples');

  const testSample = (file, mode = 'auto') => {
    const script = `
import json
from stylist.pipeline import style_photo
with open(r'${path.join(samplesDir, file).replace(/\\/g, '/')}', 'rb') as f:
    buf = f.read()
_, res = style_photo(buf, '${mode}')
print(json.dumps(res.to_dict()))
`;
    const out = execFileSync(pythonPath, ['-c', script], {
      cwd: path.resolve(__dirname, '../../services/stylist'),
      encoding: 'utf8'
    });
    return JSON.parse(out.trim().split('\n').pop());
  };

  // 1. Flat gets a wooden hanger
  const flatRes = testSample('flat.jpg');
  assert.equal(flatRes.hanger_added, true, 'Flat dress photo must receive a wooden hanger');
  assert.equal(flatRes.mode_used, 'flat');
  assert.equal(flatRes.quality, 'good');

  // 2. Hanging keeps its own hanger, no second hanger added
  const hangRes = testSample('hanging.jpg');
  assert.equal(hangRes.hanger_added, false, 'Hanging dress must NOT receive a duplicate hanger');
  assert.equal(hangRes.mode_used, 'hanging');
  assert.equal(hangRes.quality, 'good');

  // 3. Worn or held skips hanger and shows warning
  const wornRes = testSample('worn.jpg');
  assert.equal(wornRes.hanger_added, false, 'Worn dress must never have a hanger');
  assert.equal(wornRes.mode_used, 'worn');
  assert.ok(wornRes.warnings && wornRes.warnings.length > 0, 'Worn photo must trigger a warning to admin');
  assert.ok(
    wornRes.warnings.some(w => w.includes('person') || w.includes('hanger')),
    'Warning must mention person and skipping hanger'
  );
});

test('E2E 2: Uploading a text file renamed .jpg is strictly rejected', async () => {
  const fakeFile = {
    buffer: Buffer.from('Plain text content inside a file named photo.jpg'),
    originalname: 'dress.jpg'
  };

  await assert.rejects(
    async () => {
      await processStylistUpload(fakeFile);
    },
    /Only JPEG, PNG, WebP and HEIC images are allowed/
  );
});

test('E2E 3: Product page displays styled image first and original photo second with label', async () => {
  const testProduct = await Product.create({
    slug: 'e2e-stylist-test-nighty-' + Date.now(),
    name: { en: 'E2E Royal Satin Nighty', ml: 'റോയൽ സാറ്റിൻ നൈറ്റി' },
    description: { en: 'Beautiful nighty styled by Photo Stylist', ml: '' },
    style: 'Satin',
    price: 699,
    images: [
      { url: '/uploads/stylist/styled-e2e-demo.webp', kind: 'styled' },
      { url: '/uploads/stylist/orig-e2e-demo.webp', kind: 'original' }
    ],
    sizes: [{ size: 'M', stock: 5 }, { size: 'L', stock: 5 }]
  });

  const res = await fetch(`${baseUrl}/product/${testProduct.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();

  // 1. Primary photo in arch frame must be the styled image
  assert.ok(
    html.includes('/uploads/stylist/styled-e2e-demo.webp'),
    'Main photo must be the styled image'
  );

  // 2. Original photo must be present in gallery
  assert.ok(
    html.includes('/uploads/stylist/orig-e2e-demo.webp'),
    'Gallery must include the original photo'
  );

  // 3. Original photo must be labelled "Original photo"
  assert.ok(
    html.includes('Original photo') || html.includes('pdp-thumb-orig-badge'),
    'Thumbnail for original photo must be labeled as Original photo'
  );

  // Cleanup
  await Product.findByIdAndDelete(testProduct._id);
});

test('E2E 4: Real service refusal on 5 closeups, 4 good flatlays styled, 1 cream/white floor refused', { timeout: 300000 }, async () => {
  const closeupsDir = path.resolve(__dirname, '../../services/stylist/samples/real-closeups');
  const flatlaysDir = path.resolve(__dirname, '../../services/stylist/samples/real-flatlays');

  // 1. Five closeups: none may produce a styled image
  const closeupFiles = ['closeup-1.jpeg', 'closeup-2.jpeg', 'closeup-3.jpeg', 'closeup-4.jpeg', 'closeup-5.jpeg'];
  for (const filename of closeupFiles) {
    const fileBuf = fs.readFileSync(path.join(closeupsDir, filename));
    const uploadRes = await processStylistUpload({ buffer: fileBuf, originalname: filename });

    await photoJobWorker.processJob(uploadRes.job);
    const job = await PhotoJob.findById(uploadRes.job._id);

    assert.equal(job.status, 'done', `${filename} must complete processing`);
    assert.equal(job.styled_ok, false, `${filename} must refuse styling (styled_ok === false)`);
    assert.equal(job.mode_used, 'closeup', `${filename} mode_used must be closeup`);
    assert.equal(job.resultKey, null, `${filename} must NOT produce a styled image (resultKey === null)`);
    assert.ok(job.detailKey, `${filename} must be saved as a detail photo`);
    assert.ok(job.meta.warnings && job.meta.warnings.length > 0, `${filename} must have warning`);

    photoJobWorker.deleteJobFiles(job);
    await PhotoJob.findByIdAndDelete(job._id);
  }

  // 2. Four good flatlays: each must produce a styled image first and original second
  const goodFlatlayFiles = ['flatlay-1-red.jpeg', 'flatlay-2-cream-red-flowers.jpeg', 'flatlay-4-green.jpeg', 'flatlay-5-navy.jpeg'];
  for (const filename of goodFlatlayFiles) {
    const fileBuf = fs.readFileSync(path.join(flatlaysDir, filename));
    const uploadRes = await processStylistUpload({ buffer: fileBuf, originalname: filename });

    await photoJobWorker.processJob(uploadRes.job);
    const job = await PhotoJob.findById(uploadRes.job._id);

    assert.equal(job.status, 'done', `${filename} must complete processing`);
    assert.equal(job.styled_ok, true, `${filename} must style successfully (styled_ok === true)`);
    assert.equal(job.mode_used, 'flat', `${filename} mode_used must be flat`);
    assert.ok(job.resultKey, `${filename} must produce a styled image`);
    assert.ok(job.variants && job.variants['400'], `${filename} must produce variants`);

    const p = new Product({
      slug: 'test-flatlay-' + Date.now(),
      name: { en: 'Flatlay Test', ml: '' },
      description: { en: 'Test', ml: '' },
      style: 'Cotton',
      price: 599,
      images: [
        { url: job.resultKey, kind: 'styled' },
        { url: job.originalUrl, kind: 'original' }
      ],
      sizes: [{ size: 'M', stock: 5 }]
    });
    await p.save();

    const ordered = p.getOrderedImages();
    assert.equal(ordered[0].kind, 'styled', `${filename}: styled image must be first`);
    assert.equal(ordered[1].kind, 'original', `${filename}: original photo must be second`);
    assert.equal(p.getMainImage(), job.resultKey);
    assert.equal(p.getSecondImage(), job.originalUrl);

    photoJobWorker.deleteJobFiles(job);
    await PhotoJob.findByIdAndDelete(job._id);
    await Product.findByIdAndDelete(p._id);
  }

  // 3. One fail flatlay (cream on white floor): refused with amber message and saved as detail photo only
  const failFilename = 'flatlay-3-cream-on-white-floor-FAILS.jpeg';
  const failBuf = fs.readFileSync(path.join(flatlaysDir, failFilename));
  const failUpload = await processStylistUpload({ buffer: failBuf, originalname: failFilename });

  await photoJobWorker.processJob(failUpload.job);
  const failJob = await PhotoJob.findById(failUpload.job._id);

  assert.equal(failJob.status, 'done', 'Cream-on-white floor must complete processing');
  assert.equal(failJob.styled_ok, false, 'Cream-on-white floor must be refused (styled_ok === false)');
  assert.equal(failJob.mode_used, 'closeup', 'Refused flatlay mode_used must be closeup');
  assert.equal(failJob.resultKey, null, 'Cream-on-white floor must NOT produce a styled image');
  assert.ok(failJob.detailKey, 'Cream-on-white floor must be saved as detail photo only');
  assert.ok(failJob.meta.warnings && failJob.meta.warnings.length > 0, 'Cream-on-white floor must have warning');
  assert.match(failJob.meta.warnings[0], /We could not cleanly separate the dress from the background/);

  photoJobWorker.deleteJobFiles(failJob);
  await PhotoJob.findByIdAndDelete(failJob._id);
});

