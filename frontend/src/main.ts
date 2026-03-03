import "./style.css"
import * as webmuxdModule from "webmuxd"
import { getAnisetteData, provisionAnisette, type AnisetteData } from "./anisette-service"
import {
  loginAppleDeveloperAccount,
  refreshAppleDeveloperContext,
  signIpaWithAppleContext,
  type AppleDeveloperContext,
} from "./apple-signing"
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

interface WasmPairRecordPayload {
  hostId: string
  systemBuid: string
  hostCertificatePem: string
  hostPrivateKeyPem: string
  rootCertificatePem: string
  rootPrivateKeyPem: string
  deviceCertificatePem: string
}

interface PairedDeviceInfo {
  udid: string
  name: string | null
}

type ProgressSource = "sign" | "install"

interface ProgressUpdate {
  percent: number
  status: string
  source: ProgressSource
}

interface StoredAccountSummary {
  appleId: string
  teamId: string
  teamName: string
  updatedAtIso: string
}

const LOCKDOWN_PORT = 62078

const HOST_ID_STORAGE_KEY = "webmuxd:host-id"
const SYSTEM_BUID_STORAGE_KEY = "webmuxd:system-buid"
const PAIR_RECORDS_STORAGE_KEY = "webmuxd:pair-records-by-udid"
const LEGACY_PAIR_RECORD_STORAGE_KEY = "webmuxd:pair-record"
const APPLE_ID_STORAGE_KEY = "webmuxd:apple-id"
const APPLE_ACCOUNT_SUMMARY_STORAGE_KEY = "webmuxd:apple-account-summary"
const DEMO_MODE_STORAGE_KEY = "webmuxd:demo-mode"

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
  <main class="page">
    <section class="panel">
      <header class="hero">
        <h1>altstore web</h1>
        <label class="demo-toggle" for="demo-mode-toggle">
          <input id="demo-mode-toggle" type="checkbox" />
          <span>demo mode</span>
        </label>
      </header>

      <label id="ipa-drop-zone" class="drop-area" for="ipa-file">
        <span id="drop-label">drag or select ipa</span>
        <span class="drop-tip">.ipa file</span>
        <input id="ipa-file" type="file" accept=".ipa,application/octet-stream" />
      </label>

      <section class="row login-row">
        <span class="k">email</span>
        <input id="apple-id" type="email" autocomplete="username" placeholder="your apple id" />
        <span class="k">password</span>
        <input id="apple-password" type="password" autocomplete="current-password" placeholder="app-specific password" />
        <button id="login-sign-btn">login and sign</button>
      </section>

      <section class="row action-row">
        <button id="pair-device-btn">pair device</button>
        <span class="k">device udid</span>
        <code id="device-udid" class="udid">-</code>
        <button id="install-btn">install</button>
      </section>

      <div id="status-line" class="status-line">status: idle</div>

      <section class="progress-wrap">
        <div class="progress-head">
          <span>sign/install progress</span>
          <span id="install-progress-text">idle</span>
        </div>
        <div class="progress-track" aria-hidden="true">
          <div id="install-progress-bar" class="progress-bar"></div>
        </div>
      </section>

      <pre id="log" class="log">log...</pre>
    </section>
  </main>
`

const isSupported = WebUsbTransport.supported()

const appleIdInput = mustGetInput("apple-id")
const applePasswordInput = mustGetInput("apple-password")
const ipaFileInput = mustGetInput("ipa-file")
const demoModeToggle = mustGetInput("demo-mode-toggle")

const loginSignButton = mustGetButton("login-sign-btn")
const pairDeviceButton = mustGetButton("pair-device-btn")
const installButton = mustGetButton("install-btn")

const dropArea = mustGetElement("ipa-drop-zone")
const dropLabel = mustGetElement("drop-label")
const deviceUdidView = mustGetElement("device-udid")
const statusLine = mustGetElement("status-line")
const installProgressTextView = mustGetElement("install-progress-text")
const installProgressBarView = mustGetElement("install-progress-bar")
const logView = mustGetElement("log")

const logLines: string[] = []

let directClient: DirectUsbMuxClient | null = null
let pairedDeviceInfo: PairedDeviceInfo | null = null
let selectedIpaFile: File | null = null

let anisetteData: AnisetteData | null = null
let loginContext: AppleDeveloperContext | null = null

let preparedSignedIpa: File | null = null
let preparedSourceKey: string | null = null

let busyPairing = false
let busyLoginSign = false
let busyInstall = false
let demoModeEnabled = loadText(DEMO_MODE_STORAGE_KEY) === "1"
let installProgressPercent = 0
let installProgressStatus = "idle"
let installProgressIncludesSigning = false

appleIdInput.value = loadText(APPLE_ID_STORAGE_KEY) ?? ""

const addLog = (message: string): void => {
  const progress = parseProgressFromLog(message)
  if (progress) {
    applyProgressUpdate(progress)
  }

  const now = new Date()
  const time = `${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, "0")}`
  const safeMessage = demoModeEnabled ? sanitizeDemoLogText(message) : message
  logLines.push(`[${time}] ${safeMessage}`)
  renderLogView()
}

const clearPreparedSigned = (): void => {
  preparedSignedIpa = null
  preparedSourceKey = null
}

const ensureClientSelected = async (): Promise<DirectUsbMuxClient> => {
  if (directClient) {
    return directClient
  }

  const transport = await WebUsbTransport.requestAppleDevice()
  directClient = new WebmuxdDirectUsbMuxClient(transport, {
    log: addLog,
    onStateChange: refreshUi,
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

  addLog("device selected from browser popup")
  refreshUi()
  return directClient
}

const pairDeviceFlow = async (): Promise<void> => {
  if (busyPairing) {
    return
  }
  busyPairing = true
  refreshUi()

  try {
    const client = await ensureClientSelected()

    if (!client.isHandshakeComplete) {
      addLog("pair: opening mux handshake...")
      await client.openAndHandshake()
    }
    if (!client.isLockdownConnected) {
      addLog("pair: connecting lockdownd...")
      await client.connectLockdown(LOCKDOWN_PORT)
    }

    const udid = await client.getOrFetchDeviceUdid()
    const name = await client.getOrFetchDeviceName()

    let hostId = getOrCreateHostId()
    let systemBuid = getOrCreateSystemBuid()

    const storedPair = loadPairRecordForUdid(udid)
    if (storedPair && !client.isPaired) {
      client.loadPairRecord(storedPair)
      hostId = storedPair.hostId
      systemBuid = storedPair.systemBuid
      saveText(HOST_ID_STORAGE_KEY, hostId)
      saveText(SYSTEM_BUID_STORAGE_KEY, systemBuid)
      addLog(`pair: loaded local pair record for ${udid}`)
    }

    if (!client.isPaired) {
      addLog("pair: creating pair record...")
      const pairResult = await client.pairDevice(hostId, systemBuid)
      savePairRecordForUdid(udid, pairResult)
      addLog("pair: success")
    }

    if (!client.isSessionStarted) {
      const session = await client.startSession(hostId, systemBuid)
      addLog(`pair: session ready, ssl=${String(session.enableSessionSsl)}`)
    }

    const changed = pairedDeviceInfo?.udid !== udid
    pairedDeviceInfo = { udid, name }
    if (changed) {
      clearPreparedSigned()
    }
    addLog(`pair: udid=${udid}${name ? ` (${name})` : ""}`)
  } finally {
    busyPairing = false
    refreshUi()
  }
}

const ensureAnisetteData = async (): Promise<AnisetteData> => {
  if (anisetteData) {
    return anisetteData
  }
  addLog("login: init anisette...")
  await provisionAnisette()
  anisetteData = await getAnisetteData()
  addLog(`login: anisette ready (${shortToken(anisetteData.machineID)})`)
  return anisetteData
}

const loginAndSignFlow = async (): Promise<void> => {
  if (busyLoginSign) {
    return
  }
  busyLoginSign = true
  let didSign = false
  setInstallProgress(0, "starting")
  refreshUi()

  try {
    const appleId = appleIdInput.value.trim()
    const password = applePasswordInput.value
    if (!appleId || !password) {
      throw new Error("please input email and password")
    }

    saveText(APPLE_ID_STORAGE_KEY, appleId)

    const anisette = await ensureAnisetteData()
    addLog("login: authenticating Apple account...")
    const context = await loginAppleDeveloperAccount({
      anisetteData: anisette,
      credentials: { appleId, password },
      onLog: addLog,
    })

    loginContext = await refreshAppleDeveloperContext(context, addLog)
    persistAccountSummary(loginContext)
    clearPreparedSigned()
    addLog("login: account ready")

    if (selectedIpaFile && pairedDeviceInfo) {
      await signSelectedIpa()
      didSign = true
    } else {
      addLog("login: done. pair device and select ipa to complete signing")
    }
  } finally {
    busyLoginSign = false
    if (!didSign) {
      setInstallProgress(0, "idle")
    }
    refreshUi()
  }
}

const signSelectedIpa = async (): Promise<File> => {
  if (!selectedIpaFile) {
    throw new Error("no ipa selected")
  }
  if (!loginContext) {
    throw new Error("not logged in")
  }
  if (!pairedDeviceInfo) {
    throw new Error("device not paired")
  }

  const refreshed = await refreshAppleDeveloperContext(loginContext, addLog)
  loginContext = refreshed
  persistAccountSummary(refreshed)

  addLog("sign: preparing ipa...")
  const result = await signIpaWithAppleContext({
    ipaFile: selectedIpaFile,
    context: refreshed,
    deviceUdid: pairedDeviceInfo.udid,
    deviceName: pairedDeviceInfo.name ?? undefined,
    onLog: addLog,
  })

  preparedSignedIpa = result.signedFile
  preparedSourceKey = buildPreparedSourceKey(
    selectedIpaFile,
    pairedDeviceInfo.udid,
    refreshed.team.identifier,
  )
  addLog(`sign: done -> ${preparedSignedIpa.name}`)
  return preparedSignedIpa
}

const installFlow = async (): Promise<void> => {
  if (busyInstall) {
    return
  }
  busyInstall = true
  installProgressIncludesSigning = false
  setInstallProgress(0, "starting")
  refreshUi()

  try {
    if (!selectedIpaFile) {
      throw new Error("please drag/select ipa first")
    }
    if (!loginContext) {
      throw new Error("please login first")
    }
    if (!pairedDeviceInfo) {
      throw new Error("please pair device first")
    }

    const client = await ensureClientSelected()
    if (!client.isSessionStarted) {
      await pairDeviceFlow()
    }

    const currentSourceKey = buildPreparedSourceKey(
      selectedIpaFile,
      pairedDeviceInfo.udid,
      loginContext.team.identifier,
    )
    installProgressIncludesSigning = !preparedSignedIpa || preparedSourceKey !== currentSourceKey
    if (installProgressIncludesSigning) {
      await signSelectedIpa()
    }

    const upload = preparedSignedIpa
    if (!upload) {
      throw new Error("signed ipa is missing")
    }

    addLog("install: uploading and installing...")
    const bytes = new Uint8Array(await upload.arrayBuffer())
    const safeName = webmuxdSanitizeIpaFileName(upload.name)
    await webmuxdInstallIpaViaInstProxy(client, bytes, safeName, addLog)
    addLog("install: complete")
    setInstallProgress(100, "complete")
  } catch (error) {
    setInstallProgress(0, "failed")
    throw error
  } finally {
    busyInstall = false
    installProgressIncludesSigning = false
    refreshUi()
  }
}

const refreshUi = (): void => {
  const summary = demoModeEnabled ? "hidden" : loadAccountSummaryText()
  const ipaText = demoModeEnabled
    ? selectedIpaFile
      ? "selected"
      : "none"
    : selectedIpaFile
      ? `${selectedIpaFile.name} (${selectedIpaFile.size} bytes)`
      : "none"
  const signedText = demoModeEnabled ? (preparedSignedIpa ? "prepared" : "none") : preparedSignedIpa ? preparedSignedIpa.name : "none"

  deviceUdidView.textContent = demoModeEnabled ? "hidden" : pairedDeviceInfo?.udid ?? "-"
  dropLabel.textContent = demoModeEnabled
    ? selectedIpaFile
      ? "ipa selected"
      : "drag or select ipa"
    : selectedIpaFile
      ? selectedIpaFile.name
      : "drag or select ipa"

  statusLine.textContent = demoModeEnabled
    ? "demo mode enabled | all sensitive details hidden"
    : `webusb=${isSupported ? "ok" : "no"} | device=${pairedDeviceInfo ? "paired" : "-"} | ipa=${ipaText} | account=${summary} | signed=${signedText}`

  pairDeviceButton.disabled = busyPairing || busyInstall || !isSupported
  loginSignButton.disabled =
    busyPairing || busyLoginSign || busyInstall || appleIdInput.value.trim().length === 0 || applePasswordInput.value.length === 0
  installButton.disabled = busyPairing || busyLoginSign || busyInstall || !selectedIpaFile || !pairedDeviceInfo || !loginContext
  refreshInstallProgressUi()
}

const renderLogView = (): void => {
  logView.textContent = logLines.slice(-200).join("\n")
}

const setInstallProgress = (percent: number, status: string): void => {
  installProgressPercent = Math.max(0, Math.min(100, Math.round(percent)))
  installProgressStatus = status
  refreshInstallProgressUi()
}

const refreshInstallProgressUi = (): void => {
  installProgressBarView.style.width = `${installProgressPercent}%`
  const text = busyInstall || busyLoginSign
    ? `${installProgressStatus} · ${installProgressPercent}%`
    : installProgressPercent === 0
      ? "idle"
      : `${installProgressStatus} · ${installProgressPercent}%`
  installProgressTextView.textContent = text
}

const parseInstallProgress = (message: string): ProgressUpdate | null => {
  const statusMatch = message.match(/InstProxy status:\s*([^,]+)(?:,|$)/i)
  if (!statusMatch) {
    return null
  }
  const status = statusMatch[1].trim()
  const percentMatch = message.match(/Percent=(\d{1,3})%/i)
  if (percentMatch) {
    return { source: "install", percent: Number(percentMatch[1]), status }
  }
  if (status.toLowerCase() === "complete") {
    return { source: "install", percent: 100, status }
  }
  return { source: "install", percent: installProgressPercent, status }
}

const parseSigningProgress = (message: string): ProgressUpdate | null => {
  const lower = message.toLowerCase()
  if (lower.includes("sign: preparing ipa")) {
    return { source: "sign", percent: 8, status: "preparing ipa" }
  }
  if (lower.includes("signing stage: refreshing team")) {
    return { source: "sign", percent: 14, status: "refreshing team" }
  }
  if (lower.includes("signing stage: refreshed team")) {
    return { source: "sign", percent: 22, status: "team ready" }
  }
  if (lower.includes("signing stage: using team")) {
    return { source: "sign", percent: 28, status: "using team" }
  }
  if (lower.includes("signing stage: creating development certificate")) {
    return { source: "sign", percent: 36, status: "creating certificate" }
  }
  if (lower.includes("signing stage: using cached certificate")) {
    return { source: "sign", percent: 40, status: "using certificate" }
  }
  if (lower.includes("signing stage: certificate ready")) {
    return { source: "sign", percent: 48, status: "certificate ready" }
  }
  if (lower.includes("signing stage: registering device")) {
    return { source: "sign", percent: 56, status: "registering device" }
  }
  if (
    lower.includes("signing stage: device already registered") ||
    lower.includes("signing stage: device registered") ||
    lower.includes("signing stage: device confirmed")
  ) {
    return { source: "sign", percent: 62, status: "device ready" }
  }
  if (lower.includes("signing stage: creating app id") || lower.includes("signing stage: reuse app id")) {
    return { source: "sign", percent: 72, status: "app id ready" }
  }
  if (lower.includes("signing stage: fetching provisioning profile")) {
    return { source: "sign", percent: 82, status: "fetching profile" }
  }
  if (lower.includes("signing stage: resigning ipa")) {
    return { source: "sign", percent: 90, status: "resigning ipa" }
  }
  if (lower.includes("signing stage: complete") || lower.includes("sign: done ->")) {
    return { source: "sign", percent: 100, status: "complete" }
  }
  return null
}

const parseProgressFromLog = (message: string): ProgressUpdate | null => {
  return parseInstallProgress(message) ?? parseSigningProgress(message)
}

const applyProgressUpdate = (update: ProgressUpdate): void => {
  if (busyInstall && update.source === "sign") {
    const mapped = installProgressIncludesSigning ? Math.round(update.percent * 0.55) : update.percent
    setInstallProgress(mapped, `signing: ${update.status}`)
    return
  }
  if (busyInstall && update.source === "install") {
    const mapped = installProgressIncludesSigning
      ? 55 + Math.round(update.percent * 0.45)
      : update.percent
    setInstallProgress(mapped, `installing: ${update.status}`)
    return
  }
  if (update.source === "sign") {
    setInstallProgress(update.percent, `signing: ${update.status}`)
    return
  }
  setInstallProgress(update.percent, `installing: ${update.status}`)
}

const sanitizeDemoLogText = (text: string): string => {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\budid=([A-Za-z0-9-]+)/gi, "udid=[hidden]")
    .replace(/\b([A-Fa-f0-9]{24,64})\b/g, "[id]")
    .replace(/(ipa selected:\s*).+/i, "$1[file]")
    .replace(/(ipa dropped:\s*).+/i, "$1[file]")
    .replace(/(sign: done ->\s*).+/i, "$1[file]")
    .replace(/(loaded local pair record for\s+).+/i, "$1[udid]")
    .replace(/(registering device\s+)[^\s]+(\s+as\s+).+/i, "$1[udid]$2[device]")
    .replace(/(device (already )?registered \()[^)]+(\))/i, "$1[udid]$3")
    .replace(/(team=)[^ ]+\s+\([^)]+\)/i, "$1[hidden]")
    .replace(/(using team\s+)[^ ]+\s+\([^)]+\)/i, "$1[hidden]")
}

const applyDemoMode = (): void => {
  document.body.classList.toggle("demo-mode", demoModeEnabled)
  demoModeToggle.checked = demoModeEnabled
  appleIdInput.type = demoModeEnabled ? "password" : "email"
  appleIdInput.autocomplete = demoModeEnabled ? "off" : "username"
  appleIdInput.placeholder = demoModeEnabled ? "hidden in demo mode" : "your apple id"
  applePasswordInput.placeholder = demoModeEnabled
    ? "hidden in demo mode"
    : "app-specific password"
  if (demoModeEnabled) {
    for (let index = 0; index < logLines.length; index += 1) {
      logLines[index] = sanitizeDemoLogText(logLines[index])
    }
  }
  renderLogView()
  refreshInstallProgressUi()
}

const loadAccountSummaryText = (): string => {
  if (loginContext) {
    return `${loginContext.appleId} / ${loginContext.team.identifier}`
  }
  const stored = loadStoredAccountSummary()
  if (!stored) {
    return "-"
  }
  return `${stored.appleId} / ${stored.teamId}`
}

pairDeviceButton.addEventListener("click", async () => {
  try {
    await pairDeviceFlow()
  } catch (error) {
    addLog(`pair failed: ${formatError(error)}`)
    refreshUi()
  }
})

loginSignButton.addEventListener("click", async () => {
  try {
    await loginAndSignFlow()
  } catch (error) {
    addLog(`login/sign failed: ${formatError(error)}`)
    refreshUi()
  }
})

installButton.addEventListener("click", async () => {
  try {
    await installFlow()
  } catch (error) {
    addLog(`install failed: ${formatError(error)}`)
    refreshUi()
  }
})

appleIdInput.addEventListener("change", () => {
  saveText(APPLE_ID_STORAGE_KEY, appleIdInput.value.trim())
  refreshUi()
})

demoModeToggle.addEventListener("change", () => {
  demoModeEnabled = demoModeToggle.checked
  saveText(DEMO_MODE_STORAGE_KEY, demoModeEnabled ? "1" : "0")
  applyDemoMode()
  addLog(demoModeEnabled ? "demo mode enabled" : "demo mode disabled")
  refreshUi()
})

ipaFileInput.addEventListener("change", () => {
  selectedIpaFile = ipaFileInput.files && ipaFileInput.files.length > 0 ? ipaFileInput.files[0] : null
  clearPreparedSigned()
  addLog(selectedIpaFile ? `ipa selected: ${selectedIpaFile.name}` : "ipa selection cleared")
  refreshUi()
})

dropArea.addEventListener("dragenter", (event) => {
  event.preventDefault()
  dropArea.classList.add("dragover")
})

dropArea.addEventListener("dragover", (event) => {
  event.preventDefault()
  dropArea.classList.add("dragover")
})

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("dragover")
})

dropArea.addEventListener("drop", (event) => {
  event.preventDefault()
  dropArea.classList.remove("dragover")
  const file = event.dataTransfer?.files?.[0] ?? null
  if (!file) {
    addLog("drop ignored: no file")
    return
  }
  selectedIpaFile = file
  clearPreparedSigned()
  addLog(`ipa dropped: ${file.name}`)
  refreshUi()
})

window.addEventListener("beforeunload", () => {
  void directClient?.close()
})

applyDemoMode()
addLog("ready")
refreshUi()

function buildPreparedSourceKey(file: File, udid: string, teamId: string): string {
  return `${file.name}:${file.size}:${file.lastModified}:${udid}:${teamId}`
}

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

function mustGetButton(id: string): HTMLButtonElement {
  const element = document.getElementById(id)
  if (!element || !(element instanceof HTMLButtonElement)) {
    throw new Error(`Button #${id} not found`)
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

function persistAccountSummary(context: AppleDeveloperContext): void {
  const payload: StoredAccountSummary = {
    appleId: context.appleId,
    teamId: context.team.identifier,
    teamName: context.team.name,
    updatedAtIso: new Date().toISOString(),
  }
  saveText(APPLE_ACCOUNT_SUMMARY_STORAGE_KEY, JSON.stringify(payload))
}

function loadStoredAccountSummary(): StoredAccountSummary | null {
  const raw = loadText(APPLE_ACCOUNT_SUMMARY_STORAGE_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as StoredAccountSummary
    if (!parsed || typeof parsed !== "object") {
      return null
    }
    if (!parsed.appleId || !parsed.teamId || !parsed.teamName) {
      return null
    }
    return parsed
  } catch {
    return null
  }
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
