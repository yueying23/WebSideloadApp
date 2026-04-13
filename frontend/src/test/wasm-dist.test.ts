/**
 * Verify that all WASM dist bundles and their binary dependencies exist on
 * disk. These are built by `bun run build:wasm:dist`.
 *
 * We test file existence (not dynamic import) because the modules pull in
 * heavy WASM blobs and browser-only APIs that don't load in a test env.
 */
import { describe, expect, it } from 'vitest';
import { access, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await access(resolve(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function symlinkResolves(relativePath: string): Promise<boolean> {
  try {
    await realpath(resolve(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe('WASM dist artifacts', () => {
  it('openssl dist/index.mjs exists', async () => {
    expect(await fileExists('wasm/openssl/dist/index.mjs')).toBe(true);
  });

  it('openssl binary/openssl_wasm.js exists (via symlink to pkg)', async () => {
    expect(await symlinkResolves('wasm/openssl/binary/openssl_wasm.js')).toBe(true);
  });

  it('openssl binary/openssl_wasm_bg.wasm exists', async () => {
    expect(await symlinkResolves('wasm/openssl/binary/openssl_wasm_bg.wasm')).toBe(true);
  });

  it('libcurl dist/bundled.mjs exists', async () => {
    expect(await fileExists('wasm/libcurl-wasm/dist/bundled.mjs')).toBe(true);
  });

  it('libcurl dist/index.mjs exists', async () => {
    expect(await fileExists('wasm/libcurl-wasm/dist/index.mjs')).toBe(true);
  });

  it('libcurl binary/libcurl_full.mjs resolves', async () => {
    expect(await symlinkResolves('wasm/libcurl-wasm/binary/libcurl_full.mjs')).toBe(true);
  });

  it('libcurl binary/libcurl.mjs resolves', async () => {
    expect(await symlinkResolves('wasm/libcurl-wasm/binary/libcurl.mjs')).toBe(true);
  });

  it('zsign js/dist/index.mjs exists', async () => {
    expect(await fileExists('wasm/zsign-wasm/js/dist/index.mjs')).toBe(true);
  });

  it('zsign js/dist/browser.mjs exists', async () => {
    expect(await fileExists('wasm/zsign-wasm/js/dist/browser.mjs')).toBe(true);
  });
});
