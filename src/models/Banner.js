const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  text: {
    en: { type: String, required: true, trim: true },
    ml: { type: String, default: '', trim: true }
  },
  link: {
    type: String,
    default: '/shop',
    trim: true
  },
  active: {
    type: Boolean,
    default: true
  },
  startsAt: {
    type: Date,
    default: Date.now
  },
  endsAt: {
    type: Date
  }
}, {
  timestamps: true
});

bannerSchema.methods.getText = function(lang = 'en') {
  return (lang === 'ml' && this.text.ml) ? this.text.ml : this.text.en;
};

module.exports = mongoose.model('Banner', bannerSchema);

