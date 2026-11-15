const mongoose = require('mongoose');

const photoJobSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null,
    index: true
  },
  draftId: {
    type: String,
    default: null,
    index: true
  },
  sourceKey: {
    type: String,
    required: true
  },
  originalUrl: {
    type: String,
    required: true
  },
  options: {
    mode: {
      type: String,
      enum: ['auto', 'hanging', 'flat', 'worn'],
      default: 'auto'
    },
    hanger: {
      type: String,
      enum: ['auto', 'yes', 'no'],
      default: 'auto'
    },
    background: {
      type: String,
      enum: ['pink', 'cream', 'white'],
      default: 'pink'
    }
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'done', 'failed'],
    default: 'queued',
    index: true
  },
  resultKey: {
    type: String,
    default: null
  },
  detailKey: {
    type: String,
    default: null
  },
  styled_ok: {
    type: Boolean,
    default: true
  },
  mode_used: {
    type: String,
    default: null
  },
  variants: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  error: {
    type: String,
    default: null
  },
  startedAt: {
    type: Date,
    default: null
  },
  finishedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PhotoJob', photoJobSchema);

