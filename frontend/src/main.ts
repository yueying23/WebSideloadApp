import "./style.css"
import * as webmuxdModule from "webmuxd"
import { getAnisetteData, provisionAnisette, type AnisetteData } from "./anisette-service"
import { signIpaWithApple } from "./apple-signing"
import initOpensslWasm, {
  libimobiledevice_generate_pair_record,
  OpensslClient,
} from "../../tls/openssl-wasm/pkg/openssl_wasm.js"

interface WebUsbTransportInstance {
  readonly isOpen: boolean
  open(): Promise<void>
  close(): Promise<void>
  send(data: ArrayBuffer): Promise<void>
  setDataHandler(handler: ((data: ArrayBuffer) => void) | null): void
  setDisconnectHandler(handler: ((reason?: unknown) => void) | null): void
}

interface WebUsbTransportCtor {
  supported(): boolean
  requestAppleDevice(): Promise<WebUsbTransportInstance>
}

interface PairRecord {
  hostId: string
  systemBuid: string
  hostCertificatePem: string
  hostPrivateKeyPem: string
  rootCertificatePem: string
  rootPrivateKeyPem: string
  deviceCertificatePem: string
  devicePublicKey: Uint8Array
  escrowBag?: Uint8Array
}

interface StoredPairRecordPayload {
  hostId: string
  systemBuid: string
  hostCertificatePem: string
  hostPrivateKeyPem: string
  rootCertificatePem: string
  rootPrivateKeyPem: string
  deviceCertificatePem: string
  devicePublicKey: string
  escrowBag: string | null
}

interface StartSessionResult {
  sessionId: string
  enableSessionSsl: boolean
}

interface DirectUsbMuxClient {
  readonly isHandshakeComplete: boolean
  readonly isLockdownConnected: boolean
  readonly isAfcConnected: boolean
  readonly isInstProxyConnected: boolean
  readonly isSessionStarted: boolean
  readonly isSessionSslEnabled: boolean
  readonly isTlsActive: boolean
  readonly isPaired: boolean
  loadPairRecord(record: PairRecord | null): void
  openAndHandshake(): Promise<void>
  connectLockdown(port?: number): Promise<void>
  getOrFetchDeviceUdid(): Promise<string>
  getOrFetchDeviceName(): Promise<string | null>
  pairDevice(hostId: string, systemBuid: string): Promise<PairRecord>
  startSession(hostId: string, systemBuid: string): Promise<StartSessionResult>
  close(): Promise<void>
}

interface DirectUsbMuxClientCtor {
  new (
    transport: WebUsbTransportInstance,
    options?: {
      log?: (message: string) => void
      onStateChange?: () => void
      lockdownLabel?: string
      tlsFactory?: {
        ensureReady?: () => Promise<void>
        createConnection(request: {
          serverName: string
          caCertificatePem: string
          certificatePem: string
          privateKeyPem: string
        }): {
          is_handshaking(): boolean
          write_plaintext(data: Uint8Array): void
          feed_tls(data: Uint8Array): void
          take_tls_out(): Uint8Array
          take_plain_out(): Uint8Array
          free(): void
        }
      }
      pairRecordFactory?: {
        createPairRecord(request: {
          devicePublicKey: Uint8Array
          hostId: string
          systemBuid: string
        }): Promise<PairRecord>
      }
    },
  ): DirectUsbMuxClient
}

interface SigningPreflightContext {
  anisetteData: AnisetteData
  preparedAtIso: string
}

interface WasmPairRecordPayload {
  hostId: string
  systemBuid: string
  hostCertificatePem: string
  hostPrivateKeyPem: string
  rootCertificatePem: string
  rootPrivateKeyPem: string
  deviceCertificatePem: string
}

const LOCKDOWN_PORT = 62078

const HOST_ID_STORAGE_KEY = "webmuxd:host-id"
const SYSTEM_BUID_STORAGE_KEY = "webmuxd:system-buid"
const PAIR_RECORDS_STORAGE_KEY = "webmuxd:pair-records-by-udid"
const LEGACY_PAIR_RECORD_STORAGE_KEY = "webmuxd:pair-record"
const APPLE_ID_STORAGE_KEY = "webmuxd:apple-id"
const SIGN_BUNDLE_ID_STORAGE_KEY = "webmuxd:sign-bundle-id"
const SIGN_DISPLAY_NAME_STORAGE_KEY = "webmuxd:sign-display-name"

const ENABLE_BROWSER_SIGNING_PIPELINE = true
const SIGNING_PREFLIGHT_REQUIRED = false

const webmuxdModuleValue = webmuxdModule as unknown as Record<string, unknown>

const WebUsbTransport = resolveWebmuxdExport<WebUsbTransportCtor>(
  webmuxdModuleValue,
  "WebUsbTransport",
)
const WebmuxdDirectUsbMuxClient = resolveWebmuxdExport<DirectUsbMuxClientCtor>(
  webmuxdModuleValue,
  "DirectUsbMuxClient",
)
const webmuxdInstallIpaViaInstProxy = resolveWebmuxdExport<
  (
    client: DirectUsbMuxClient,
    ipaData: Uint8Array,
    fileName: string,
    onLog?: (message: string) => void,
  ) => Promise<void>
>(webmuxdModuleValue, "installIpaViaInstProxy")
const webmuxdSanitizeIpaFileName = resolveWebmuxdExport<(fileName: string) => string>(
  webmuxdModuleValue,
  "sanitizeIpaFileName",
)
const webmuxdCreateHostId = resolveWebmuxdExport<() => string>(
  webmuxdModuleValue,
  "createHostId",
)
const webmuxdCreateSystemBuid = resolveWebmuxdExport<() => string>(
  webmuxdModuleValue,
  "createSystemBuid",
)
const webmuxdEncodeStoredPairRecord = resolveWebmuxdExport<
  (record: PairRecord) => StoredPairRecordPayload
>(webmuxdModuleValue, "encodeStoredPairRecord")
const webmuxdDecodeStoredPairRecord = resolveWebmuxdExport<
  (payload: StoredPairRecordPayload) => PairRecord | null
>(webmuxdModuleValue, "decodeStoredPairRecord")

let opensslInitPromise: Promise<void> | null = null

const ensureOpensslReady = async (): Promise<void> => {
  if (!opensslInitPromise) {
    opensslInitPromise = initOpensslWasm().then(() => undefined)
  }
  await opensslInitPromise
}

const app = document.querySelector<HTMLDivElement>("#app")
if (!app) {
  throw new Error("App root is missing")
}

app.innerHTML = `
  <main class="shell">
    <section class="panel">
      <p class="eyebrow">Pure Browser usbmux + lockdown</p>
      <h1>WebMuxD Direct Mode</h1>
      <p class="subline">
        Handshake with iPhone USB MUX directly, then connect lockdownd (62078).
      </p>
      <div id="ipa-drop-zone" class="drop-zone">
        Drag & drop IPA here to run full flow: Signing Preflight -> Select Device -> Session -> Upload -> Install
      </div>
      <div class="request-row">
        <label for="host-id">HostID</label>
        <input id="host-id" type="text" />
      </div>
      <div class="request-row">
        <label for="system-buid">SystemBUID</label>
        <input id="system-buid" type="text" />
      </div>
      <div class="request-row">
        <label for="apple-id">Apple ID</label>
        <input id="apple-id" type="email" autocomplete="username" />
      </div>
      <div class="request-row">
        <label for="apple-password">Apple Password</label>
        <input id="apple-password" type="password" autocomplete="current-password" />
      </div>
      <div class="request-row">
        <label for="sign-bundle-id">Sign BundleID</label>
        <input id="sign-bundle-id" type="text" placeholder="optional" />
      </div>
      <div class="request-row">
        <label for="sign-display-name">Sign DisplayName</label>
        <input id="sign-display-name" type="text" placeholder="optional" />
      </div>
      <div class="request-row">
        <label for="ipa-file">Select IPA</label>
        <input id="ipa-file" type="file" accept=".ipa,application/octet-stream" />
      </div>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">WebUSB</span>
          <span id="support-state" class="value"></span>
        </div>
        <div class="state-item">
          <span class="label">Transport</span>
          <span id="transport-state" class="value"></span>
        </div>
        <div class="state-item">
          <span class="label">MUX</span>
          <span id="mux-state" class="value"></span>
        </div>
        <div class="state-item">
          <span class="label">Lockdown TCP</span>
          <span id="lockdown-state" class="value"></span>
        </div>
        <div class="state-item">
          <span class="label">Pair</span>
          <span id="pair-state" class="value"></span>
        </div>
        <div class="state-item">
          <span class="label">Lockdown Session</span>
          <span id="session-state" class="value"></span>
        </div>
        <div class="state-item">
          <span class="label">AFC</span>
          <span id="afc-state" class="value"></span>
        </div>
        <div class="state-item">
          <span class="label">InstProxy</span>
          <span id="instproxy-state" class="value"></span>
        </div>
      </div>
    </section>
    <section class="log-panel">
      <div class="log-head">
        <h2>Event Log</h2>
      </div>
      <pre id="log" class="log"></pre>
    </section>
  </main>
`

const hostIdInput = mustGetInput("host-id")
const systemBuidInput = mustGetInput("system-buid")
const appleIdInput = mustGetInput("apple-id")
const applePasswordInput = mustGetInput("apple-password")
const signBundleIdInput = mustGetInput("sign-bundle-id")
const signDisplayNameInput = mustGetInput("sign-display-name")
const ipaFileInput = mustGetInput("ipa-file")

const supportState = mustGetElement("support-state")
const transportState = mustGetElement("transport-state")
const muxState = mustGetElement("mux-state")
const lockdownState = mustGetElement("lockdown-state")
const pairState = mustGetElement("pair-state")
const sessionState = mustGetElement("session-state")
const afcState = mustGetElement("afc-state")
const instProxyState = mustGetElement("instproxy-state")
const ipaDropZone = mustGetElement("ipa-drop-zone")
const logView = mustGetElement("log")

const logLines: string[] = []
const isSupported = WebUsbTransport.supported()

let directClient: DirectUsbMuxClient | null = null
let installFlowInProgress = false
let signingPreflightPromise: Promise<SigningPreflightContext | null> | null = null

hostIdInput.value = getOrCreateHostId()
systemBuidInput.value = getOrCreateSystemBuid()
appleIdInput.value = loadText(APPLE_ID_STORAGE_KEY) ?? ""
applePasswordInput.value = ""
signBundleIdInput.value = loadText(SIGN_BUNDLE_ID_STORAGE_KEY) ?? ""
signDisplayNameInput.value = loadText(SIGN_DISPLAY_NAME_STORAGE_KEY) ?? ""

const addLog = (message: string): void => {
  const now = new Date()
  const time = `${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, "0")}`
  logLines.push(`[${time}] ${message}`)
  logView.textContent = logLines.slice(-200).join("\n")
}

const refreshState = (): void => {
  supportState.textContent = isSupported ? "supported" : "not supported"
  transportState.textContent = directClient ? "selected" : "not selected"
  muxState.textContent = directClient?.isHandshakeComplete ? "ready" : "pending"
  lockdownState.textContent = directClient?.isLockdownConnected ? "connected" : "disconnected"
  pairState.textContent = directClient?.isPaired ? "paired" : "not paired"
  sessionState.textContent = directClient?.isSessionStarted
    ? directClient.isSessionSslEnabled
      ? directClient.isTlsActive
        ? "started (tls active)"
        : "started (ssl required)"
      : "started"
    : "not started"
  afcState.textContent = directClient?.isAfcConnected ? "connected" : "disconnected"
  instProxyState.textContent = directClient?.isInstProxyConnected ? "connected" : "disconnected"
}

const ensureClientSelected = async (): Promise<DirectUsbMuxClient> => {
  if (directClient) {
    return directClient
  }

  const transport = await WebUsbTransport.requestAppleDevice()
  directClient = new WebmuxdDirectUsbMuxClient(transport, {
    log: addLog,
    onStateChange: refreshState,
    lockdownLabel: "webmuxd.frontend",
    tlsFactory: {
      ensureReady: ensureOpensslReady,
      createConnection: (request) => {
        return new OpensslClient(
          request.serverName,
          request.caCertificatePem,
          request.certificatePem,
          request.privateKeyPem,
        )
      },
    },
    pairRecordFactory: {
      createPairRecord: async (request) => {
        return await createPairRecord(request.devicePublicKey, request.hostId, request.systemBuid)
      },
    },
  })

  addLog("Apple device selected.")
  refreshState()
  return directClient
}

const getSigningCredentials = (): { appleId: string; password: string } | null => {
  const appleId = appleIdInput.value.trim()
  const password = applePasswordInput.value
  if (!appleId || !password) {
    return null
  }
  return { appleId, password }
}

const prepareSigningPreflight = async (
  log: (message: string) => void,
): Promise<SigningPreflightContext | null> => {
  if (signingPreflightPromise) {
    return signingPreflightPromise
  }

  signingPreflightPromise = (async () => {
    try {
      log("Signing preflight: provisioning anisette...")
      await provisionAnisette()
      const anisetteData = await getAnisetteData()
      const context: SigningPreflightContext = {
        anisetteData,
        preparedAtIso: new Date().toISOString(),
      }
      log(
        `Signing preflight ready: machineID=${shortToken(anisetteData.machineID)}, locale=${anisetteData.locale}, timezone=${anisetteData.timeZone}`,
      )
      return context
    } catch (error) {
      const message = formatError(error)
      log(`Signing preflight failed: ${message}`)
      if (SIGNING_PREFLIGHT_REQUIRED) {
        throw error
      }
      log("Signing preflight skipped (non-blocking mode).")
      return null
    }
  })()

  try {
    return await signingPreflightPromise
  } finally {
    signingPreflightPromise = null
  }
}

const prepareIpaForInstall = async (
  ipaFile: File,
  log: (message: string) => void,
  device: { udid: string; name?: string },
): Promise<{ installFile: File; signingContext: SigningPreflightContext | null }> => {
  const signingContext = await prepareSigningPreflight(log)
  if (signingContext) {
    log(`Signing preflight timestamp: ${signingContext.preparedAtIso}`)
  }

  if (!ENABLE_BROWSER_SIGNING_PIPELINE) {
    log("Signing stage: browser resign pipeline is disabled, using original IPA.")
    return { installFile: ipaFile, signingContext }
  }
  if (!signingContext) {
    log("Signing stage: anisette is unavailable, using original IPA.")
    return { installFile: ipaFile, signingContext: null }
  }

  const credentials = getSigningCredentials()
  if (!credentials) {
    log("Signing stage: Apple ID/password not set, using original IPA.")
    return { installFile: ipaFile, signingContext }
  }

  const bundleIdOverride = signBundleIdInput.value.trim()
  const displayNameOverride = signDisplayNameInput.value.trim()

  const signingResult = await signIpaWithApple({
    ipaFile,
    anisetteData: signingContext.anisetteData,
    credentials,
    deviceUdid: device.udid,
    deviceName: device.name,
    bundleIdOverride: bundleIdOverride.length > 0 ? bundleIdOverride : undefined,
    displayNameOverride: displayNameOverride.length > 0 ? displayNameOverride : undefined,
    onLog: log,
  })

  log(
    `Signing stage: signed IPA ready (${signingResult.signedFile.name}), bundleId=${signingResult.outputBundleId}, team=${signingResult.teamId}.`,
  )

  return { installFile: signingResult.signedFile, signingContext }
}

const installIpaViaInstProxy = async (
  client: DirectUsbMuxClient,
  ipaFile: File,
  log: (message: string) => void,
): Promise<void> => {
  const rawData = new Uint8Array(await ipaFile.arrayBuffer())
  const safeFileName = webmuxdSanitizeIpaFileName(ipaFile.name)
  await webmuxdInstallIpaViaInstProxy(client, rawData, safeFileName, log)
}

const runFullInstallFlow = async (ipaFile: File): Promise<void> => {
  if (installFlowInProgress) {
    throw new Error("Install flow is already running")
  }
  installFlowInProgress = true

  try {
    addLog(`Full install start: ${ipaFile.name} (${ipaFile.size} bytes).`)

    const client = await ensureClientSelected()

    let hostId = hostIdInput.value.trim()
    let systemBuid = systemBuidInput.value.trim()

    if (hostId.length === 0) {
      hostId = getOrCreateHostId()
      hostIdInput.value = hostId
    }
    if (systemBuid.length === 0) {
      systemBuid = getOrCreateSystemBuid()
      systemBuidInput.value = systemBuid
    }

    saveText(HOST_ID_STORAGE_KEY, hostId)
    saveText(SYSTEM_BUID_STORAGE_KEY, systemBuid)

    if (!client.isHandshakeComplete) {
      await client.openAndHandshake()
    }
    if (!client.isLockdownConnected) {
      await client.connectLockdown(LOCKDOWN_PORT)
    }

    const deviceUdid = await client.getOrFetchDeviceUdid()
    const deviceName = await client.getOrFetchDeviceName()
    addLog(`Device UDID: ${deviceUdid}`)
    if (deviceName) {
      addLog(`Device Name: ${deviceName}`)
    }

    const prepared = await prepareIpaForInstall(ipaFile, addLog, {
      udid: deviceUdid,
      name: deviceName ?? undefined,
    })

    const storedPair = loadPairRecordForUdid(deviceUdid)
    if (storedPair && !client.isPaired) {
      client.loadPairRecord(storedPair)
      hostId = storedPair.hostId
      systemBuid = storedPair.systemBuid
      hostIdInput.value = hostId
      systemBuidInput.value = systemBuid
      saveText(HOST_ID_STORAGE_KEY, hostId)
      saveText(SYSTEM_BUID_STORAGE_KEY, systemBuid)
      addLog(`Loaded pair record for device ${deviceUdid}.`)
    }

    if (!client.isPaired) {
      const pairResult = await client.pairDevice(hostId, systemBuid)
      savePairRecordForUdid(deviceUdid, pairResult)
      addLog(`Pair success and pair record saved for ${deviceUdid}.`)
    }

    if (!client.isSessionStarted) {
      const session = await client.startSession(hostId, systemBuid)
      addLog(
        `StartSession success: SessionID=${session.sessionId}, EnableSessionSSL=${String(session.enableSessionSsl)}`,
      )
    }

    await installIpaViaInstProxy(client, prepared.installFile, addLog)
  } finally {
    installFlowInProgress = false
  }
}

const handleSelectedIpaFile = async (file: File): Promise<void> => {
  addLog(`IPA selected: ${file.name} (${file.size} bytes).`)
  refreshState()

  try {
    await runFullInstallFlow(file)
  } catch (error) {
    addLog(`Install IPA failed: ${formatError(error)}`)
  } finally {
    refreshState()
  }
}

appleIdInput.addEventListener("change", () => {
  saveText(APPLE_ID_STORAGE_KEY, appleIdInput.value.trim())
})

signBundleIdInput.addEventListener("change", () => {
  saveText(SIGN_BUNDLE_ID_STORAGE_KEY, signBundleIdInput.value.trim())
})

signDisplayNameInput.addEventListener("change", () => {
  saveText(SIGN_DISPLAY_NAME_STORAGE_KEY, signDisplayNameInput.value.trim())
})

ipaFileInput.addEventListener("change", async () => {
  const file = ipaFileInput.files && ipaFileInput.files.length > 0 ? ipaFileInput.files[0] : null
  if (!file) {
    addLog("IPA selection cleared.")
    refreshState()
    return
  }
  await handleSelectedIpaFile(file)
})

ipaDropZone.addEventListener("dragenter", (event) => {
  event.preventDefault()
  ipaDropZone.classList.add("dragover")
})

ipaDropZone.addEventListener("dragover", (event) => {
  event.preventDefault()
  ipaDropZone.classList.add("dragover")
})

ipaDropZone.addEventListener("dragleave", () => {
  ipaDropZone.classList.remove("dragover")
})

ipaDropZone.addEventListener("drop", async (event) => {
  event.preventDefault()
  ipaDropZone.classList.remove("dragover")

  const file = event.dataTransfer?.files?.[0] ?? null
  if (!file) {
    addLog("Drop ignored: no file.")
    return
  }
  await handleSelectedIpaFile(file)
})

window.addEventListener("beforeunload", () => {
  void directClient?.close()
})

addLog("Demo ready.")
refreshState()

function mustGetElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Element #${id} not found`)
  }
  return element
}

function mustGetInput(id: string): HTMLInputElement {
  const element = document.getElementById(id)
  if (!element || !(element instanceof HTMLInputElement)) {
    throw new Error(`Input #${id} not found`)
  }
  return element
}

function loadText(key: string): string | null {
  return window.localStorage.getItem(key)
}

function saveText(key: string, value: string): void {
  window.localStorage.setItem(key, value)
}

function getOrCreateHostId(): string {
  const existing = loadText(HOST_ID_STORAGE_KEY)
  if (existing && existing.trim().length > 0) {
    return existing
  }
  const created = webmuxdCreateHostId()
  saveText(HOST_ID_STORAGE_KEY, created)
  return created
}

function getOrCreateSystemBuid(): string {
  const existing = loadText(SYSTEM_BUID_STORAGE_KEY)
  if (existing && existing.trim().length > 0) {
    return existing
  }
  const created = webmuxdCreateSystemBuid()
  saveText(SYSTEM_BUID_STORAGE_KEY, created)
  return created
}

function readPairRecordMap(): Record<string, StoredPairRecordPayload> {
  const text = loadText(PAIR_RECORDS_STORAGE_KEY)
  if (!text) {
    return {}
  }
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, StoredPairRecordPayload>
  } catch {
    return {}
  }
}

function writePairRecordMap(map: Record<string, StoredPairRecordPayload>): void {
  saveText(PAIR_RECORDS_STORAGE_KEY, JSON.stringify(map))
}

function savePairRecordForUdid(udid: string, record: PairRecord): void {
  const normalizedUdid = udid.trim()
  if (normalizedUdid.length === 0) {
    return
  }
  const map = readPairRecordMap()
  map[normalizedUdid] = webmuxdEncodeStoredPairRecord(record)
  writePairRecordMap(map)
}

function loadLegacyPairRecord(): PairRecord | null {
  const text = loadText(LEGACY_PAIR_RECORD_STORAGE_KEY)
  if (!text) {
    return null
  }
  try {
    const parsed = JSON.parse(text) as StoredPairRecordPayload
    return webmuxdDecodeStoredPairRecord(parsed)
  } catch {
    return null
  }
}

function loadPairRecordForUdid(udid: string): PairRecord | null {
  const normalizedUdid = udid.trim()
  if (normalizedUdid.length === 0) {
    return null
  }

  const map = readPairRecordMap()
  const fromMap = map[normalizedUdid]
  if (fromMap) {
    try {
      return webmuxdDecodeStoredPairRecord(fromMap)
    } catch {
      return null
    }
  }

  const legacy = loadLegacyPairRecord()
  if (legacy) {
    savePairRecordForUdid(normalizedUdid, legacy)
    window.localStorage.removeItem(LEGACY_PAIR_RECORD_STORAGE_KEY)
  }
  return legacy
}

async function createPairRecord(
  devicePublicKeyBytes: Uint8Array,
  hostId: string,
  systemBuid: string,
): Promise<PairRecord> {
  await ensureOpensslReady()
  const payloadText = libimobiledevice_generate_pair_record(
    new Uint8Array(devicePublicKeyBytes),
    hostId,
    systemBuid,
  )
  const payload = JSON.parse(payloadText) as WasmPairRecordPayload
  return {
    hostId: payload.hostId,
    systemBuid: payload.systemBuid,
    hostCertificatePem: normalizePem(payload.hostCertificatePem),
    hostPrivateKeyPem: normalizePem(payload.hostPrivateKeyPem),
    rootCertificatePem: normalizePem(payload.rootCertificatePem),
    rootPrivateKeyPem: normalizePem(payload.rootPrivateKeyPem),
    deviceCertificatePem: normalizePem(payload.deviceCertificatePem),
    devicePublicKey: new Uint8Array(devicePublicKeyBytes),
  }
}

function normalizePem(value: string): string {
  const normalized = value.replace(/\0/g, "").replace(/\r\n/g, "\n").trim()
  return `${normalized}\n`
}

function shortToken(value: string): string {
  const text = value.trim()
  if (text.length <= 10) {
    return text
  }
  return `${text.slice(0, 6)}...${text.slice(-4)}`
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function resolveWebmuxdExport<T>(moduleValue: Record<string, unknown>, key: string): T {
  const direct = moduleValue[key]
  if (direct !== undefined) {
    return direct as T
  }

  const defaultValue = moduleValue.default
  if (defaultValue && typeof defaultValue === "object") {
    const fromDefault = (defaultValue as Record<string, unknown>)[key]
    if (fromDefault !== undefined) {
      return fromDefault as T
    }
  }

  throw new Error(`webmuxd export ${key} is unavailable`)
}
