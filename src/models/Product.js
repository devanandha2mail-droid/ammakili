const mongoose = require('mongoose');

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
  images: [{
    type: String,
    trim: true
  }],
  videoUrl: {
    type: String,
    default: '',
    trim: true
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
  }
}, {
  timestamps: true
});

// Helper virtual for total stock
productSchema.virtual('totalStock').get(function() {
  if (!this.sizes || !this.sizes.length) return 0;
  return this.sizes.reduce((sum, item) => sum + (item.stock || 0), 0);
});

// Method to get localized name
productSchema.methods.getName = function(lang = 'en') {
  return (lang === 'ml' && this.name.ml) ? this.name.ml : this.name.en;
};

// Method to get localized description
productSchema.methods.getDescription = function(lang = 'en') {
  return (lang === 'ml' && this.description.ml) ? this.description.ml : this.description.en;
};

module.exports = mongoose.model('Product', productSchema);
