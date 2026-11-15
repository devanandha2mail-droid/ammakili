const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const PhotoJob = require('../models/PhotoJob');

const STYLIST_UPLOADS_DIR = path.join(__dirname, '../../public/uploads/stylist');
if (!fs.existsSync(STYLIST_UPLOADS_DIR)) {
  fs.mkdirSync(STYLIST_UPLOADS_DIR, { recursive: true });
}

// Memory storage so we inspect content bytes before writing to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024, // 12 MB max
    files: 10 // Up to 10 photos at once
  }
});

/**
 * Validates file magic bytes (JPEG, PNG, WebP, HEIC).
 * Reject everything else with a clear message.
 */
function validateMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }

  // WebP: RIFF ... WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'webp';
  }

  // HEIC / HEIF: bytes 4..7 'ftyp'
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) {
      return 'heic';
    }
  }

  return null;
}

/**
 * Processes an uploaded buffer:
 * 1. Checks magic bytes
 * 2. Applies EXIF rotation & strips GPS/metadata
 * 3. Resizes to max 2000px long side, WebP quality 85
 * 4. Saves original to disk and creates a queued PhotoJob
 */
async function processStylistUpload(file, { productId = null, draftId = null, mode = 'auto', hanger = 'auto', background = 'pink' } = {}) {
  const format = validateMagicBytes(file.buffer);
  if (format === 'heic') {
    throw new Error('iPhone HEIC format is not supported directly. Please convert or export your photo to JPEG, PNG, or WebP before uploading.');
  }
  if (!format || !['jpeg', 'png', 'webp'].includes(format)) {
    throw new Error('Only JPEG, PNG, WebP and HEIC images are allowed. The uploaded file content does not match any accepted image format.');
  }

  const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const origFileName = `orig-${uniqueId}.webp`;
  const origFilePath = path.join(STYLIST_UPLOADS_DIR, origFileName);
  const originalUrl = `/uploads/stylist/${origFileName}`;

  const origMeta = await sharp(file.buffer).metadata();
  const origW = origMeta.width || 0;
  const origH = origMeta.height || 0;
  const longSide = Math.max(origW, origH);
  const origName = file.originalname || '';
  const isWhatsApp = origName.startsWith('WhatsApp Image');

  let lowResWarning = null;
  if ((longSide > 0 && longSide < 1000) || isWhatsApp) {
    lowResWarning = `This photo is small (${origW}x${origH}). It may look blurry when zoomed. Upload the original from the phone's gallery instead of a copy sent through WhatsApp.`;
  }

  // Rotate based on EXIF, strip metadata, resize to at most 2000px long side (without enlargement)
  const info = await sharp(file.buffer)
    .rotate()
    .resize({
      width: 2000,
      height: 2000,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 85 })
    .toFile(origFilePath);

  const job = await PhotoJob.create({
    productId: productId || null,
    draftId: draftId || null,
    sourceKey: origFilePath,
    originalUrl: originalUrl,
    options: {
      mode: ['auto', 'hanging', 'flat', 'worn'].includes(mode) ? mode : 'auto',
      hanger: ['auto', 'yes', 'no'].includes(hanger) ? hanger : 'auto',
      background: ['pink', 'cream', 'white'].includes(background) ? background : 'pink'
    },
    meta: lowResWarning ? { lowResWarning } : {},
    status: 'queued'
  });

  return {
    job,
    originalUrl,
    width: info.width,
    height: info.height,
    lowResWarning
  };
}

module.exports = {
  upload,
  validateMagicBytes,
  processStylistUpload,
  STYLIST_UPLOADS_DIR
};

