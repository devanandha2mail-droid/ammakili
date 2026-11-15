const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

const PhotoJob = require('../../src/models/PhotoJob');
const Product = require('../../src/models/Product');
const photoJobWorker = require('../../src/services/photoJobWorker');
const { recoverStuckJobs, retryJob } = require('../../src/services/photoJobWorker');
const { migrateProductImages } = require('../../src/utils/migrateImages');
const { validateMagicBytes, processStylistUpload } = require('../../src/services/stylistUpload');
const photoStylist = require('../../src/services/photoStylist');
const sharp = require('sharp');

const TEST_DB = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_test';

test.before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB);
  }
});

test.after(async () => {
  await mongoose.disconnect();
});

test('Unit 1: PhotoJob state transitions (queued -> processing -> done / failed)', async () => {
  // Create queued job
  const job = await PhotoJob.create({
    sourceKey: 'test/path/orig.webp',
    originalUrl: '/uploads/stylist/test-orig.webp',
    options: { mode: 'flat', hanger: 'yes', background: 'pink' },
    status: 'queued'
  });
  assert.equal(job.status, 'queued');
  assert.equal(job.options.mode, 'flat');

  // Transition to processing
  job.status = 'processing';
  job.startedAt = new Date();
  await job.save();
  assert.equal(job.status, 'processing');
  assert.ok(job.startedAt);

  // Transition to done
  job.status = 'done';
  job.resultKey = '/uploads/stylist/styled-test.webp';
  job.variants = { '400': '/styled-400w.webp', '800': '/styled-800w.webp', '1200': '/styled-1200w.webp' };
  job.meta = { quality: 'good', hanger_added: true, seconds: 12.4 };
  job.finishedAt = new Date();
  await job.save();

  const saved = await PhotoJob.findById(job._id);
  assert.equal(saved.status, 'done');
  assert.equal(saved.resultKey, '/uploads/stylist/styled-test.webp');
  assert.equal(saved.meta.quality, 'good');
  assert.equal(saved.meta.hanger_added, true);

  // Cleanup
  await PhotoJob.findByIdAndDelete(job._id);
});

test('Unit 2: Restart recovery - jobs stuck in processing > 5 min are reset to queued', async () => {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);

  // Job 1: Stuck job (started 10 mins ago)
  const stuckJob = await PhotoJob.create({
    sourceKey: 'test/path/stuck.webp',
    originalUrl: '/uploads/stylist/stuck.webp',
    status: 'processing',
    startedAt: tenMinutesAgo
  });

  // Job 2: Active job (started 1 min ago)
  const activeJob = await PhotoJob.create({
    sourceKey: 'test/path/active.webp',
    originalUrl: '/uploads/stylist/active.webp',
    status: 'processing',
    startedAt: oneMinuteAgo
  });

  // Run recovery
  await recoverStuckJobs();

  const refreshedStuck = await PhotoJob.findById(stuckJob._id);
  const refreshedActive = await PhotoJob.findById(activeJob._id);

  assert.equal(refreshedStuck.status, 'queued', 'Stuck job should be reset to queued');
  assert.equal(refreshedStuck.startedAt, null);
  assert.equal(refreshedActive.status, 'processing', 'Active job under 5 min should remain processing');

  // Cleanup
  await PhotoJob.deleteMany({ _id: { $in: [stuckJob._id, activeJob._id] } });
});

test('Unit 3: Options validation and restyle reset', async () => {
  const job = await PhotoJob.create({
    sourceKey: 'test/path/restyle.webp',
    originalUrl: '/uploads/stylist/restyle.webp',
    options: { mode: 'auto', hanger: 'auto', background: 'pink' },
    status: 'failed',
    error: 'Simulated failure'
  });

  // Retry / restyle with new options
  const retried = await retryJob(job._id, { mode: 'worn', hanger: 'no', background: 'cream' });
  assert.equal(retried.status, 'queued');
  assert.equal(retried.error, null);
  assert.equal(retried.options.mode, 'worn');
  assert.equal(retried.options.hanger, 'no');
  assert.equal(retried.options.background, 'cream');

  // Cleanup
  await PhotoJob.findByIdAndDelete(job._id);
});

test('Unit 4: Migration of legacy string images to object structure { url, kind: "extra" }', async () => {
  // Directly insert raw string images bypassing Mongoose setters to simulate pre-existing database records
  const rawId = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('products').insertOne({
    _id: rawId,
    slug: 'legacy-test-nighty-' + Date.now(),
    name: { en: 'Legacy Test Nighty', ml: '' },
    description: { en: 'Legacy nighty with string images', ml: '' },
    style: 'Cotton',
    price: 499,
    images: ['/img/sample-1.jpg', '/img/sample-2.jpg', '/img/sample-3.jpg'],
    sizes: [{ size: 'M', stock: 5 }],
    active: true
  });

  // Run migration
  const migratedCount = await migrateProductImages();
  assert.ok(migratedCount >= 1, 'Should migrate at least 1 product');

  // Verify migrated document
  const prod = await Product.findById(rawId);
  assert.equal(prod.images.length, 3, 'All 3 images must be retained without losing any');
  assert.equal(prod.images[0].url, '/img/sample-1.jpg');
  assert.equal(prod.images[0].kind, 'extra');
  assert.equal(prod.images[1].url, '/img/sample-2.jpg');
  assert.equal(prod.images[1].kind, 'extra');
  assert.equal(prod.images[2].url, '/img/sample-3.jpg');
  assert.equal(prod.images[2].kind, 'extra');

  // Cleanup
  await Product.findByIdAndDelete(rawId);
});

test('Unit 5: Magic bytes validation strictly accepts JPEG, PNG, WebP, HEIC and rejects others', () => {
  // JPEG: FF D8 FF
  assert.equal(validateMagicBytes(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01])), 'jpeg');

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  assert.equal(validateMagicBytes(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])), 'png');

  // WebP: RIFF ... WEBP
  const webpBuf = Buffer.from('RIFF1234WEBPVP8 ');
  assert.equal(validateMagicBytes(webpBuf), 'webp');

  // HEIC: ... ftyp heic
  const heicBuf = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00]);
  assert.equal(validateMagicBytes(heicBuf), 'heic');

  // Fake text file disguised as jpg
  const fakeJpg = Buffer.from('Hello world this is a text file not an image!');
  assert.equal(validateMagicBytes(fakeJpg), null, 'Text file disguised as .jpg must be rejected');

  // Executable / ELF
  const elfBuf = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(validateMagicBytes(elfBuf), null, 'Binary executable must be rejected');
});

test('Unit 6: A job whose meta has styled_ok: false never creates a styled image and saves as detail photo', async () => {
  const dummyBuf = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 120, g: 150, b: 200 } }
  }).jpeg().toBuffer();

  const uploadResult = await processStylistUpload({ buffer: dummyBuf, originalname: 'test-closeup.jpg' });
  const job = uploadResult.job;

  const origStyle = photoStylist.styleImage;
  const origAvail = photoStylist.isAvailable;
  photoStylist.isAvailable = async () => true;
  photoStylist.styleImage = async () => ({
    buffer: dummyBuf,
    meta: {
      styled_ok: false,
      mode_used: 'closeup',
      warnings: ['This looks like a close-up of a print, neckline, or folded dress. We saved it as a detail photo.'],
      quality: 'poor',
      seconds: 1.2
    }
  });

  try {
    await photoJobWorker.processJob(job);
    const updated = await PhotoJob.findById(job._id);

    assert.equal(updated.status, 'done');
    assert.equal(updated.styled_ok, false, 'styled_ok must be false');
    assert.equal(updated.mode_used, 'closeup');
    assert.equal(updated.resultKey, null, 'resultKey MUST remain null when styled_ok is false');
    assert.ok(updated.detailKey, 'detailKey must be saved for detail photo');
    assert.ok(updated.detailKey.includes('detail-'), 'Detail key must reference detail photo');

    photoJobWorker.deleteJobFiles(updated);
    await PhotoJob.findByIdAndDelete(updated._id);
  } finally {
    photoStylist.styleImage = origStyle;
    photoStylist.isAvailable = origAvail;
  }
});

test('Unit 7: Product.getOrderedImages preserves styled first, original second, detail third, extra fourth', () => {
  const p = new Product({
    slug: 'order-test-' + Date.now(),
    name: { en: 'Order Test Nighty', ml: '' },
    description: { en: 'Ordering check', ml: '' },
    style: 'Cotton',
    price: 499,
    images: [
      { url: '/extra1.webp', kind: 'extra' },
      { url: '/detail1.webp', kind: 'detail' },
      { url: '/original1.webp', kind: 'original' },
      { url: '/styled1.webp', kind: 'styled' }
    ]
  });

  const ordered = p.getOrderedImages();
  assert.equal(ordered.length, 4);
  assert.equal(ordered[0].kind, 'styled', 'styled image must be first');
  assert.equal(ordered[1].kind, 'original', 'original whole-dress photo must be second');
  assert.equal(ordered[2].kind, 'detail', 'detail photo must come after whole-dress');
  assert.equal(ordered[3].kind, 'extra', 'extra photo must come last');
  assert.equal(p.getMainImage(), '/styled1.webp');
  assert.equal(p.getSecondImage(), '/original1.webp');
});

