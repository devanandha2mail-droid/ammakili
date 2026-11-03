const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../public/img/placeholders');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const templates = [
  { name: 'rose-garden-1.svg', c1: '#C0567B', c2: '#892245', title: 'Rose Garden View 1' },
  { name: 'rose-garden-2.svg', c1: '#892245', c2: '#C0567B', title: 'Rose Garden Fabric Close-up' },
  { name: 'rose-garden-3.svg', c1: '#DB9AAD', c2: '#892245', title: 'Rose Garden Drape' },
  { name: 'blush-cotton-1.svg', c1: '#D6879F', c2: '#DB9AAD', title: 'Blush Cotton Front' },
  { name: 'blush-cotton-2.svg', c1: '#DB9AAD', c2: '#C0567B', title: 'Blush Cotton Detail' },
  { name: 'velvet-evening-1.svg', c1: '#6d1a37', c2: '#892245', title: 'Velvet Evening Front' },
  { name: 'velvet-evening-2.svg', c1: '#892245', c2: '#6d1a37', title: 'Velvet Evening Neckline' },
  { name: 'petal-print-1.svg', c1: '#C0567B', c2: '#D6879F', title: 'Petal Print View' },
  { name: 'dusk-floral-1.svg', c1: '#892245', c2: '#D6879F', title: 'Dusk Floral View' },
  { name: 'cloud-soft-1.svg', c1: '#C0567B', c2: '#DB9AAD', title: 'Cloud Soft View' }
];

templates.forEach(t => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="100%" height="100%">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.c1}" />
      <stop offset="100%" stop-color="${t.c2}" />
    </linearGradient>
    <radialGradient id="shine" cx="30%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="600" height="750" fill="url(#grad)" rx="8" />
  <rect width="600" height="750" fill="url(#shine)" rx="8" />
  <g transform="translate(180, 180) scale(4)" fill="rgba(255, 255, 255, 0.88)">
    <path d="M22 4h16l3 14 6 6-5 8 9 60H9l9-60-5-8 6-6z"/>
  </g>
  <text x="300" y="660" font-family="'Jost', system-ui, sans-serif" font-size="19" font-weight="400" fill="#ffffff" letter-spacing="4" text-anchor="middle" opacity="0.9" text-transform="uppercase">${t.title}</text>
  <text x="300" y="690" font-family="'Cormorant Garamond', Georgia, serif" font-size="22" font-style="italic" fill="#ffffff" text-anchor="middle" opacity="0.75">Nest by Ammakkili</text>
</svg>`;

  fs.writeFileSync(path.join(dir, t.name), svg);
});

console.log('Generated placeholder SVGs successfully in', dir);

