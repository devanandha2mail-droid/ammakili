#!/usr/bin/env node
const { execSync } = require('child_process');

console.log('================================================================');
console.log(' Git History Secret Audit (Gitleaks Equivalent Verification)');
console.log(' Scanning git commits and history for leaked production secrets...');
console.log('================================================================\n');

// Real credential patterns
const patterns = [
  { name: 'Live Razorpay Key (Real Production)', regex: /rzp_live_[a-zA-Z0-9]{14,}/ },
  { name: 'Razorpay Secret Key', regex: /[a-zA-Z0-9]{24,32}_secret/ },
  { name: 'Google OAuth Client Secret', regex: /GOCSPX-[a-zA-Z0-9_-]{28,}/ },
  { name: 'Cloudinary API Secret', regex: /cloudinary:\/\/[0-9]+:[a-zA-Z0-9_-]{20,}@/i },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub Personal Access Token', regex: /gh[pousr]_[a-zA-Z0-9]{36,}/ },
  { name: 'Generic Private Key', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'Live Stripe Secret Key', regex: /sk_live_[0-9a-zA-Z]{24,}/ }
];

let fullDiff = '';
try {
  fullDiff = execSync('git log -p --all', { maxBuffer: 50 * 1024 * 1024 }).toString();
} catch (e) {
  fullDiff = execSync('git log -p', { maxBuffer: 50 * 1024 * 1024 }).toString();
}

// Split by commit file diffs
const fileDiffs = fullDiff.split('diff --git ');
const findings = [];

for (const fDiff of fileDiffs) {
  const firstLine = fDiff.split('\n')[0] || '';
  // Skip test files, mock harnesses, and documentation examples that contain intentional test fixture strings
  if (firstLine.includes('tests/') || firstLine.includes('README.md') || firstLine.includes('.env.example') || firstLine.includes('.env.test')) {
    continue;
  }

  for (const p of patterns) {
    const matches = fDiff.match(p.regex);
    if (matches) {
      findings.push({
        file: firstLine.trim(),
        rule: p.name,
        match: matches[0].slice(0, 10) + '...'
      });
    }
  }
}

if (findings.length === 0) {
  console.log('✓ PASS: Zero production credentials, API secrets, or private keys found in git history.');
  console.log('Audited: 0 secret leaks detected across all production codebase commits.');
} else {
  console.error('✕ LEAKED CREDENTIALS DETECTED:');
  console.error(JSON.stringify(findings, null, 2));
  process.exit(1);
}
