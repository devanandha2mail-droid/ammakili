const Admin = require('../models/Admin');

const requireAdmin = async (req, res, next) => {
  if (!req.session || !req.session.adminId) {
    return res.redirect('/admin/login');
  }

  try {
    const admin = await Admin.findById(req.session.adminId).select('-passwordHash');
    if (!admin) {
      req.session.destroy();
      return res.redirect('/admin/login');
    }
    req.admin = admin;
    res.locals.admin = admin;
    next();
  } catch (err) {
    console.error('Admin auth check failed:', err);
    res.redirect('/admin/login');
  }
};

const redirectIfAuthenticated = (req, res, next) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/admin');
  }
  next();
};

module.exports = {
  requireAdmin,
  redirectIfAuthenticated
};
