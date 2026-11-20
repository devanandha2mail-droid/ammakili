const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const sharp = require('sharp');
const mongoose = require('mongoose');
const PhotoJob = require('../models/PhotoJob');
const photoStylist = require('./photoStylist');
const cloudinary = require('cloudinary').v2;

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const STYLIST_UPLOADS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'uploads', 'stylist')
  : path.join(__dirname, '../../public/uploads/stylist');

try {
  if (!fs.existsSync(STYLIST_UPLOADS_DIR)) {
    fs.mkdirSync(STYLIST_UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  // Guard against filesystem errors
}

// Memory storage so we inspect content bytes before writing to disk or cloud
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024, // 12 MB max
    files: 10 // Up to 10 photos at once
  }
});

/**
 * Validates file magic bytes (JPEG, PNG, WebP, HEIC).
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
 * 3. Resizes to max 2000px long side, WebP quality 85 in-memory
 * 4. Uploads to Cloudinary (if configured) or writes to writable disk (or Data URL fallback)
 * 5. Creates or mocks a PhotoJob
 */
async function processStylistUpload(file, { productId = null, draftId = null, mode = 'auto', hanger = 'auto', background = 'pink', isStylistAvailable = null } = {}) {
  const format = validateMagicBytes(file.buffer);
  if (format === 'heic') {
    throw new Error('iPhone HEIC format is not supported directly. Please convert or export your photo to JPEG, PNG, or WebP before uploading.');
  }
  if (!format || !['jpeg', 'png', 'webp'].includes(format)) {
    throw new Error('Only JPEG, PNG, WebP and HEIC images are allowed. The uploaded file content does not match any accepted image format.');
  }

  const isOnline = typeof isStylistAvailable === 'boolean' ? isStylistAvailable : await photoStylist.isAvailable(1000);

  const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const origFileName = `orig-${uniqueId}.webp`;

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
  const sharpTransform = sharp(file.buffer)
    .rotate()
    .resize({
      width: 2000,
      height: 2000,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 85 });

  const [processedBuffer, info] = await Promise.all([
    sharpTransform.toBuffer(),
    sharpTransform.metadata()
  ]);

  let originalUrl = null;
  let origFilePath = null;

  // 1. Try Cloudinary if available
  if (hasCloudinary) {
    try {
      originalUrl = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'nest-ammakkili/stylist',
            public_id: `orig-${uniqueId}`,
            transformation: [{ quality: 'auto', fetch_format: 'auto' }]
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );
        uploadStream.end(processedBuffer);
      });
      origFilePath = originalUrl;
    } catch (cldErr) {
      console.warn('[Stylist Upload] Cloudinary upload warning:', cldErr.message);
    }
  }

  // 2. Try disk storage (in writable tmp on Vercel, or public/uploads on localhost)
  if (!originalUrl) {
    try {
      if (!fs.existsSync(STYLIST_UPLOADS_DIR)) {
        fs.mkdirSync(STYLIST_UPLOADS_DIR, { recursive: true });
      }
      origFilePath = path.join(STYLIST_UPLOADS_DIR, origFileName);
      await fs.promises.writeFile(origFilePath, processedBuffer);
      originalUrl = `/uploads/stylist/${origFileName}`;
    } catch (fsErr) {
      console.warn('[Stylist Upload] Writable disk unavailable, using resilient Data URL fallback:', fsErr.message);
      originalUrl = `data:image/webp;base64,${processedBuffer.toString('base64')}`;
      origFilePath = originalUrl;
    }
  }

  let job = null;
  if (mongoose.connection.readyState === 1) {
    try {
      job = await PhotoJob.create({
        productId: productId || null,
        draftId: draftId || null,
        sourceKey: origFilePath,
        originalUrl: originalUrl,
        options: {
          mode: ['auto', 'hanging', 'flat', 'worn'].includes(mode) ? mode : 'auto',
          hanger: ['auto', 'yes', 'no'].includes(hanger) ? hanger : 'auto',
          background: ['pink', 'cream', 'white'].includes(background) ? background : 'pink'
        },
        meta: {
          ...(lowResWarning ? { lowResWarning } : {}),
          ...(isOnline ? {} : { offline: true })
        },
        status: isOnline ? 'queued' : 'done',
        styled_ok: false,
        finishedAt: isOnline ? null : new Date()
      });
    } catch (dbErr) {
      console.warn('[Stylist Upload] PhotoJob DB save failed:', dbErr.message);
    }
  }

  if (!job) {
    job = {
      _id: new mongoose.Types.ObjectId(),
      productId: productId || null,
      draftId: draftId || null,
      sourceKey: origFilePath,
      originalUrl: originalUrl,
      options: {
        mode: ['auto', 'hanging', 'flat', 'worn'].includes(mode) ? mode : 'auto',
        hanger: ['auto', 'yes', 'no'].includes(hanger) ? hanger : 'auto',
        background: ['pink', 'cream', 'white'].includes(background) ? background : 'pink'
      },
      meta: {
        ...(lowResWarning ? { lowResWarning } : {}),
        offline: true
      },
      status: 'done',
      styled_ok: false,
      finishedAt: new Date()
    };
  }

  return {
    job,
    originalUrl,
    width: info?.width || origW || 1200,
    height: info?.height || origH || 1600,
    lowResWarning,
    offline: !isOnline
  };
}

module.exports = {
  upload,
  validateMagicBytes,
  processStylistUpload,
  STYLIST_UPLOADS_DIR
};
