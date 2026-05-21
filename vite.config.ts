import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

let gitSha = 'dev';
let gitDate = new Date().toISOString();
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
  gitDate = execSync('git log -1 --format=%cI').toString().trim();
} catch {
  // Not a git repo (e.g. running outside source) — use defaults.
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

export default defineConfig({
  plugins: [react(), buildMetaPlugin()],
  base: './',
  define: {
    __BUILD_SHA__: JSON.stringify(gitSha),
    __BUILD_DATE__: JSON.stringify(gitDate),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
