/**
 * Test that the libcurl init wrapper produces clear error messages when the
 * WASM module or WISP backend is unavailable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Reset module state between tests — initLibcurl caches its promise.
let initLibcurl: typeof import('../anisette-libcurl-init').initLibcurl;

beforeEach(async () => {
  vi.resetModules();
});

describe('initLibcurl error handling', () => {
  it('wraps loadLibcurl failure with a descriptive message', async () => {
    vi.doMock('../wasm/libcurl', () => ({
      loadLibcurl: async () => {
        throw new Error('module not found');
      },
      libcurl: undefined,
    }));
    const mod = await import('../anisette-libcurl-init');
    initLibcurl = mod.initLibcurl;

    await expect(initLibcurl()).rejects.toThrow(/Failed to load libcurl WASM module/);
    await expect(initLibcurl()).rejects.toThrow(/module not found/);
  });

  it('wraps load_wasm failure with a WISP backend hint', async () => {
    vi.doMock('../wasm/libcurl', () => ({
      loadLibcurl: async () => ({
        set_websocket: () => {},
        load_wasm: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
      libcurl: undefined,
    }));
    const mod = await import('../anisette-libcurl-init');
    initLibcurl = mod.initLibcurl;

    await expect(initLibcurl()).rejects.toThrow(/WISP backend running/);
    await expect(initLibcurl()).rejects.toThrow(/ECONNREFUSED/);
  });

  it('resets the promise after failure so retries are possible', async () => {
    let callCount = 0;
    vi.doMock('../wasm/libcurl', () => ({
      loadLibcurl: async () => {
        callCount++;
        if (callCount === 1) throw new Error('transient');
        return {
          set_websocket: () => {},
          load_wasm: async () => {},
        };
      },
      libcurl: undefined,
    }));
    const mod = await import('../anisette-libcurl-init');
    initLibcurl = mod.initLibcurl;

    // First call fails.
    await expect(initLibcurl()).rejects.toThrow(/transient/);
    // Second call succeeds because the promise was reset.
    await expect(initLibcurl()).resolves.toBeUndefined();
  });

  it('succeeds when libcurl loads and wasm initializes', async () => {
    vi.doMock('../wasm/libcurl', () => ({
      loadLibcurl: async () => ({
        set_websocket: () => {},
        load_wasm: async () => {},
      }),
      libcurl: undefined,
    }));
    const mod = await import('../anisette-libcurl-init');
    initLibcurl = mod.initLibcurl;

    await expect(initLibcurl()).resolves.toBeUndefined();
    // Subsequent calls are idempotent.
    await expect(initLibcurl()).resolves.toBeUndefined();
  });
});
