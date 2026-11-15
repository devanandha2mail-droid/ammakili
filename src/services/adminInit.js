const AdminUser = require('../models/AdminUser');

/**
 * Ensures at least one owner exists on application startup.
 * Seeds the initial owner account from the ADMIN_OWNER_EMAIL environment variable
 * if and only if no owner accounts currently exist in the database.
 */
async function ensureInitialOwner() {
  try {
    const ownerCount = await AdminUser.countDocuments({ role: 'owner' });
    if (ownerCount === 0) {
      const ownerEmail = (process.env.ADMIN_OWNER_EMAIL || '').trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (ownerEmail && emailRegex.test(ownerEmail)) {
        await AdminUser.findOneAndUpdate(
          { email: ownerEmail },
          {
            email: ownerEmail,
            role: 'owner',
            active: true,
            createdBy: 'system:startup'
          },
          { upsert: true, returnDocument: 'after' }
        );
        console.log(`[Admin Init] Initial store owner initialized from ADMIN_OWNER_EMAIL.`);
      } else {
        console.warn(`[Admin Init] Warning: No owner exists in database and ADMIN_OWNER_EMAIL is not set.`);
      }
    }
  } catch (err) {
    console.error('[Admin Init] Error ensuring initial owner:', err.message);
  }
}

module.exports = { ensureInitialOwner };

