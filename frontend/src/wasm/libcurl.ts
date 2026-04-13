export interface LibcurlApi {
  fetch(input: string | URL, init?: Record<string, unknown>): Promise<Response>;
  load_wasm(url?: string): Promise<void>;
  set_websocket(url: string): void;
  readonly ready?: boolean;
}

let libcurlModulePromise: Promise<LibcurlApi> | null = null;
export let libcurl: LibcurlApi;

const toLibcurl = (moduleValue: unknown): LibcurlApi => {
  if (!moduleValue || typeof moduleValue !== 'object') {
    throw new Error('libcurl module did not return an object');
  }

  const candidate = moduleValue as Record<string, unknown>;
  if (!candidate.libcurl || typeof candidate.libcurl !== 'object') {
    throw new Error('libcurl module is missing the libcurl export');
  }

  const loadedLibcurl = candidate.libcurl as Partial<LibcurlApi>;
  if (typeof loadedLibcurl.fetch !== 'function') {
    throw new Error('libcurl export is missing fetch');
  }
  if (typeof loadedLibcurl.load_wasm !== 'function') {
    throw new Error('libcurl export is missing load_wasm');
  }
  if (typeof loadedLibcurl.set_websocket !== 'function') {
    throw new Error('libcurl export is missing set_websocket');
  }

  return loadedLibcurl as LibcurlApi;
};

export const loadLibcurl = async (): Promise<LibcurlApi> => {
  if (!libcurlModulePromise) {
    libcurlModulePromise = import('./libcurl-entry.js').then((moduleValue) => {
      const loadedLibcurl = toLibcurl(moduleValue);
      libcurl = loadedLibcurl;
      return loadedLibcurl;
    });
  }

  return await libcurlModulePromise;
};

export const requireLibcurl = (): LibcurlApi => {
  if (!libcurl) {
    throw new Error('libcurl is not ready. Call initLibcurl() first.');
  }

  return libcurl;
};
