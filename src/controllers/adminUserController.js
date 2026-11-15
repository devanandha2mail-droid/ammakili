const AdminUser = require('../models/AdminUser');
const AdminAuditLog = require('../models/AdminAuditLog');
const { logAdminAction } = require('../services/auditLogger');

/**
 * Admin User Management Controller (Owner Only)
 */

// 1. GET /admin/users
exports.getUsers = async (req, res, next) => {
  try {
    const users = await AdminUser.find().sort({ role: 1, email: 1 });
    const { success, error } = req.query;

    let alert = null;
    if (success === 'added') alert = { type: 'ok', msg: 'Admin user added successfully.' };
    else if (error === 'cannot_deactivate_last_owner') alert = { type: 'bad', msg: 'Cannot deactivate the last active owner account.' };
    else if (error === 'cannot_demote_last_owner') alert = { type: 'bad', msg: 'Cannot demote the last active owner account.' };
    else if (error === 'exists') alert = { type: 'bad', msg: 'An admin user with this email already exists.' };
    else if (error === 'invalid_email') alert = { type: 'bad', msg: 'Please enter a valid email address.' };

    res.render('admin/users', {
      layout: 'layouts/admin',
      title: 'Admin Team & Access Control',
      users,
      currentUser: req.admin,
      alert
    });
  } catch (err) {
    next(err);
  }
};

// 2. POST /admin/users/add
exports.postAddUser = async (req, res, next) => {
  try {
    const { email, role } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      return res.redirect('/admin/users?error=invalid_email');
    }

    const assignedRole = role === 'owner' ? 'owner' : 'staff';

    const existing = await AdminUser.findOne({ email: normalizedEmail });
    if (existing) {
      return res.redirect('/admin/users?error=exists');
    }

    const newUser = await AdminUser.create({
      email: normalizedEmail,
      role: assignedRole,
      active: true,
      createdBy: req.admin.email
    });

    await logAdminAction({
      req,
      action: 'ADMIN_USER_ADDED',
      target: normalizedEmail,
      details: { role: assignedRole, id: newUser._id }
    });

    res.redirect('/admin/users?success=added');
  } catch (err) {
    next(err);
  }
};

// 3. POST /admin/users/toggle-active/:id
exports.postToggleActive = async (req, res, next) => {
  try {
    const { id } = req.params;
    const targetUser = await AdminUser.findById(id);

    if (!targetUser) {
      return res.redirect('/admin/users');
    }

    // Safety rule: Last active owner cannot be deactivated
    if (targetUser.role === 'owner' && targetUser.active) {
      const activeOwnerCount = await AdminUser.countDocuments({ role: 'owner', active: true });
      if (activeOwnerCount <= 1) {
        return res.redirect('/admin/users?error=cannot_deactivate_last_owner');
      }
    }

    targetUser.active = !targetUser.active;
    if (!targetUser.active) {
      targetUser.sessionValidAfter = new Date();
    }
    await targetUser.save();

    await logAdminAction({
      req,
      action: targetUser.active ? 'ADMIN_USER_ACTIVATED' : 'ADMIN_USER_DEACTIVATED',
      target: targetUser.email,
      details: { id: targetUser._id }
    });

    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
};

// 4. POST /admin/users/toggle-role/:id
exports.postToggleRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const newRole = role === 'owner' ? 'owner' : 'staff';

    const targetUser = await AdminUser.findById(id);
    if (!targetUser) {
      return res.redirect('/admin/users');
    }

    // Safety rule: Last active owner cannot be demoted to staff
    if (targetUser.role === 'owner' && newRole === 'staff' && targetUser.active) {
      const activeOwnerCount = await AdminUser.countDocuments({ role: 'owner', active: true });
      if (activeOwnerCount <= 1) {
        return res.redirect('/admin/users?error=cannot_demote_last_owner');
      }
    }

    targetUser.role = newRole;
    await targetUser.save();

    await logAdminAction({
      req,
      action: 'ADMIN_USER_ROLE_CHANGED',
      target: targetUser.email,
      details: { newRole }
    });

    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
};

// 5. POST /admin/users/confirm-2sv/:id
exports.postConfirm2SV = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { confirmed } = req.body;
    const isConfirmed = confirmed === 'true' || confirmed === true;

    const targetUser = await AdminUser.findById(id);
    if (!targetUser) {
      return res.redirect('/admin/users');
    }

    targetUser.confirmed2SV = {
      confirmed: isConfirmed,
      confirmedAt: isConfirmed ? new Date() : null,
      confirmedBy: isConfirmed ? req.admin.email : null
    };
    await targetUser.save();

    await logAdminAction({
      req,
      action: 'ADMIN_2SV_CONFIRMATION_UPDATED',
      target: targetUser.email,
      details: { confirmed: isConfirmed }
    });

    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
};

// 6. GET /admin/audit-logs
exports.getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AdminAuditLog.find().sort({ createdAt: -1 }).limit(100);
    res.render('admin/audit-logs', {
      layout: 'layouts/admin',
      title: 'Admin Audit Logs (12-Month Retention)',
      logs
    });
  } catch (err) {
    next(err);
  }
};

