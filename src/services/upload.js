const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// Local disk storage fallback
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = hasCloudinary
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'nest-' + uniqueSuffix + ext);
      }
    });

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|svg/;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const mime = file.mimetype;
  if (allowed.test(ext) && (mime.startsWith('image/') || mime === 'image/svg+xml')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, WebP, SVG) are allowed'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter
});

// Helper function to process uploaded files and return final public URLs
const processUploadedFiles = async (files) => {
  if (!files || !files.length) return [];

  if (!hasCloudinary) {
    return files.map(f => `/uploads/${f.filename}`);
  }

  // Upload buffer to Cloudinary
  const uploadPromises = files.map(file => {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'nest-ammakkili/products',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }]
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(file.buffer);
    });
  });

  return Promise.all(uploadPromises);
};

module.exports = {
  upload,
  processUploadedFiles,
  hasCloudinary
};
