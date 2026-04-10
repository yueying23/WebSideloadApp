import { loadLibcurl, libcurl } from "./wasm/libcurl"

let initialized = false
let initPromise: Promise<void> | null = null

export async function initLibcurl(): Promise<void> {
  if (initialized) {
    return
  }
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const loadedLibcurl = await loadLibcurl()
    const wsProto = location.protocol === "https:" ? "wss:" : "ws:"
    const wsUrl = `${wsProto}//${location.host}/wisp/`
    loadedLibcurl.set_websocket(wsUrl)
    await loadedLibcurl.load_wasm()
    initialized = true
  })()

  return initPromise
}

export { libcurl }
