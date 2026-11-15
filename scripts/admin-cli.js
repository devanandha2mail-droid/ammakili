#!/usr/bin/env node
/**
 * scripts/admin-cli.js
 *
 * Break-Glass Admin Access CLI
 * Operates directly on MongoDB from secure shell access only.
 * Logs all actions to AdminAuditLog.
 *
 * Usage:
 *   node scripts/admin-cli.js list
 *   node scripts/admin-cli.js grant <email> <role>
 *   node scripts/admin-cli.js revoke <email>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const AdminUser = require('../src/models/AdminUser');
const AdminAuditLog = require('../src/models/AdminAuditLog');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || !['list', 'grant', 'revoke'].includes(command)) {
    console.error('Usage:');
    console.error('  npm run admin:list');
    console.error('  npm run admin:grant -- <email> <owner|staff>');
    console.error('  npm run admin:revoke -- <email>');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nest_ammakkili';
  await mongoose.connect(mongoUri);

  try {
    if (command === 'list') {
      const users = await AdminUser.find().sort({ role: 1, email: 1 });
      console.log('\n========================================================================');
      console.log('                   Nest by Ammakkili - Admin Roster                     ');
      console.log('========================================================================');
      if (users.length === 0) {
        console.log('No admin users found in database.');
      } else {
        console.table(users.map(u => ({
          Email: u.email,
          Role: u.role,
          Active: u.active ? 'YES' : 'NO',
          'Google Sub': u.googleSub ? 'Bound' : 'Pending',
          '2SV Confirmed': u.confirmed2SV?.confirmed ? 'YES' : 'NO',
          'Last Login': u.lastLoginAt ? u.lastLoginAt.toISOString() : 'Never'
        })));
      }
      console.log('========================================================================\n');
    } else if (command === 'grant') {
      const email = (args[1] || '').trim().toLowerCase();
      const role = (args[2] || '').trim().toLowerCase();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        console.error('❌ Error: A valid email address is required.');
        process.exit(1);
      }

      if (!['owner', 'staff'].includes(role)) {
        console.error('❌ Error: Role must be either "owner" or "staff".');
        process.exit(1);
      }

      let user = await AdminUser.findOne({ email });
      if (user) {
        user.role = role;
        user.active = true;
        await user.save();
        console.log(`✓ Admin user "${email}" updated: Role=${role}, Active=true.`);
      } else {
        user = await AdminUser.create({
          email,
          role,
          active: true,
          createdBy: 'cli-break-glass'
        });
        console.log(`✓ New admin user "${email}" created: Role=${role}, Active=true.`);
      }

      await AdminAuditLog.create({
        adminEmail: 'cli-break-glass',
        action: 'CLI_ADMIN_GRANTED',
        target: email,
        details: { role, active: true },
        ip: '127.0.0.1'
      });
    } else if (command === 'revoke') {
      const email = (args[1] || '').trim().toLowerCase();
      if (!email) {
        console.error('❌ Error: An email address is required.');
        process.exit(1);
      }

      const user = await AdminUser.findOne({ email });
      if (!user) {
        console.error(`❌ Error: Admin user "${email}" not found.`);
        process.exit(1);
      }

      if (user.role === 'owner' && user.active) {
        const activeOwners = await AdminUser.countDocuments({ role: 'owner', active: true });
        if (activeOwners <= 1) {
          console.error(`❌ Error: Cannot revoke "${email}". It is the last active Owner account!`);
          process.exit(1);
        }
      }

      user.active = false;
      user.sessionValidAfter = new Date();
      await user.save();

      await AdminAuditLog.create({
        adminEmail: 'cli-break-glass',
        action: 'CLI_ADMIN_REVOKED',
        target: email,
        details: { previousRole: user.role },
        ip: '127.0.0.1'
      });

      console.log(`✓ Admin user "${email}" has been deactivated and active sessions invalidated.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Admin CLI fatal error:', err);
    process.exit(1);
  });
}

