const AdminAuditLog = require('../models/AdminAuditLog');

/**
 * Log sensitive administrative actions to MongoDB for 12-month retention
 */
async function logAdminAction({ req, action, target = '', details = {} }) {
  try {
    const adminEmail = (req && req.admin && req.admin.email) || (req && req.session && req.session.adminEmail) || 'system';
    const adminId = (req && req.admin && req.admin._id) || (req && req.session && req.session.adminId) || null;
    const rawIp = (req && (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip)) || '';
    const ip = String(rawIp).split(',')[0].trim();
    const userAgent = (req && req.get && req.get('user-agent')) || '';
    const requestId = (req && (req.id || req.headers['x-request-id'])) || '';

    // Sanitize details to never leak passwords, tokens, or credit cards
    const sanitizedDetails = { ...details };
    const forbiddenKeys = ['password', 'secret', 'token', 'key', 'signature', 'cookie', 'cvv', 'card'];
    for (const k of Object.keys(sanitizedDetails)) {
      if (forbiddenKeys.some(f => k.toLowerCase().includes(f))) {
        sanitizedDetails[k] = '[REDACTED]';
      }
    }

    await AdminAuditLog.create({
      adminEmail,
      adminId,
      action,
      target,
      details: sanitizedDetails,
      ip,
      userAgent,
      requestId
    });
  } catch (err) {
    console.error('Failed to write admin audit log:', err.message);
  }
}

module.exports = {
  logAdminAction
};

