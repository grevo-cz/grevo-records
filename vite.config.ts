import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Build metadata — prefer env vars (set in Docker / CI), fall back to git.
let gitSha = process.env.BUILD_SHA || 'dev';
let gitDate = process.env.BUILD_DATE || new Date().toISOString();
if (gitSha === 'dev') {
  try {
    gitSha = execSync('git rev-parse --short HEAD').toString().trim();
    gitDate = execSync('git log -1 --format=%cI').toString().trim();
  } catch {
    // Not a git repo and no env var — use defaults.
  }
}

// Inject build SHA / date into index.html as <meta> tags so the runtime
// can fetch / and compare with the loaded build (for live update detection).
function buildMetaPlugin(): Plugin {
  return {
    name: 'records-build-meta',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const tags = [
          `<meta name="build-sha" content="${gitSha}">`,
          `<meta name="build-date" content="${gitDate}">`,
        ].join('\n    ');
        return html.replace('</head>', `    ${tags}\n  </head>`);
      },
    },
  };
}

// COOP/COEP enable SharedArrayBuffer for the multithreaded ffmpeg.wasm core.
// `credentialless` (instead of `require-corp`) keeps cross-origin fetches
// (e.g. Bunny CDN links, unpkg) loadable; browsers without support fall back
// to the single-threaded core at runtime.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [react(), buildMetaPlugin()],
  base: './',
  optimizeDeps: {
    // Vite pre-bundling breaks @ffmpeg/ffmpeg's internal worker resolution.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  define: {
    __BUILD_SHA__: JSON.stringify(gitSha),
    __BUILD_DATE__: JSON.stringify(gitDate),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // v2: bust every cached asset URL. Browsers cached the ffmpeg class
        // worker chunk (same content hash across builds) from before COEP
        // headers existed — immutable+1y means they never revalidate, and a
        // COEP-less cached worker script is refused by the isolated document.
        entryFileNames: 'assets/v2/[name]-[hash].js',
        chunkFileNames: 'assets/v2/[name]-[hash].js',
        assetFileNames: 'assets/v2/[name]-[hash][extname]',
      },
    },
  },
  worker: {
    // The ffmpeg class worker is emitted through this separate pipeline —
    // it MUST move to v2 too (it's the chunk browsers cached without COEP).
    rollupOptions: {
      output: {
        entryFileNames: 'assets/v2/[name]-[hash].js',
        chunkFileNames: 'assets/v2/[name]-[hash].js',
        assetFileNames: 'assets/v2/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    headers: crossOriginIsolation,
  },
  preview: {
    headers: crossOriginIsolation,
  },
});
