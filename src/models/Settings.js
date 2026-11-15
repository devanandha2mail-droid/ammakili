const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // Business Identification
  legalBusinessName: {
    type: String,
    default: '',
    trim: true
  },
  tradeName: {
    type: String,
    default: 'Nest by Ammakkili',
    trim: true
  },
  registeredAddress: {
    type: String,
    default: '',
    trim: true
  },
  operatingAddress: {
    type: String,
    default: '',
    trim: true
  },
  contactEmail: {
    type: String,
    default: '',
    trim: true,
    lowercase: true
  },
  contactPhone: {
    type: String,
    default: '',
    trim: true
  },
  whatsappNumber: {
    type: String,
    default: '919876543210',
    trim: true
  },
  gstin: {
    type: String,
    default: '',
    trim: true
  },
  businessHours: {
    type: String,
    default: 'Monday – Saturday: 9:00 AM – 6:00 PM IST',
    trim: true
  },

  // Grievance Redressal Officer
  grievanceOfficer: {
    name: { type: String, default: '', trim: true },
    designation: { type: String, default: 'Grievance Officer', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true }
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
    default: 5,
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
