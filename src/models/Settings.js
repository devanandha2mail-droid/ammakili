const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  shippingCharge: {
    type: Number,
    default: 60,
    min: 0
  },
  whatsappNumber: {
    type: String,
    default: '919876543210',
    trim: true
  },
  announcementText: {
    en: { type: String, default: 'Soft, breathable nighties crafted for restful comfort. Prepaid orders only.' },
    ml: { type: String, default: 'സുഖകരവും ഗുണമേന്മയുള്ളതുമായ നൈറ്റികൾ. പ്രീപെയ്ഡ് ഓർഡറുകൾ മാത്രം.' }
  },
  lowStockThreshold: {
    type: Number,
    default: 3,
    min: 1
  },
  social: {
    youtube: { type: String, default: 'https://www.youtube.com/@nestammakkili' },
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' }
  }
}, {
  timestamps: true
});

// Singleton helper
settingsSchema.statics.getSettings = async function() {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);

