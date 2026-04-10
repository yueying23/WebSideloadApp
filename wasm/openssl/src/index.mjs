import initOpenSslWasm from "../binary/openssl_wasm.js"

export * from "../binary/openssl_wasm.js"

let initPromise = null

/**
 * Keep a stable ESM wrapper in `src/` so consumers always import the package
 * entry, while the raw wasm-bindgen output stays isolated in `binary/`.
 */
export default async function ensureOpenSslWasmModuleReady(input) {
  if (!initPromise) {
    initPromise = Promise.resolve(initOpenSslWasm(input)).then(() => undefined)
  }

  await initPromise
}
