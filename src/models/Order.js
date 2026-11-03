const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  size: {
    type: String,
    required: true,
    enum: ['M', 'L', 'XL', 'XXL', '3XL']
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  image: {
    type: String,
    default: ''
  }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  items: [orderItemSchema],
  customer: {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, default: 'Kerala', trim: true },
    pin: { type: String, required: true, trim: true }
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  shipping: {
    type: Number,
    required: true,
    min: 0,
    default: 60
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending_payment', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'failed'],
    default: 'pending_payment',
    index: true
  },
  payment: {
    razorpayOrderId: { type: String, default: '', index: true },
    razorpayPaymentId: { type: String, default: '', index: true },
    razorpaySignature: { type: String, default: '' },
    status: { type: String, default: 'pending' },
    method: { type: String, default: 'Online' }
  },
  tracking: {
    courier: { type: String, default: '' },
    trackingId: { type: String, default: '' }
  },
  adminNotes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
