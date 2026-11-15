const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

test.describe('Production Safety & Artifact Purity Verification', () => {
  test('Production codebase and bundle contain no test harness routes, mock modals, or test flags', () => {
    const forbiddenPatterns = [
      '__test',
      'razorpay-mock-modal',
      'ALLOW_TEST_HARNESS',
      'mock_test_signature'
    ];

    const prodDirs = ['src', 'public', 'scripts'];
    const matchedFiles = [];

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          // Check text files
          if (/\.(js|ejs|html|json|css|svg)$/i.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const pattern of forbiddenPatterns) {
              if (content.includes(pattern)) {
                matchedFiles.push({ file: fullPath, pattern });
              }
            }
          }
        }
      }
    }

    for (const d of prodDirs) {
      const absDir = path.join(__dirname, '../../', d);
      if (fs.existsSync(absDir)) {
        scanDir(absDir);
      }
    }

    expect(matchedFiles).toEqual([]);
  });

  test('Docker configuration strictly excludes tests, test fixtures, and client product photos', () => {
    const dockerignorePath = path.join(__dirname, '../../.dockerignore');
    expect(fs.existsSync(dockerignorePath)).toBe(true);

    const dockerignore = fs.readFileSync(dockerignorePath, 'utf8');
    expect(dockerignore).toContain('**/tests');
    expect(dockerignore).toContain('**/fixtures');
    expect(dockerignore).toContain('**/samples');
    expect(dockerignore).toContain('.env*');

    // If docker daemon is available, execute container build and inspect
    let hasDocker = false;
    try {
      execSync('docker --version', { stdio: 'ignore' });
      hasDocker = true;
    } catch (e) {
      hasDocker = false;
    }

    if (hasDocker) {
      console.log('Running docker build verification...');
      execSync('docker build -t nest-web-test .', { stdio: 'inherit' });
      const jpegFiles = execSync('docker run --rm nest-web-test find /app -name "*.jpeg"').toString().trim();
      expect(jpegFiles).toBe('');

      for (const pattern of ['__test', 'razorpay-mock-modal', 'ALLOW_TEST_HARNESS', 'mock_test_signature']) {
        let found = '';
        try {
          found = execSync(`docker run --rm nest-web-test grep -rn "${pattern}" /app/src /app/public /app/scripts`).toString().trim();
        } catch (grepErr) {
          found = '';
        }
        expect(found).toBe('');
      }
    }
  });
});

