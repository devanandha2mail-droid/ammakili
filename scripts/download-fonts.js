const fs = require('fs');
const path = require('path');

const fontsDir = path.join(__dirname, '../public/fonts');
const cssPath = path.join(__dirname, '../public/css/fonts.css');

if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500;600&family=Noto+Sans+Malayalam:wght@400;500&family=Noto+Serif+Malayalam:wght@400;500&display=swap';

async function download() {
  console.log('Fetching Google Fonts CSS...');
  const res = await fetch(GOOGLE_FONTS_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const rawCss = await res.text();

  // Split into @font-face blocks
  const blocks = rawCss.split(/(?=@font-face)/g);
  console.log(`Parsed ${blocks.length} font-face blocks.`);

  let localCss = '/* Self-hosted fonts with font-display: swap */\n\n';
  let downloadedCount = 0;

  for (const block of blocks) {
    if (!block.includes('@font-face')) continue;

    // Determine subset from comment preceding block if any
    const subsetMatch = block.match(/\/\*\s*([a-z0-9-]+)\s*\*\//i);
    const subset = subsetMatch ? subsetMatch[1].toLowerCase() : 'all';

    // Only keep latin, latin-ext, or malayalam
    if (!['latin', 'latin-ext', 'malayalam'].includes(subset)) {
      continue;
    }

    const familyMatch = block.match(/font-family:\s*'([^']+)'/);
    const styleMatch = block.match(/font-style:\s*([^;]+);/);
    const weightMatch = block.match(/font-weight:\s*([^;]+);/);
    const unicodeMatch = block.match(/unicode-range:\s*([^;]+);/);
    const urlMatch = block.match(/src:\s*url\((https:\/\/[^)]+\.woff2)\)/);

    if (!familyMatch || !urlMatch) continue;

    const family = familyMatch[1];
    const style = styleMatch ? styleMatch[1].trim() : 'normal';
    const weight = weightMatch ? weightMatch[1].trim() : '400';
    const remoteUrl = urlMatch[1];
    const unicodeRange = unicodeMatch ? unicodeMatch[1].trim() : '';

    const slugFamily = family.toLowerCase().replace(/\s+/g, '-');
    const filename = `${slugFamily}-${style}-${weight}-${subset}.woff2`;
    const localFilePath = path.join(fontsDir, filename);

    if (!fs.existsSync(localFilePath)) {
      console.log(`Downloading ${filename} from ${remoteUrl}...`);
      const fontRes = await fetch(remoteUrl);
      const buffer = Buffer.from(await fontRes.arrayBuffer());
      fs.writeFileSync(localFilePath, buffer);
    }
    downloadedCount++;

    localCss += `@font-face {\n`;
    localCss += `  font-family: '${family}';\n`;
    localCss += `  font-style: ${style};\n`;
    localCss += `  font-weight: ${weight};\n`;
    localCss += `  font-display: swap;\n`;
    localCss += `  src: url('/fonts/${filename}') format('woff2');\n`;
    if (unicodeRange) {
      localCss += `  unicode-range: ${unicodeRange};\n`;
    }
    localCss += `}\n\n`;
  }

  fs.writeFileSync(cssPath, localCss.trim() + '\n', 'utf8');
  console.log(`✓ Saved ${downloadedCount} WOFF2 fonts to public/fonts/`);
  console.log(`✓ Generated ${cssPath}`);
}

download().catch(err => {
  console.error('Font download error:', err);
  process.exit(1);
});

