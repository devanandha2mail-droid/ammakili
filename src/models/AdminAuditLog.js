const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema({
  adminEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
    default: null
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  target: {
    type: String,
    default: ''
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ip: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  requestId: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // 12-month statutory retention
    expires: 365 * 24 * 60 * 60
  }
});

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);

