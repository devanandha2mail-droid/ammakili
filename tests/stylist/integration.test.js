const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const sharp = require('sharp');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

const PhotoJob = require('../../src/models/PhotoJob');
const Product = require('../../src/models/Product');
const photoJobWorker = require('../../src/services/photoJobWorker');
const photoStylist = require('../../src/services/photoStylist');
const stylistUpload = require('../../src/services/stylistUpload');

const TEST_DB = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_test';

test.before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB);
  }
});

test.after(async () => {
  await mongoose.disconnect();
});

test('Integration 1: Upload creates a job and worker finishes it with srcset variants', async () => {
  // Create a real 100x100 JPEG test buffer
  const sampleJpeg = await sharp({
    create: {
      width: 200,
      height: 250,
      channels: 3,
      background: { r: 180, g: 60, b: 90 }
    }
  }).jpeg().toBuffer();

  // 1. Process upload
  const uploadResult = await stylistUpload.processStylistUpload(
    { buffer: sampleJpeg },
    { mode: 'auto', hanger: 'auto', background: 'pink' }
  );

  assert.ok(uploadResult.job);
  assert.equal(uploadResult.job.status, 'queued');
  assert.ok(fs.existsSync(uploadResult.job.sourceKey), 'Original photo must be written to disk');

  // 2. Mock photoStylist.styleImage to return a valid 1200x1500 WebP buffer
  const fakeStyledBuffer = await sharp({
    create: {
      width: 1200,
      height: 1500,
      channels: 4,
      background: { r: 253, g: 243, b: 245, alpha: 1 }
    }
  }).webp().toBuffer();

  const originalStyleImage = photoStylist.styleImage;
  const originalIsAvailable = photoStylist.isAvailable;
  photoStylist.isAvailable = async () => true;
  photoStylist.styleImage = async (buf, opts) => ({
    buffer: fakeStyledBuffer,
    meta: {
      mode_used: 'flat',
      hanger_added: true,
      quality: 'good',
      warnings: [],
      seconds: 2.1,
      background: opts.background || 'pink'
    }
  });

  try {
    // 3. Process the job via worker
    await photoJobWorker.processJob(uploadResult.job);

    const completed = await PhotoJob.findById(uploadResult.job._id);
    assert.equal(completed.status, 'done');
    assert.ok(completed.resultKey.endsWith('.webp'));
    assert.equal(completed.meta.hanger_added, true);
    assert.equal(completed.meta.quality, 'good');

    // 4. Verify generated srcset variants on disk
    assert.ok(completed.variants['400']);
    assert.ok(completed.variants['800']);
    assert.ok(completed.variants['1200']);

    const full400Path = path.join(__dirname, '../../public', completed.variants['400']);
    const full800Path = path.join(__dirname, '../../public', completed.variants['800']);
    assert.ok(fs.existsSync(full400Path), '400w variant must exist on disk');
    assert.ok(fs.existsSync(full800Path), '800w variant must exist on disk');

    // 5. Cleanup
    photoJobWorker.deleteJobFiles(completed);
    await PhotoJob.findByIdAndDelete(completed._id);
  } finally {
    photoStylist.styleImage = originalStyleImage;
    photoStylist.isAvailable = originalIsAvailable;
  }
});

test('Integration 2: Product gallery has styled first and original second for "both", or original only for "original"', async () => {
  // Case A: Use styled + keep original
  const pBoth = new Product({
    slug: 'test-both-' + Date.now(),
    name: { en: 'Styled & Original Nighty', ml: '' },
    description: { en: 'Product with both styled and original', ml: '' },
    style: 'Cotton',
    price: 599,
    images: [
      { url: '/uploads/stylist/styled-1.webp', kind: 'styled' },
      { url: '/uploads/stylist/orig-1.webp', kind: 'original' }
    ],
    sizes: [{ size: 'M', stock: 10 }]
  });
  await pBoth.save();

  const orderedBoth = pBoth.getOrderedImages();
  assert.equal(orderedBoth.length, 2);
  assert.equal(orderedBoth[0].kind, 'styled', 'First image must be styled');
  assert.equal(orderedBoth[0].url, '/uploads/stylist/styled-1.webp');
  assert.equal(orderedBoth[1].kind, 'original', 'Second image must be original photo');
  assert.equal(orderedBoth[1].url, '/uploads/stylist/orig-1.webp');
  assert.equal(pBoth.getMainImage(), '/uploads/stylist/styled-1.webp');
  assert.equal(pBoth.getSecondImage(), '/uploads/stylist/orig-1.webp');

  // Case B: Use original only
  const pOrigOnly = new Product({
    slug: 'test-orig-only-' + Date.now(),
    name: { en: 'Original Only Nighty', ml: '' },
    description: { en: 'Product with original only', ml: '' },
    style: 'Cotton',
    price: 599,
    images: [
      { url: '/uploads/stylist/orig-2.webp', kind: 'original' }
    ],
    sizes: [{ size: 'M', stock: 10 }]
  });
  await pOrigOnly.save();

  const orderedOrig = pOrigOnly.getOrderedImages();
  assert.equal(orderedOrig.length, 1);
  assert.equal(orderedOrig[0].kind, 'original', 'Must have original image');
  assert.equal(pOrigOnly.getMainImage(), '/uploads/stylist/orig-2.webp');
  assert.equal(pOrigOnly.getSecondImage(), null);

  // Cleanup
  await Product.deleteMany({ _id: { $in: [pBoth._id, pOrigOnly._id] } });
});

test('Integration 3: Stylist offline - photos are still saved as originals and product can be saved normally', async () => {
  const originalIsAvailable = photoStylist.isAvailable;
  // Simulate stylist microservice offline
  photoStylist.isAvailable = async () => false;

  try {
    const isOnline = await photoStylist.isAvailable();
    assert.equal(isOnline, false, 'Stylist is offline');

    // Create a real JPEG buffer
    const buf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 120 } }
    }).jpeg().toBuffer();

    // Upload still succeeds and saves original
    const result = await stylistUpload.processStylistUpload({ buffer: buf });
    assert.ok(result.job);
    assert.equal(result.job.status, 'queued');
    assert.ok(fs.existsSync(result.job.sourceKey));

    // Admin saves product with original photo
    const product = await Product.create({
      slug: 'offline-saved-nighty-' + Date.now(),
      name: { en: 'Offline Saved Nighty', ml: '' },
      description: { en: 'Created while stylist is offline', ml: '' },
      style: 'Cotton',
      price: 549,
      images: [{ url: result.originalUrl, kind: 'original' }],
      sizes: [{ size: 'L', stock: 8 }]
    });

    assert.equal(product.images.length, 1);
    assert.equal(product.images[0].kind, 'original');
    assert.equal(product.getMainImage(), result.originalUrl);

    // Cleanup
    photoJobWorker.deleteJobFiles(result.job);
    await PhotoJob.findByIdAndDelete(result.job._id);
    await Product.findByIdAndDelete(product._id);
  } finally {
    photoStylist.isAvailable = originalIsAvailable;
  }
});

test('Integration 4: closeup response gives gallery with original or original + detail, no styled image', async () => {
  const dummyBuf = await sharp({
    create: { width: 300, height: 400, channels: 3, background: { r: 180, g: 120, b: 90 } }
  }).jpeg().toBuffer();

  const uploadResult = await stylistUpload.processStylistUpload({ buffer: dummyBuf });
  const job = uploadResult.job;

  const originalStyleImage = photoStylist.styleImage;
  const originalIsAvailable = photoStylist.isAvailable;
  photoStylist.isAvailable = async () => true;
  photoStylist.styleImage = async () => ({
    buffer: dummyBuf,
    meta: {
      styled_ok: false,
      mode_used: 'closeup',
      warnings: ['This looks like a close-up of a print, neckline, or folded dress. We saved it as a detail photo.'],
      quality: 'poor',
      seconds: 1.4
    }
  });

  try {
    await photoJobWorker.processJob(job);
    const completed = await PhotoJob.findById(job._id);

    assert.equal(completed.status, 'done');
    assert.equal(completed.styled_ok, false);
    assert.equal(completed.mode_used, 'closeup');
    assert.equal(completed.resultKey, null, 'Never create styled image on closeup');
    assert.ok(completed.detailKey, 'Plain 4:5 crop stored as detailKey');

    // Case 1: Gallery with original only
    const pOrigOnly = new Product({
      slug: 'test-closeup-orig-' + Date.now(),
      name: { en: 'Closeup Original Only', ml: '' },
      description: { en: 'Test', ml: '' },
      style: 'Cotton',
      price: 499,
      images: [{ url: completed.originalUrl, kind: 'original' }],
      sizes: [{ size: 'M', stock: 5 }]
    });
    await pOrigOnly.save();
    assert.equal(pOrigOnly.getOrderedImages().length, 1);
    assert.equal(pOrigOnly.getMainImage(), completed.originalUrl);

    // Case 2: Gallery with original (whole dress) + detail
    const pWithDetail = new Product({
      slug: 'test-closeup-detail-' + Date.now(),
      name: { en: 'Closeup with Detail', ml: '' },
      description: { en: 'Test', ml: '' },
      style: 'Cotton',
      price: 499,
      images: [
        { url: completed.detailKey, kind: 'detail' },
        { url: completed.originalUrl, kind: 'original' }
      ],
      sizes: [{ size: 'M', stock: 5 }]
    });
    await pWithDetail.save();
    const ordered = pWithDetail.getOrderedImages();
    assert.equal(ordered.length, 2);
    assert.equal(ordered[0].kind, 'original', 'Whole-dress original photo must be first');
    assert.equal(ordered[1].kind, 'detail', 'Detail photo must be second');

    // Case 3: Gallery with detail only (no whole dress yet)
    const pDetailOnly = new Product({
      slug: 'test-detail-only-' + Date.now(),
      name: { en: 'Detail Only Product', ml: '' },
      description: { en: 'Test', ml: '' },
      style: 'Cotton',
      price: 499,
      images: [{ url: completed.detailKey, kind: 'detail' }],
      sizes: [{ size: 'M', stock: 5 }]
    });
    await pDetailOnly.save();
    assert.equal(pDetailOnly.getOrderedImages().length, 1);
    assert.equal(pDetailOnly.getMainImage(), completed.detailKey, 'Detail photo used in arch frame when only detail exists');

    // Cleanup
    photoJobWorker.deleteJobFiles(completed);
    await PhotoJob.findByIdAndDelete(completed._id);
    await Product.deleteMany({ _id: { $in: [pOrigOnly._id, pWithDetail._id, pDetailOnly._id] } });
  } finally {
    photoStylist.styleImage = originalStyleImage;
    photoStylist.isAvailable = originalIsAvailable;
  }
});

test('Integration 5: Upload a 768px-wide photo confirms low-resolution note appears but upload succeeds', async () => {
  const smallBuf = await sharp({
    create: { width: 768, height: 960, channels: 3, background: { r: 150, g: 180, b: 200 } }
  }).jpeg().toBuffer();

  const uploadResult = await stylistUpload.processStylistUpload({
    buffer: smallBuf,
    originalname: 'my-dress.jpeg'
  });

  assert.ok(uploadResult.job, 'Upload must succeed');
  assert.equal(uploadResult.job.status, 'queued');
  assert.ok(uploadResult.lowResWarning, 'Low-res warning must be returned');
  assert.match(uploadResult.lowResWarning, /This photo is small \(768x960\)/);
  assert.match(uploadResult.lowResWarning, /Upload the original from the phone's gallery instead of a copy sent through WhatsApp/);

  // Check that job meta also stored the warning
  const savedJob = await PhotoJob.findById(uploadResult.job._id);
  assert.equal(savedJob.meta.lowResWarning, uploadResult.lowResWarning);

  // Cleanup
  photoJobWorker.deleteJobFiles(savedJob);
  await PhotoJob.findByIdAndDelete(savedJob._id);
});

