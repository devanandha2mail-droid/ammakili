const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  event: {
    type: String,
    required: true,
    trim: true
  },
  receivedAt: {
    type: Date,
    default: Date.now,
    expires: 30 * 24 * 60 * 60 // Automatic MongoDB TTL cleanup after 30 days
  }
});

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);

