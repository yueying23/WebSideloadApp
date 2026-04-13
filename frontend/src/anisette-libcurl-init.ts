import { loadLibcurl, libcurl } from './wasm/libcurl';

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initLibcurl(): Promise<void> {
  if (initialized) {
    return;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    let loadedLibcurl;
    try {
      loadedLibcurl = await loadLibcurl();
    } catch (error) {
      initPromise = null;
      throw new Error(`Failed to load libcurl WASM module. ${error instanceof Error ? error.message : String(error)}`);
    }
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${location.host}/wisp/`;
    loadedLibcurl.set_websocket(wsUrl);
    try {
      await loadedLibcurl.load_wasm();
    } catch (error) {
      initPromise = null;
      throw new Error(
        `Failed to initialize libcurl (is the WISP backend running?). ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    initialized = true;
  })();

  return initPromise;
}

export { libcurl };
