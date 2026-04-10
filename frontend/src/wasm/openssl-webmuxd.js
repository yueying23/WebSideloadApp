let opensslWasmModule = null
let opensslWasmModulePromise = null
let opensslWasmInitPromise = null

const loadOpenSslWasmModule = async () => {
  if (!opensslWasmModulePromise) {
    opensslWasmModulePromise = import("../../../wasm/openssl/dist/index.mjs").then(
      (moduleValue) => {
        if (!moduleValue || typeof moduleValue !== "object") {
          throw new Error("OpenSSL wasm module did not return an object")
        }
        const candidate = moduleValue
        if (typeof candidate.default !== "function") {
          throw new Error("OpenSSL wasm module is missing its default initializer")
        }
        if (typeof candidate.OpensslClient !== "function") {
          throw new Error("OpenSSL wasm module is missing OpensslClient")
        }
        if (typeof candidate.libimobiledevice_generate_pair_record !== "function") {
          throw new Error("OpenSSL wasm module is missing pair record generation")
        }

        opensslWasmModule = candidate
        return candidate
      },
    )
  }

  return await opensslWasmModulePromise
}

const requireOpenSslWasmModule = () => {
  if (!opensslWasmModule) {
    throw new Error("OpenSSL wasm is not ready. Call ensureOpenSslWasmReady() first.")
  }

  return opensslWasmModule
}

export const ensureOpenSslWasmReady = async () => {
  if (!opensslWasmInitPromise) {
    opensslWasmInitPromise = loadOpenSslWasmModule().then(async (moduleValue) => {
      await moduleValue.default()
    })
  }

  await opensslWasmInitPromise
}

export const createOpenSslWasmConnection = (request) => {
  const moduleValue = requireOpenSslWasmModule()
  return new moduleValue.OpensslClient(
    request.serverName,
    request.caCertificatePem,
    request.certificatePem,
    request.privateKeyPem,
  )
}

export const createOpenSslWasmTlsFactory = () => {
  return {
    ensureReady: ensureOpenSslWasmReady,
    createConnection: createOpenSslWasmConnection,
  }
}

export const generatePairRecordWithOpenSslWasm = async (request) => {
  await ensureOpenSslWasmReady()
  const moduleValue = requireOpenSslWasmModule()
  return moduleValue.libimobiledevice_generate_pair_record(
    new Uint8Array(request.devicePublicKey),
    request.hostId,
    request.systemBuid,
  )
}
