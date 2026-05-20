// Copies @ffmpeg/core UMD distribution files into public/ffmpeg/ so they are
// served from the same origin as the SPA. Avoids CORS issues and removes the
// runtime dependency on unpkg.com.

const fs = require('node:fs');
const path = require('node:path');

const SRC_DIR = path.join(
  __dirname,
  '..',
  'node_modules',
  '@ffmpeg',
  'core',
  'dist',
  'umd'
);
const DEST_DIR = path.join(__dirname, '..', 'public', 'ffmpeg');

const FILES = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

if (!fs.existsSync(SRC_DIR)) {
  console.error(`[copy-ffmpeg] Source missing: ${SRC_DIR}`);
  console.error('Run `npm install` first.');
  process.exit(1);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

let copied = 0;
for (const f of FILES) {
  const src = path.join(SRC_DIR, f);
  const dest = path.join(DEST_DIR, f);
  if (!fs.existsSync(src)) {
    console.error(`[copy-ffmpeg] Missing: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(2);
  console.log(`[copy-ffmpeg] ${f} → public/ffmpeg/ (${size} MB)`);
  copied++;
}
console.log(`[copy-ffmpeg] Done (${copied} file(s)).`);
