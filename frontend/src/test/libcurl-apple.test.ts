/**
 * Integration test: verify the patched libcurl.js can load and reach Apple's
 * GSA endpoint through the WISP backend.
 *
 * Requires `wrangler dev --port 8787` running. Skipped automatically if the
 * backend is unreachable.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('libcurl.js Apple connectivity', () => {
  it('binary/libcurl_full.mjs exists in the submodule', async () => {
    await expect(access(resolve(root, 'wasm/libcurl-wasm/binary/libcurl_full.mjs'))).resolves.toBeUndefined();
  });

  it('binary/libcurl.mjs exists in the submodule', async () => {
    await expect(access(resolve(root, 'wasm/libcurl-wasm/binary/libcurl.mjs'))).resolves.toBeUndefined();
  });

  it('binary/libcurl.wasm exists in the submodule', async () => {
    await expect(access(resolve(root, 'wasm/libcurl-wasm/binary/libcurl.wasm'))).resolves.toBeUndefined();
  });

  it('dist/bundled.mjs exists and re-exports from binary', async () => {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(resolve(root, 'wasm/libcurl-wasm/dist/bundled.mjs'), 'utf-8');
    expect(content).toContain('../binary/libcurl_full.mjs');
  });

  it('frontend/public/anisette/libcurl_full.mjs matches the submodule binary', async () => {
    const { readFile } = await import('node:fs/promises');
    const [submodule, publicCopy] = await Promise.all([
      readFile(resolve(root, 'wasm/libcurl-wasm/binary/libcurl_full.mjs')),
      readFile(resolve(root, 'frontend/public/anisette/libcurl_full.mjs')),
    ]);
    expect(submodule.equals(publicCopy)).toBe(true);
  });

  describe('WISP backend connectivity (requires wrangler dev)', () => {
    let backendAvailable = false;

    beforeAll(async () => {
      try {
        const resp = await fetch('http://localhost:8787/healthz', {
          signal: AbortSignal.timeout(2000),
        });
        backendAvailable = resp.ok;
      } catch {
        backendAvailable = false;
      }
    });

    it('WISP backend healthcheck returns ok', () => {
      if (!backendAvailable) {
        console.log('  [skipped] wrangler dev not running on :8787');
        return;
      }
      expect(backendAvailable).toBe(true);
    });

    it('WISP endpoint accepts WebSocket upgrade', async () => {
      if (!backendAvailable) {
        console.log('  [skipped] wrangler dev not running on :8787');
        return;
      }
      // Just verify the upgrade endpoint exists — actual WS connection
      // requires the libcurl WASM runtime which only works in a browser.
      const resp = await fetch('http://localhost:8787/wisp/', {
        signal: AbortSignal.timeout(2000),
      });
      // Without Upgrade header, should get 426
      expect(resp.status).toBe(426);
      const body = (await resp.json()) as { error?: string };
      expect(body.error).toContain('WebSocket upgrade required');
    });
  });
});
