import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = dirname(fileURLToPath(import.meta.url));
const repoRootDir = resolve(frontendDir, '..');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      allow: [repoRootDir],
    },
    proxy: {
      '/wisp': { target: 'ws://localhost:8787', ws: true },
    },
  },
  resolve: {
    alias: {
      webmuxd: resolve(frontendDir, 'src/webmuxd-browser.js'),
    },
  },
  optimizeDeps: {
    include: ['jszip', 'node-forge', 'fflate'],
    exclude: [
      'altsign.js',
      '@lbr77/anisette-js',
      '@lbr77/anisette-js/browser',
      '@lbr77/zsign-wasm-resigner-wrapper',
      'libcurl.js',
      'libcurl.js/bundled',
    ],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
