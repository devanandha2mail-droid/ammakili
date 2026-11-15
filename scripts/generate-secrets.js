#!/usr/bin/env node
const crypto = require('crypto');

function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

console.log('================================================================');
console.log(' Nest by Ammakkili - Cryptographically Secure Secrets Generator');
console.log(' 256-bit high-entropy random keys for production deployment');
console.log('================================================================\n');

console.log('# Copy and paste these into your production environment or .env file:');
console.log(`SESSION_SECRET=${generateSecret(32)}`);
console.log(`COOKIE_SECRET=${generateSecret(32)}`);
console.log(`ADMIN_SESSION_SECRET=${generateSecret(32)}`);
console.log(`STYLIST_KEY=${generateSecret(32)}`);
console.log(`WEBHOOK_SECRET=${generateSecret(32)}`);
console.log('\n# Note: Keep these secrets confidential. Never commit them to source control.');

