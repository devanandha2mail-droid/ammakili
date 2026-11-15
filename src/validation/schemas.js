const { z } = require('zod');

// 1. Checkout Create Schema
const checkoutCreateSchema = z.object({
  customer: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().min(10).max(15),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().min(1).max(300).optional(),
    addr: z.string().min(1).max(300).optional(),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100).optional(),
    pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits')
  }).passthrough(),
  items: z.array(z.object({
    productId: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    size: z.enum(['M', 'L', 'XL', 'XXL', '3XL']),
    quantity: z.number().int().min(1).max(10).optional(),
    qty: z.number().int().min(1).max(10).optional(),
    name: z.any().optional(),
    price: z.number().optional(),
    image: z.string().optional()
  }).passthrough()).min(1).max(20),
  agreeNoReturns: z.boolean().optional(),
  saveAddress: z.boolean().optional(),
  addressLabel: z.string().max(100).optional(),
  _csrf: z.string().optional()
}).passthrough();

// 2. Checkout Verify Schema
const checkoutVerifySchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
  orderId: z.string().optional(),
  _csrf: z.string().optional()
}).passthrough();

// 3. Checkout Cancel Schema
const checkoutCancelSchema = z.object({
  orderId: z.string().min(1).max(100),
  orderToken: z.string().min(1).max(200),
  reason: z.string().max(200).optional(),
  _csrf: z.string().optional()
}).passthrough();

// 4. Cart Validate Schema
const cartValidateSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    size: z.enum(['M', 'L', 'XL', 'XXL', '3XL']),
    quantity: z.number().int().min(1).max(10).optional(),
    qty: z.number().int().min(1).max(10).optional()
  }).passthrough()).max(50),
  _csrf: z.string().optional()
}).passthrough();

// 5. Track Order Schema
const trackOrderSchema = z.object({
  orderId: z.string().min(1).max(50),
  phone: z.string().min(5).max(20),
  _csrf: z.string().optional()
}).strict();

// 6. Wishlist Sync Schema
const wishlistSyncSchema = z.object({
  items: z.array(z.string().min(1)).max(100),
  _csrf: z.string().optional()
}).strict();

// 7. Admin Add User Schema
const adminAddUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'staff']),
  _csrf: z.string().optional()
}).strict();

// 8. Admin Toggle Role Schema
const adminToggleRoleSchema = z.object({
  role: z.enum(['owner', 'staff']),
  _csrf: z.string().optional()
}).strict();

module.exports = {
  checkoutCreateSchema,
  checkoutVerifySchema,
  checkoutCancelSchema,
  cartValidateSchema,
  trackOrderSchema,
  wishlistSyncSchema,
  adminAddUserSchema,
  adminToggleRoleSchema
};

