import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      webmuxd: resolve(frontendDir, 'src/webmuxd-browser.js'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
    server: {
      deps: {
        // The anisette / apple-signing / wasm modules pull huge native/WASM
        // code. Tests mock them; excluding here prevents Vite from crawling.
        inline: [],
      },
    },
  },
});
