import type { TlsConnection, TlsConnectionFactory } from "./imobiledevice-client"
import type {
  OpenSslWasmConnectionRequest,
  OpenSslWasmPairRecordRequest,
} from "./openssl-wasm"

interface OpenSslWasmBrowserModule {
  default(input?: unknown): Promise<unknown>
  OpensslClient: new (
    serverName: string,
    caCertificatePem: string,
    certificatePem: string,
    privateKeyPem: string,
  ) => TlsConnection
  libimobiledevice_generate_pair_record(
    devicePublicKey: Uint8Array,
    hostId: string,
    systemBuid: string,
  ): string
}

const OPENSSL_WASM_MODULE_URL = new URL(
  "../openssl-wasm/dist/index.mjs",
  import.meta.url,
)

let opensslWasmModule: OpenSslWasmBrowserModule | null = null
let opensslWasmModulePromise: Promise<OpenSslWasmBrowserModule> | null = null
let opensslWasmInitPromise: Promise<void> | null = null

const toOpenSslWasmModule = (moduleValue: unknown): OpenSslWasmBrowserModule => {
  if (!moduleValue || typeof moduleValue !== "object") {
    throw new Error("OpenSSL wasm module did not return an object")
  }

  const candidate = moduleValue as Record<string, unknown>
  if (typeof candidate.default !== "function") {
    throw new Error("OpenSSL wasm module is missing its default initializer")
  }
  if (typeof candidate.OpensslClient !== "function") {
    throw new Error("OpenSSL wasm module is missing OpensslClient")
  }
  if (typeof candidate.libimobiledevice_generate_pair_record !== "function") {
    throw new Error("OpenSSL wasm module is missing pair record generation")
  }

  return candidate as unknown as OpenSslWasmBrowserModule
}

const loadOpenSslWasmModule = async (): Promise<OpenSslWasmBrowserModule> => {
  if (!opensslWasmModulePromise) {
    opensslWasmModulePromise = import(
      /* @vite-ignore */
      OPENSSL_WASM_MODULE_URL.href
    ).then((moduleValue) => {
      const loadedModule = toOpenSslWasmModule(moduleValue)
      opensslWasmModule = loadedModule
      return loadedModule
    })
  }

  return await opensslWasmModulePromise
}

const requireOpenSslWasmModule = (): OpenSslWasmBrowserModule => {
  if (!opensslWasmModule) {
    throw new Error("OpenSSL wasm is not ready. Call ensureOpenSslWasmReady() first.")
  }

  return opensslWasmModule
}

export const ensureOpenSslWasmReady = async (): Promise<void> => {
  if (!opensslWasmInitPromise) {
    opensslWasmInitPromise = loadOpenSslWasmModule().then(async (moduleValue) => {
      await moduleValue.default()
    })
  }

  await opensslWasmInitPromise
}

export const createOpenSslWasmConnection = (
  request: OpenSslWasmConnectionRequest,
): TlsConnection => {
  const moduleValue = requireOpenSslWasmModule()
  return new moduleValue.OpensslClient(
    request.serverName,
    request.caCertificatePem,
    request.certificatePem,
    request.privateKeyPem,
  )
}

export const createOpenSslWasmTlsFactory = (): TlsConnectionFactory => {
  return {
    ensureReady: ensureOpenSslWasmReady,
    createConnection: createOpenSslWasmConnection,
  }
}

export const generatePairRecordWithOpenSslWasm = async (
  request: OpenSslWasmPairRecordRequest,
): Promise<string> => {
  await ensureOpenSslWasmReady()
  const moduleValue = requireOpenSslWasmModule()
  return moduleValue.libimobiledevice_generate_pair_record(
    new Uint8Array(request.devicePublicKey),
    request.hostId,
    request.systemBuid,
  )
}
