const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  googleSub: {
    type: String,
    default: null,
    sparse: true,
    index: true
  },
  role: {
    type: String,
    enum: ['owner', 'staff'],
    default: 'staff',
    required: true
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  },
  twoStepConfirmedAt: {
    type: Date,
    default: null
  },
  twoStepConfirmedBy: {
    type: String,
    default: null
  },
  confirmed2SV: {
    confirmed: {
      type: Boolean,
      default: false
    },
    confirmedAt: {
      type: Date,
      default: null
    },
    confirmedBy: {
      type: String,
      default: null
    }
  },
  createdBy: {
    type: String,
    default: 'system'
  },
  sessionValidAfter: {
    type: Date,
    default: Date.now
  },
  lastLoginAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

adminUserSchema.pre('save', function () {
  if (this.twoStepConfirmedAt) {
    if (!this.confirmed2SV) this.confirmed2SV = {};
    this.confirmed2SV.confirmed = true;
    this.confirmed2SV.confirmedAt = this.twoStepConfirmedAt;
    this.confirmed2SV.confirmedBy = this.twoStepConfirmedBy;
  } else if (this.confirmed2SV && this.confirmed2SV.confirmed) {
    this.twoStepConfirmedAt = this.confirmed2SV.confirmedAt || new Date();
    this.twoStepConfirmedBy = this.confirmed2SV.confirmedBy;
  }
});

module.exports = mongoose.model('AdminUser', adminUserSchema);
