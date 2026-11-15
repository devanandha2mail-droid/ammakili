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

module.exports = mongoose.model('AdminUser', adminUserSchema);
