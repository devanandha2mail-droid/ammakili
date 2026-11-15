const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
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

// Local disk storage fallback directory
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Always use memory storage to inspect magic bytes & re-encode before writing
const storage = multer.memoryStorage();

// Strict mime & extension filter: ONLY jpeg, png, webp. No SVG, GIF, HTML, or executables.
const fileFilter = (req, file, cb) => {
  const allowedExts = /^(jpeg|jpg|png|webp)$/i;
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
  
  if (allowedExts.test(ext) && allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are permitted. SVG, GIF, HTML, and executables are strictly rejected.'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 10 // Max 10 files per upload
  },
  fileFilter
});

/**
 * Validates real magic bytes via Sharp and re-encodes through Sharp to strip EXIF
 * and generate sanitized WebP and JPEG. Never serves raw uploaded bytes.
 */
const processUploadedFiles = async (files) => {
  if (!files || !files.length) return [];

  const processedUrls = [];

  for (const file of files) {
    // 1. Validate real magic bytes by probing image metadata with Sharp
    const metadata = await sharp(file.buffer).metadata();
    const validFormats = ['jpeg', 'png', 'webp'];
    if (!metadata || !metadata.format || !validFormats.includes(metadata.format)) {
      throw new Error(`Security validation failed: File format "${metadata?.format || 'unknown'}" is not permitted.`);
    }

    // 2. Re-encode through Sharp: auto-orient, strip all EXIF metadata, and re-save
    const sanitizedBuffer = await sharp(file.buffer)
      .rotate()
      .webp({ quality: 85 })
      .toBuffer();

    // 3. Generate secure random filename
    const randomId = crypto.randomUUID();

    if (!hasCloudinary) {
      // Local storage: write re-encoded WebP with randomized UUID
      const destFilename = `${randomId}.webp`;
      const destPath = path.join(uploadDir, destFilename);
      await fs.promises.writeFile(destPath, sanitizedBuffer);
      processedUrls.push(`/uploads/${destFilename}`);
    } else {
      // Upload sanitized buffer to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'nest-ammakkili/products',
            public_id: randomId,
            transformation: [{ quality: 'auto', fetch_format: 'auto' }]
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );
        uploadStream.end(sanitizedBuffer);
      });
      processedUrls.push(uploadResult);
    }
  }

  return processedUrls;
};

module.exports = {
  upload,
  processUploadedFiles,
  hasCloudinary
};
