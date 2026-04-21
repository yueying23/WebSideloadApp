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
    
    // 优先使用环境变量配置的 WISP URL（支持 Token 认证）
    let wsUrl: string;
    const envWispUrl = import.meta.env.VITE_WISP_URL as string | undefined;
    
    if (envWispUrl) {
      // 使用环境变量（生产环境，可能包含 Token）
      wsUrl = envWispUrl;
    } else {
      // 动态构建（开发环境或无 Token 场景）
      const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${wsProto}//${location.host}/wisp/`;
    }
    
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
