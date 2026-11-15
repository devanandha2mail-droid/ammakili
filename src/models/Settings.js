const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // Business Identification
  legalBusinessName: {
    type: String,
    default: 'Nest by Ammakkili Apparel',
    trim: true
  },
  tradeName: {
    type: String,
    default: 'Nest by Ammakkili',
    trim: true
  },
  registeredAddress: {
    type: String,
    default: 'Building 4B, Palace Road, Thrissur, Kerala - 680001, India',
    trim: true
  },
  operatingAddress: {
    type: String,
    default: 'Building 4B, Palace Road, Thrissur, Kerala - 680001, India',
    trim: true
  },
  contactEmail: {
    type: String,
    default: 'care@nestammakkili.com',
    trim: true,
    lowercase: true
  },
  contactPhone: {
    type: String,
    default: '+91 98460 12345',
    trim: true
  },
  whatsappNumber: {
    type: String,
    default: '919846012345',
    trim: true
  },
  gstin: {
    type: String,
    default: '',
    trim: true
  },
  businessHours: {
    type: String,
    default: 'Monday to Saturday, 9:00 AM – 6:00 PM IST',
    trim: true
  },

  // Grievance Redressal Officer
  grievanceOfficer: {
    name: { type: String, default: 'Devanandha K. M.', trim: true },
    designation: { type: String, default: 'Grievance Redressal Officer', trim: true },
    email: { type: String, default: 'grievance@nestammakkili.com', trim: true, lowercase: true },
    phone: { type: String, default: '+91 98460 12345', trim: true }
  },

  // Shipping & Delivery
  shippingCharge: {
    type: Number,
    default: 60,
    min: 0
  },
  minDeliveryDays: {
    type: Number,
    default: 3,
    min: 1
  },
  maxDeliveryDays: {
    type: Number,
    default: 7,
    min: 1
  },

  // Refund & Retention
  refundTimelineDays: {
    type: Number,
    default: 7,
    min: 1
  },
  orderRetentionYears: {
    type: Number,
    default: 8,
    min: 1
  },

  // Legal Pages Client Confirmation Status (Banner in Admin)
  legalPagesConfirmed: {
    type: Boolean,
    default: false
  },
  legalPagesConfirmedAt: {
    type: Date,
    default: null
  },
  legalPagesConfirmedBy: {
    type: String,
    default: null
  },

  // Operations Tracking for Launch Checklist
  lastReconciliationAt: {
    type: Date,
    default: null
  },
  lastBackupAt: {
    type: Date,
    default: null
  },

  // Storefront & Stock Settings
  announcementText: {
    en: { type: String, default: 'Soft, breathable nighties crafted for restful comfort. Prepaid orders only • Flat ₹60 shipping.' },
    ml: { type: String, default: 'സുഖകരവും ഗുണമേന്മയുള്ളതുമായ നൈറ്റികൾ. പ്രീപെയ്ഡ് ഓർഡറുകൾ മാത്രം • ഷിപ്പിംഗ് ₹60.' }
  },
  lowStockThreshold: {
    type: Number,
    default: 3,
    min: 1
  },
  social: {
    youtube: { type: String, default: 'https://www.youtube.com/@nestammakkili' },
    instagram: { type: String, default: 'https://instagram.com/nestammakkili' },
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
