// Copies ffmpeg.wasm cores from node_modules into public/ so they are served
// same-origin (required by COEP and by the worker's dynamic import()).
//
// - public/ffmpeg    → multithreaded core (needs SharedArrayBuffer, i.e.
//                      crossOriginIsolated via COOP/COEP headers). ~4x faster.
// - public/ffmpeg-st → single-threaded fallback for browsers/environments
//                      where isolation is unavailable.
//
// Both are the ESM builds — @ffmpeg/ffmpeg's worker loads the core via
// dynamic import(), which only works with an ES module.

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function copyCore(pkgDir, files, destDir) {
  const src = path.join(root, 'node_modules', '@ffmpeg', pkgDir, 'dist', 'esm');
  if (!fs.existsSync(src)) {
    console.error(`[copy-ffmpeg] Source missing: ${src} — run npm install`);
    process.exit(1);
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of files) {
    const from = path.join(src, f);
    const to = path.join(destDir, f);
    if (!fs.existsSync(from)) {
      console.error(`[copy-ffmpeg] Missing file: ${from}`);
      process.exit(1);
    }
    fs.copyFileSync(from, to);
    const mb = (fs.statSync(to).size / 1024 / 1024).toFixed(2);
    console.log(`[copy-ffmpeg] ${pkgDir}/${f} → ${path.relative(root, to)} (${mb} MB)`);
  }
}

copyCore(
  'core-mt',
  ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'],
  path.join(root, 'public', 'ffmpeg')
);
copyCore(
  'core',
  ['ffmpeg-core.js', 'ffmpeg-core.wasm'],
  path.join(root, 'public', 'ffmpeg-st')
);

console.log('[copy-ffmpeg] Done.');
