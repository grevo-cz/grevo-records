import { defineConfig } from 'vite';
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

export default defineConfig({
  plugins: [react()],
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
