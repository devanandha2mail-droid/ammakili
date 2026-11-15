const AdminUser = require('../models/AdminUser');
const { logAdminAction } = require('../services/auditLogger');

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const FRESH_AUTH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * requireAdmin
 * Strict administrative session validation with idle and absolute timeout enforcement.
 */
const requireAdmin = async (req, res, next) => {
  if (!req.session || !req.session.adminId || req.session.isCustomerSession) {
    return res.redirect('/admin/login');
  }

  const now = Date.now();

  // 1. Check 30-minute idle timeout
  if (req.session.adminLastActiveAt && (now - req.session.adminLastActiveAt > IDLE_TIMEOUT_MS)) {
    req.session.destroy(() => {
      res.redirect('/admin/login?reason=idle_timeout');
    });
    return;
  }

  // 2. Check 8-hour absolute session lifetime
  if (req.session.adminSessionCreatedAt && (now - req.session.adminSessionCreatedAt > ABSOLUTE_TIMEOUT_MS)) {
    req.session.destroy(() => {
      res.redirect('/admin/login?reason=session_expired');
    });
    return;
  }

  try {
    const adminUser = await AdminUser.findById(req.session.adminId);
    if (!adminUser || !adminUser.active) {
      req.session.destroy(() => {
        res.redirect('/admin/login?reason=deactivated');
      });
      return;
    }

    // 3. Invalidate session if issued before sessionValidAfter (Sign Out Everywhere or Deactivated)
    if (adminUser.sessionValidAfter && req.session.adminSessionCreatedAt) {
      if (req.session.adminSessionCreatedAt < new Date(adminUser.sessionValidAfter).getTime()) {
        req.session.destroy(() => {
          res.redirect('/admin/login?reason=session_revoked');
        });
        return;
      }
    }

    // Bump idle timestamp
    req.session.adminLastActiveAt = now;

    req.admin = adminUser;
    res.locals.admin = adminUser;
    next();
  } catch (err) {
    console.error('Admin auth check failed:', err);
    res.redirect('/admin/login');
  }
};

/**
 * requireOwner
 * Gate owner-only operations (Settings, Refunds, User Management, Customer Data Export/Delete).
 */
const requireOwner = (req, res, next) => {
  if (!req.admin || req.admin.role !== 'owner') {
    return res.status(403).render('admin/forbidden', {
      layout: 'layouts/admin',
      title: 'Owner Access Required',
      message: 'This section requires Owner permissions. Please contact the store owner.'
    });
  }
  next();
};

/**
 * requireFreshAuth
 * Enforces fresh Google re-authentication within the past 5 minutes for sensitive operations.
 */
const requireFreshAuth = (req, res, next) => {
  const authTime = req.session && req.session.adminAuthTime ? req.session.adminAuthTime : 0;
  if (Date.now() - authTime > FRESH_AUTH_WINDOW_MS) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(403).json({
        error: {
          code: 'FRESH_AUTH_REQUIRED',
          message: 'Sensitive action requires fresh Google authentication within the last 5 minutes.'
        }
      });
    }

    req.session.adminReturnTo = req.originalUrl;
    return res.redirect('/admin/auth/google?prompt=select_account');
  }
  next();
};

const redirectIfAuthenticated = (req, res, next) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/admin');
  }
  next();
};

module.exports = {
  requireAdmin,
  requireOwner,
  requireFreshAuth,
  redirectIfAuthenticated
};
