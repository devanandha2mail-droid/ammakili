const mongoose = require('mongoose');

const productImageSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true
  },
  kind: {
    type: String,
    enum: ['styled', 'original', 'extra', 'detail'],
    default: 'extra'
  },
  sourceId: {
    type: String,
    default: ''
  },
  width: {
    type: Number
  },
  height: {
    type: Number
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  }
}, { _id: false });

productImageSchema.methods.toString = function() {
  return this.url;
};

const sizeSchema = new mongoose.Schema({
  size: {
    type: String,
    required: true,
    enum: ['M', 'L', 'XL', 'XXL', '3XL']
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  }
}, { _id: false });

const productSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  name: {
    en: { type: String, required: true, trim: true },
    ml: { type: String, default: '', trim: true }
  },
  description: {
    en: { type: String, required: true, trim: true },
    ml: { type: String, default: '', trim: true }
  },
  style: {
    type: String,
    required: true,
    trim: true,
    default: 'Cotton'
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  images: {
    type: [productImageSchema],
    default: [],
    set: arr => (Array.isArray(arr) ? arr.map(i => typeof i === 'string' ? { url: i, kind: 'extra' } : i) : arr)
  },
  videoUrl: {
    type: String,
    default: '',
    trim: true
  },
  fabric: {
    en: { type: String, default: '', trim: true },
    ml: { type: String, default: '', trim: true }
  },
  care: {
    en: { type: String, default: '', trim: true },
    ml: { type: String, default: '', trim: true }
  },
  fit: {
    en: { type: String, default: '', trim: true },
    ml: { type: String, default: '', trim: true }
  },
  sizes: [sizeSchema],
  tag: {
    type: String,
    enum: ['New', 'Bestseller', 'None', ''],
    default: 'None'
  },
  featured: {
    type: Boolean,
    default: false,
    index: true
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  },
  isSample: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Helper virtual for total stock
productSchema.virtual('totalStock').get(function() {
  if (!this.sizes || !this.sizes.length) return 0;
  return this.sizes.reduce((sum, item) => sum + (item.stock || 0), 0);
});

// Helper method to get images ordered: styled first, then original (whole dress), then detail, then extra
productSchema.methods.getOrderedImages = function() {
  if (!this.images || !this.images.length) return [];
  const normalized = this.images.map(img => {
    if (typeof img === 'string') {
      return { url: img, kind: 'extra', sourceId: '', meta: {} };
    }
    return {
      url: img.url || '',
      kind: img.kind || 'extra',
      sourceId: img.sourceId || '',
      width: img.width,
      height: img.height,
      meta: img.meta || {}
    };
  });
  const styled = normalized.filter(i => i.kind === 'styled');
  const original = normalized.filter(i => i.kind === 'original');
  const detail = normalized.filter(i => i.kind === 'detail');
  const extra = normalized.filter(i => i.kind !== 'styled' && i.kind !== 'original' && i.kind !== 'detail');
  return [...styled, ...original, ...detail, ...extra];
};

productSchema.methods.getMainImage = function() {
  const ordered = this.getOrderedImages();
  return ordered.length ? ordered[0].url : '/img/logo.svg';
};

productSchema.methods.getSecondImage = function() {
  const ordered = this.getOrderedImages();
  return ordered.length > 1 ? ordered[1].url : null;
};

// Method to get localized name
productSchema.methods.getName = function(lang = 'en') {
  return (lang === 'ml' && this.name.ml) ? this.name.ml : this.name.en;
};

// Method to get localized description
productSchema.methods.getDescription = function(lang = 'en') {
  return (lang === 'ml' && this.description.ml) ? this.description.ml : this.description.en;
};

// Method to get localized fabric
productSchema.methods.getFabric = function(lang = 'en') {
  return (lang === 'ml' && this.fabric && this.fabric.ml) ? this.fabric.ml : (this.fabric && this.fabric.en ? this.fabric.en : '');
};

// Method to get localized care instructions
productSchema.methods.getCare = function(lang = 'en') {
  return (lang === 'ml' && this.care && this.care.ml) ? this.care.ml : (this.care && this.care.en ? this.care.en : '');
};

// Method to get localized fit details
productSchema.methods.getFit = function(lang = 'en') {
  return (lang === 'ml' && this.fit && this.fit.ml) ? this.fit.ml : (this.fit && this.fit.en ? this.fit.en : '');
};

module.exports = mongoose.model('Product', productSchema);

