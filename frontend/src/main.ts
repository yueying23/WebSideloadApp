import "./style.css"
import {
  DirectUsbMuxClient,
  LOCKDOWN_PORT,
  WebUsbTransport,
  createHostId,
  createOpenSslWasmTlsFactory,
  createSystemBuid,
  decodeStoredPairRecord,
  encodeStoredPairRecord,
  generatePairRecordWithOpenSslWasm,
  installIpaViaInstProxy,
  sanitizeIpaFileName,
  type PairRecord,
  type StoredPairRecordPayload,
} from "webmuxd"
import type { AnisetteData } from "./anisette-service"
import type { AppleDeveloperContext } from "./apple-signing"

type WasmPairRecordPayload = Pick<
  PairRecord,
  | "hostId"
  | "systemBuid"
  | "hostCertificatePem"
  | "hostPrivateKeyPem"
  | "rootCertificatePem"
  | "rootPrivateKeyPem"
  | "deviceCertificatePem"
>

type AnisetteServiceModule = typeof import("./anisette-service")
type AppleSigningModule = typeof import("./apple-signing")

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

interface StoredAnisetteDataPayload {
  machineID: string
  oneTimePassword: string
  localUserID: string
  routingInfo: number
  deviceUniqueIdentifier: string
  deviceDescription: string
  deviceSerialNumber: string
  dateIso: string
  locale: string
  timeZone: string
}

interface StoredAccountSessionPayload {
  appleId: string
  teamId: string
  teamName: string
  dsid: string
  authToken: string
  anisetteData: StoredAnisetteDataPayload
  updatedAtIso: string
}

type AppPage = "login" | "sign"

const HOST_ID_STORAGE_KEY = "webmuxd:host-id"
const SYSTEM_BUID_STORAGE_KEY = "webmuxd:system-buid"
const PAIR_RECORDS_STORAGE_KEY = "webmuxd:pair-records-by-udid"
const LEGACY_PAIR_RECORD_STORAGE_KEY = "webmuxd:pair-record"
const APPLE_ID_STORAGE_KEY = "webmuxd:apple-id"
const APPLE_ACCOUNT_SUMMARY_STORAGE_KEY = "webmuxd:apple-account-summary"
const APPLE_ACCOUNT_LIST_STORAGE_KEY = "webmuxd:apple-account-list"
const APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY = "webmuxd:apple-account-session-map"
const APPLE_REMEMBER_SESSION_STORAGE_KEY = "webmuxd:apple-remember-session"
const SELECTED_DEVICE_UDID_STORAGE_KEY = "webmuxd:selected-device-udid"
const LOGIN_PAGE_HASH = "#/login"
const SIGN_PAGE_HASH = "#/sign"

let anisetteServicePromise: Promise<AnisetteServiceModule> | null = null
let appleSigningModulePromise: Promise<AppleSigningModule> | null = null

const loadAnisetteService = async (): Promise<AnisetteServiceModule> => {
  if (!anisetteServicePromise) {
    anisetteServicePromise = import("./anisette-service")
  }

  return await anisetteServicePromise
}

const loadAppleSigningModule = async (): Promise<AppleSigningModule> => {
  if (!appleSigningModulePromise) {
    appleSigningModulePromise = import("./apple-signing")
  }

  return await appleSigningModulePromise
}

const app = document.querySelector<HTMLDivElement>("#app")
if (!app) {
  throw new Error("App root is missing")
}

app.innerHTML = `
  <main class="min-h-screen bg-gray-50">
    <section class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 class="text-2xl font-bold text-gray-900">Developer Signing</h1>
        <nav class="grid w-full grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-white p-1 sm:max-w-[360px]">
          <button id="nav-login-btn" type="button" class="page-tab rounded-md border px-3 py-2 text-sm font-medium transition" data-active="true">Login</button>
          <button id="nav-sign-btn" type="button" class="page-tab rounded-md border px-3 py-2 text-sm font-medium transition" data-active="false">Sign IPA</button>
        </nav>
      </header>

      <section id="page-login" class="space-y-4">
        <div class="rounded-lg border border-gray-200 bg-white p-4">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <span class="text-sm font-bold">ID</span>
            </div>
            <div>
              <p class="text-sm font-medium text-gray-900">Local developer signing workspace</p>
              <p class="mt-1 text-sm text-gray-600">
                Credentials stay in your browser. We only cache team and device signing context.
              </p>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 bg-white p-4">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-sm font-medium text-gray-900">Setup Progress</h2>
            <span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">2 steps</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div id="setup-step-device" class="setup-step rounded-md border px-3 py-2">
              <div class="flex items-center justify-center gap-2">
                <span id="setup-step-device-marker" class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">1</span>
                <p class="text-xs font-medium">Device</p>
              </div>
            </div>
            <div id="setup-step-login" class="setup-step rounded-md border px-3 py-2">
              <div class="flex items-center justify-center gap-2">
                <span id="setup-step-login-marker" class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">2</span>
                <p class="text-xs font-medium">Sign In</p>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 bg-white p-6">
          <div class="mb-4 flex items-center justify-between gap-3">
            <h2 class="text-lg font-medium text-gray-900">Developer Account</h2>
            <span id="login-session-state" class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">Not Logged In</span>
          </div>
          <div class="space-y-4">
            <div>
              <label for="apple-id" class="mb-1 block text-sm font-medium text-gray-700">Apple ID</label>
              <input id="apple-id" type="email" autocomplete="username" placeholder="your@email.com" class="block h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label for="apple-password" class="mb-1 block text-sm font-medium text-gray-700">Password</label>
              <input id="apple-password" type="password" autocomplete="current-password" placeholder="app-specific password" class="block h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <label class="inline-flex items-center gap-2 text-xs text-gray-600">
              <input id="remember-session" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked />
              <span>Remember login session on this browser</span>
            </label>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <button id="open-signing-page-btn" type="button" class="inline-flex min-w-28 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">Sign Page</button>
              <button id="login-sign-btn" class="inline-flex min-w-28 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Sign In</button>
            </div>
          </div>
          <div class="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p class="text-xs text-gray-500">Account Summary</p>
            <p id="account-summary" class="mt-1 text-sm font-medium text-gray-800">-</p>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 bg-white p-4">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-sm font-medium text-gray-900">Saved Accounts</h2>
            <span class="text-xs text-gray-500">local</span>
          </div>
          <div id="saved-accounts-list" class="space-y-2"></div>
        </div>
      </section>

      <section id="page-sign" class="hidden">
        <div class="grid w-full gap-4">
          <div class="space-y-4">
            <div class="rounded-lg border border-gray-200 bg-white p-4">
              <p class="text-sm text-gray-600">
                Upload an IPA, then sign locally in browser with your active Apple Developer account.
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <span id="sign-page-account" class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Account: -</span>
              </div>
            </div>

            <div class="rounded-lg border border-gray-200 bg-white p-6">
              <div class="space-y-4">
                <div>
                  <label for="ipa-file" class="mb-1 block text-sm font-medium text-gray-700">IPA File</label>
                  <label id="ipa-drop-zone" for="ipa-file" class="drop-zone block cursor-pointer rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center transition">
                    <span id="drop-label" class="block truncate text-sm font-medium text-gray-800">No file selected</span>
                    <span class="mt-1 block text-xs text-gray-500">Click or drag .ipa here</span>
                    <input id="ipa-file" type="file" accept=".ipa,application/octet-stream" class="hidden" />
                  </label>
                </div>

                <div class="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div class="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                    <button id="pair-device-btn" class="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">Pair Device</button>
                    <div class="space-y-2">
                      <p class="mb-1 text-xs text-gray-500">Device UDID</p>
                      <code id="device-udid" class="udid block overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700">-</code>
                      <label class="block">
                        <span class="mb-1 block text-xs text-gray-500">Target UDID</span>
                        <select id="device-udid-select" class="block h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                          <option value="">Select paired UDID</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap items-center justify-end gap-2">
                  <button id="sign-btn" class="inline-flex min-w-28 items-center justify-center rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">Sign IPA</button>
                  <button id="install-btn" class="inline-flex min-w-36 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Install Signed IPA</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 progress-wrap rounded-lg border border-gray-200 bg-white p-4">
          <div class="mb-2 flex items-center justify-between">
            <p class="text-sm font-medium text-gray-900">Signing Progress</p>
            <span id="install-progress-text" class="text-xs text-gray-500">idle</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
            <div id="install-progress-bar" class="progress-bar h-full w-0 rounded-full bg-blue-600"></div>
          </div>
          <div id="status-line" class="hidden">status: idle</div>
        </div>

        <div class="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <p class="text-sm font-medium text-gray-900">Logs</p>
          <pre id="log" class="log mt-2 max-h-72 overflow-auto rounded-md bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-700">log...</pre>
        </div>
      </section>
    </section>
  </main>

  <div id="two-factor-modal" class="trust-modal fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/55 p-4" aria-hidden="true">
    <section role="dialog" aria-modal="true" aria-labelledby="two-factor-modal-title" class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/20">
      <h2 id="two-factor-modal-title" class="text-lg font-semibold text-slate-900">Two-Factor Authentication</h2>
      <p class="mt-2 text-sm leading-6 text-slate-600">Enter the verification code from your trusted device.</p>
      <label for="two-factor-code" class="mt-4 block text-sm font-medium text-slate-700">Verification Code</label>
      <input id="two-factor-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" class="mt-1 block h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
      <p id="two-factor-error" class="mt-2 min-h-5 text-xs text-red-600"></p>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button id="two-factor-cancel" type="button" class="h-10 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 transition hover:bg-slate-50">Cancel</button>
        <button id="two-factor-submit" type="button" class="h-10 rounded-xl bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700">Verify</button>
      </div>
    </section>
  </div>

  <div id="trust-modal" class="trust-modal fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/55 p-4" aria-hidden="true">
    <section role="dialog" aria-modal="true" aria-labelledby="trust-modal-title" class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/20">
      <h2 id="trust-modal-title" class="text-lg font-semibold text-slate-900">Confirm Trust on Device</h2>
      <p class="mt-3 text-sm leading-6 text-slate-600">
        Please unlock your iPhone/iPad, tap <strong>Trust</strong>, and enter passcode if asked.
      </p>
      <p class="mt-2 text-sm leading-6 text-slate-600">After that, click <strong>Pair Device</strong> again.</p>
      <button id="trust-modal-close" type="button" class="mt-4 h-10 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800">OK</button>
    </section>
  </div>
`

const isSupported = WebUsbTransport.supported()

const appleIdInput = mustGetInput("apple-id")
const applePasswordInput = mustGetInput("apple-password")
const rememberSessionInput = mustGetInput("remember-session")
const ipaFileInput = mustGetInput("ipa-file")
const deviceUdidSelect = mustGetSelect("device-udid-select")
const setupStepDeviceView = mustGetElement("setup-step-device")
const setupStepLoginView = mustGetElement("setup-step-login")
const setupStepDeviceMarkerView = mustGetElement("setup-step-device-marker")
const setupStepLoginMarkerView = mustGetElement("setup-step-login-marker")
const signPageAccountView = mustGetElement("sign-page-account")

const navLoginButton = mustGetButton("nav-login-btn")
const navSignButton = mustGetButton("nav-sign-btn")
const openSigningPageButton = mustGetButton("open-signing-page-btn")
const loginPageView = mustGetElement("page-login")
const signPageView = mustGetElement("page-sign")
const accountSummaryView = mustGetElement("account-summary")
const savedAccountsListView = mustGetElement("saved-accounts-list")
const loginSessionStateView = mustGetElement("login-session-state")

const loginSignButton = mustGetButton("login-sign-btn")
const pairDeviceButton = mustGetButton("pair-device-btn")
const signButton = mustGetButton("sign-btn")
const installButton = mustGetButton("install-btn")

const dropArea = mustGetElement("ipa-drop-zone")
const dropLabel = mustGetElement("drop-label")
const deviceUdidView = mustGetElement("device-udid")
const statusLine = mustGetElement("status-line")
const installProgressTextView = mustGetElement("install-progress-text")
const installProgressBarView = mustGetElement("install-progress-bar")
const logView = mustGetElement("log")
const twoFactorModal = mustGetElement("two-factor-modal")
const twoFactorCodeInput = mustGetInput("two-factor-code")
const twoFactorErrorView = mustGetElement("two-factor-error")
const twoFactorSubmitButton = mustGetButton("two-factor-submit")
const twoFactorCancelButton = mustGetButton("two-factor-cancel")
const trustModal = mustGetElement("trust-modal")
const trustModalCloseButton = mustGetButton("trust-modal-close")

const logLines: string[] = []
const accountContextMap = new Map<string, AppleDeveloperContext>()

let directClient: DirectUsbMuxClient | null = null
let pairedDeviceInfo: PairedDeviceInfo | null = null
let selectedIpaFile: File | null = null

let anisetteData: AnisetteData | null = null
let anisetteProvisioned = false
let loginContext: AppleDeveloperContext | null = null

let preparedSignedIpa: File | null = null
let preparedSourceKey: string | null = null

let busyPairing = false
let busyLoginSign = false
let busySign = false
let busyInstall = false
let installProgressPercent = 0
let installProgressStatus = "idle"
let waitingForTrustConfirmation = false
let waitingForTwoFactorCode = false
let twoFactorSubmitHandler: ((code: string) => void) | null = null
let trustModalVisible = false
let twoFactorModalVisible = false
let currentPage: AppPage = resolvePageFromHash(window.location.hash)
let selectedTargetUdid = loadText(SELECTED_DEVICE_UDID_STORAGE_KEY) ?? ""

appleIdInput.value = loadText(APPLE_ID_STORAGE_KEY) ?? ""
rememberSessionInput.checked = loadText(APPLE_REMEMBER_SESSION_STORAGE_KEY) !== "0"

const addLog = (message: string): void => {
  const progress = parseProgressFromLog(message)
  if (progress) {
    applyProgressUpdate(progress)
  }

  const now = new Date()
  const time = `${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, "0")}`
  logLines.push(`[${time}] ${message}`)
  renderLogView()
}

const isPairingDialogPendingError = (error: unknown): boolean => {
  return formatError(error).includes("PairingDialogResponsePending")
}

const notifyPairingTrustPending = (): void => {
  waitingForTrustConfirmation = true
  trustModalVisible = true
  addLog("pair: waiting for confirm... please tap Trust on device")
  refreshUi()
}

const requestTwoFactorCode = (submitCode: (code: string) => void): void => {
  waitingForTwoFactorCode = true
  twoFactorSubmitHandler = submitCode
  twoFactorCodeInput.value = ""
  twoFactorErrorView.textContent = ""
  twoFactorModalVisible = true
  addLog("login: 2FA required, waiting for code")
  refreshUi()
  window.setTimeout(() => {
    twoFactorCodeInput.focus()
    twoFactorCodeInput.select()
  }, 0)
}

const submitTwoFactorCode = (): void => {
  if (!twoFactorSubmitHandler) {
    return
  }
  const code = twoFactorCodeInput.value.trim()
  if (code.length === 0) {
    twoFactorErrorView.textContent = "Please enter verification code."
    return
  }

  const submit = twoFactorSubmitHandler
  twoFactorSubmitHandler = null
  waitingForTwoFactorCode = false
  twoFactorModalVisible = false
  twoFactorErrorView.textContent = ""
  refreshUi()
  submit(code)
}

const cancelTwoFactorCode = (): void => {
  if (!twoFactorSubmitHandler) {
    twoFactorModalVisible = false
    waitingForTwoFactorCode = false
    refreshUi()
    return
  }

  const submit = twoFactorSubmitHandler
  twoFactorSubmitHandler = null
  waitingForTwoFactorCode = false
  twoFactorModalVisible = false
  twoFactorCodeInput.value = ""
  twoFactorErrorView.textContent = ""
  refreshUi()
  addLog("login: 2FA canceled")
  submit("__CANCELLED__")
}

const closeTrustModal = (): void => {
  trustModalVisible = false
  refreshUi()
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
  directClient = new DirectUsbMuxClient(transport, {
    log: addLog,
    onStateChange: refreshUi,
    lockdownLabel: "webmuxd.frontend",
    tlsFactory: createOpenSslWasmTlsFactory(),
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
  trustModalVisible = false
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
      try {
        const pairResult = await client.pairDevice(hostId, systemBuid)
        savePairRecordForUdid(udid, pairResult)
        waitingForTrustConfirmation = false
        trustModalVisible = false
        addLog("pair: success")
      } catch (error) {
        if (isPairingDialogPendingError(error)) {
          notifyPairingTrustPending()
        }
        throw error
      }
    }

    if (!client.isSessionStarted) {
      const session = await client.startSession(hostId, systemBuid)
      waitingForTrustConfirmation = false
      trustModalVisible = false
      addLog(`pair: session ready, ssl=${String(session.enableSessionSsl)}`)
    }

    const changed = pairedDeviceInfo?.udid !== udid
    pairedDeviceInfo = { udid, name }
    if (changed) {
      clearPreparedSigned()
    }
    selectedTargetUdid = udid
    saveText(SELECTED_DEVICE_UDID_STORAGE_KEY, udid)
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

  const anisetteService = await loadAnisetteService()
  const anisette = await anisetteService.initAnisette()
  const alreadyProvisioned = anisette.isProvisioned
  anisetteProvisioned = alreadyProvisioned
  if (alreadyProvisioned) {
    addLog("login: anisette already provisioned")
  } else {
    addLog("login: preparing anisette environment...")
    await anisetteService.provisionAnisette()
    anisetteProvisioned = true
    addLog("login: anisette provisioned")
  }

  anisetteData = await anisetteService.getAnisetteData()
  addLog(`login: anisette ready (${shortToken(anisetteData.machineID)})`)
  refreshUi()
  return anisetteData
}

const syncAnisetteProvisionedStatus = async (): Promise<void> => {
  try {
    const anisetteService = await loadAnisetteService()
    const anisette = await anisetteService.initAnisette()
    anisetteProvisioned = anisette.isProvisioned
    refreshUi()
  } catch (error) {
    addLog(`anisette status check failed: ${formatError(error)}`)
  }
}

const loginAndSignFlow = async (): Promise<void> => {
  if (busyLoginSign) {
    return
  }
  busyLoginSign = true
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
    const appleSigning = await loadAppleSigningModule()
    const context = await appleSigning.loginAppleDeveloperAccount({
      anisetteData: anisette,
      credentials: { appleId, password },
      onLog: addLog,
      onTwoFactorRequired: (submitCode) => {
        requestTwoFactorCode(submitCode)
      },
    })

    loginContext = await appleSigning.refreshAppleDeveloperContext(context, addLog)
    accountContextMap.set(accountKey(loginContext.appleId, loginContext.team.identifier), loginContext)
    persistAccountSummary(loginContext)
    if (rememberSessionInput.checked) {
      persistAccountSession(loginContext)
      addLog("login: session saved locally")
    } else {
      removeStoredAccountSession(loginContext.appleId, loginContext.team.identifier)
      addLog("login: session persistence disabled")
    }
    clearPreparedSigned()
    addLog("login: account ready")
    addLog("login: done. continue on sign/install page")
    navigateToPage("sign")
  } finally {
    waitingForTwoFactorCode = false
    twoFactorSubmitHandler = null
    twoFactorModalVisible = false
    twoFactorErrorView.textContent = ""
    busyLoginSign = false
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
  const targetUdid = selectedTargetUdid.trim()
  if (targetUdid.length === 0) {
    throw new Error("please select target udid")
  }

  const latestAnisette = await ensureAnisetteData()
  loginContext = {
    ...loginContext,
    session: {
      ...loginContext.session,
      anisetteData: latestAnisette,
    },
  }

  const appleSigning = await loadAppleSigningModule()
  const refreshed = await appleSigning.refreshAppleDeveloperContext(loginContext, addLog)
  loginContext = refreshed
  accountContextMap.set(accountKey(refreshed.appleId, refreshed.team.identifier), refreshed)
  persistAccountSummary(refreshed)
  if (rememberSessionInput.checked) {
    persistAccountSession(refreshed)
  }

  addLog("sign: preparing ipa...")
  const result = await appleSigning.signIpaWithAppleContext({
    ipaFile: selectedIpaFile,
    context: refreshed,
    deviceUdid: targetUdid,
    deviceName: pairedDeviceInfo?.udid === targetUdid ? (pairedDeviceInfo.name ?? undefined) : undefined,
    onLog: addLog,
  })

  preparedSignedIpa = result.signedFile
  preparedSourceKey = buildPreparedSourceKey(
    selectedIpaFile,
    targetUdid,
  )
  addLog(`sign: done -> ${preparedSignedIpa.name}`)
  return preparedSignedIpa
}

const signFlow = async (): Promise<void> => {
  if (busySign) {
    return
  }
  busySign = true
  setInstallProgress(0, "starting")
  refreshUi()

  try {
    await signSelectedIpa()
    setInstallProgress(100, "complete")
  } catch (error) {
    setInstallProgress(0, "failed")
    throw error
  } finally {
    busySign = false
    refreshUi()
  }
}

const installFlow = async (): Promise<void> => {
  if (busyInstall) {
    return
  }
  busyInstall = true
  setInstallProgress(0, "starting")
  refreshUi()

  try {
    if (!selectedIpaFile) {
      throw new Error("please drag/select ipa first")
    }
    const targetUdid = selectedTargetUdid.trim()
    if (targetUdid.length === 0) {
      throw new Error("please select target udid")
    }

    const client = await ensureClientSelected()
    if (!client.isSessionStarted) {
      await pairDeviceFlow()
    }

    if (pairedDeviceInfo?.udid !== targetUdid) {
      throw new Error("connected device udid does not match selected target")
    }

    const currentSourceKey = buildPreparedSourceKey(
      selectedIpaFile,
      targetUdid,
    )
    if (!preparedSignedIpa || preparedSourceKey !== currentSourceKey) {
      throw new Error("please sign ipa first, then install")
    }

    const upload = preparedSignedIpa
    if (!upload) {
      throw new Error("signed ipa is missing")
    }

    addLog("install: uploading and installing...")
    const bytes = new Uint8Array(await upload.arrayBuffer())
    const safeName = sanitizeIpaFileName(upload.name)
    await installIpaViaInstProxy(client, bytes, safeName, addLog)
    addLog("install: complete")
    setInstallProgress(100, "complete")
  } catch (error) {
    setInstallProgress(0, "failed")
    throw error
  } finally {
    busyInstall = false
    refreshUi()
  }
}

const refreshUi = (): void => {
  const summary = loadAccountSummaryText()
  const ipaText = selectedIpaFile
    ? `${selectedIpaFile.name} (${selectedIpaFile.size} bytes)`
    : "none"
  const signedText = preparedSignedIpa ? preparedSignedIpa.name : "none"
  const targetUdid = selectedTargetUdid.trim()
  const knownUdids = listKnownDeviceUdids()
  const shouldResetTarget = targetUdid.length > 0 && !knownUdids.includes(targetUdid)
  if (shouldResetTarget) {
    selectedTargetUdid = ""
    saveText(SELECTED_DEVICE_UDID_STORAGE_KEY, "")
  }

  const isLoginPage = currentPage === "login"
  loginPageView.classList.toggle("hidden", !isLoginPage)
  signPageView.classList.toggle("hidden", isLoginPage)
  navLoginButton.dataset.active = String(isLoginPage)
  navSignButton.dataset.active = String(!isLoginPage)

  renderDeviceUdidSelect(knownUdids)
  deviceUdidView.textContent = pairedDeviceInfo?.udid ?? "-"
  dropLabel.textContent = selectedIpaFile
    ? `${selectedIpaFile.name}${selectedIpaFile.size > 0 ? ` (${Math.max(0.01, selectedIpaFile.size / 1024 / 1024).toFixed(2)} MB)` : ""}`
    : "No file selected"

  const deviceState = waitingForTrustConfirmation
    ? "waiting trust confirm"
    : pairedDeviceInfo
      ? "paired"
      : "-"
  statusLine.textContent =
    `webusb=${isSupported ? "ok" : "no"} | device=${deviceState} | target=${selectedTargetUdid || "-"} | ipa=${ipaText} | account=${summary} | signed=${signedText}`

  accountSummaryView.textContent = summary
  renderSavedAccountsList()
  loginSessionStateView.textContent = loginContext
    ? "Logged In"
    : "Not Logged In"
  loginSessionStateView.className = loginContext
    ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
    : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
  signPageAccountView.textContent = `Account: ${summary}`

  const anisetteReady = anisetteProvisioned || anisetteData !== null
  setupStepDeviceView.dataset.state = anisetteReady ? "done" : "active"
  setupStepLoginView.dataset.state = loginContext ? "done" : anisetteReady ? "active" : "idle"
  setupStepDeviceMarkerView.textContent = anisetteReady ? "✓" : "1"
  setupStepLoginMarkerView.textContent = loginContext ? "✓" : "2"

  trustModal.classList.toggle("open", trustModalVisible)
  trustModal.setAttribute("aria-hidden", trustModalVisible ? "false" : "true")
  twoFactorModal.classList.toggle("open", twoFactorModalVisible)
  twoFactorModal.setAttribute("aria-hidden", twoFactorModalVisible ? "false" : "true")
  document.body.classList.toggle("modal-open", trustModalVisible || twoFactorModalVisible)

  const currentSourceKey =
    selectedIpaFile && selectedTargetUdid
      ? buildPreparedSourceKey(selectedIpaFile, selectedTargetUdid)
      : null
  const hasValidSignedPackage = !!preparedSignedIpa && !!currentSourceKey && preparedSourceKey === currentSourceKey

  openSigningPageButton.disabled = busyLoginSign
  pairDeviceButton.disabled = busyPairing || busySign || busyInstall || !isSupported
  loginSignButton.disabled =
    busyLoginSign || waitingForTwoFactorCode || appleIdInput.value.trim().length === 0 || applePasswordInput.value.length === 0
  signButton.disabled =
    busyPairing || busyLoginSign || busySign || busyInstall || !selectedIpaFile || !loginContext || selectedTargetUdid.length === 0
  installButton.disabled =
    busyPairing ||
    busyLoginSign ||
    busySign ||
    busyInstall ||
    !pairedDeviceInfo ||
    pairedDeviceInfo.udid !== selectedTargetUdid ||
    !hasValidSignedPackage
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
  const text = busyInstall || busySign
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
  if (busySign && update.source === "sign") {
    setInstallProgress(update.percent, `signing: ${update.status}`)
    return
  }
  if (busyInstall && update.source === "install") {
    setInstallProgress(update.percent, `installing: ${update.status}`)
    return
  }
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

const renderSavedAccountsList = (): void => {
  const list = loadStoredAccountList()
  savedAccountsListView.replaceChildren()

  if (list.length === 0) {
    const empty = document.createElement("p")
    empty.className = "rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500"
    empty.textContent = "No saved accounts."
    savedAccountsListView.append(empty)
    return
  }

  for (const item of list) {
    const row = document.createElement("div")
    const key = accountKey(item.appleId, item.teamId)
    const activeKey = loginContext ? accountKey(loginContext.appleId, loginContext.team.identifier) : ""
    const isActive = key === activeKey
    const hasCachedSession = accountContextMap.has(key)
    row.className = isActive
      ? "rounded-md border border-blue-300 bg-blue-50 px-3 py-2"
      : "rounded-md border border-gray-200 bg-gray-50 px-3 py-2"

    const head = document.createElement("div")
    head.className = "flex items-center justify-between gap-2"
    const top = document.createElement("p")
    top.className = "text-sm font-medium text-gray-800 truncate"
    top.textContent = `${item.appleId} / ${item.teamId}`
    const switchButton = document.createElement("button")
    switchButton.type = "button"
    switchButton.className = isActive
      ? "rounded-md border border-blue-300 bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700"
      : "rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
    switchButton.textContent = isActive ? "Active" : hasCachedSession ? "Switch" : "Re-Login"
    switchButton.disabled = isActive
    switchButton.addEventListener("click", () => {
      switchAccount(item)
    })
    head.append(top, switchButton)

    const bottom = document.createElement("p")
    bottom.className = "mt-1 text-xs text-gray-500"
    const updatedText = Number.isNaN(Date.parse(item.updatedAtIso))
      ? item.updatedAtIso
      : new Date(item.updatedAtIso).toLocaleString()
    bottom.textContent = `${item.teamName} · ${updatedText} · ${hasCachedSession ? "session cached" : "need login"}`

    row.append(head, bottom)
    savedAccountsListView.append(row)
  }
}

const listKnownDeviceUdids = (): string[] => {
  const known = new Set(Object.keys(readPairRecordMap()))
  if (pairedDeviceInfo?.udid) {
    known.add(pairedDeviceInfo.udid)
  }
  return Array.from(known).sort((a, b) => a.localeCompare(b))
}

const renderDeviceUdidSelect = (udids: string[]): void => {
  deviceUdidSelect.replaceChildren()

  const placeholder = document.createElement("option")
  placeholder.value = ""
  placeholder.textContent = udids.length > 0 ? "Select target udid" : "No paired udid"
  deviceUdidSelect.append(placeholder)

  for (const udid of udids) {
    const option = document.createElement("option")
    option.value = udid
    option.textContent = udid
    deviceUdidSelect.append(option)
  }

  deviceUdidSelect.value = udids.includes(selectedTargetUdid) ? selectedTargetUdid : ""
}

const switchAccount = (summary: StoredAccountSummary): void => {
  const key = accountKey(summary.appleId, summary.teamId)
  const cached = accountContextMap.get(key)

  appleIdInput.value = summary.appleId
  saveText(APPLE_ID_STORAGE_KEY, summary.appleId)
  setStoredAccountSummary(summary)
  clearPreparedSigned()

  if (cached) {
    loginContext = cached
    addLog(`account switched: ${summary.appleId} / ${summary.teamId}`)
    navigateToPage("sign")
    refreshUi()
    return
  }

  loginContext = null
  addLog(`account selected: ${summary.appleId} / ${summary.teamId}, please sign in again`)
  navigateToPage("login")
  refreshUi()
}

function resolvePageFromHash(hash: string): AppPage {
  return hash === SIGN_PAGE_HASH ? "sign" : "login"
}

function pageToHash(page: AppPage): string {
  return page === "sign" ? SIGN_PAGE_HASH : LOGIN_PAGE_HASH
}

function navigateToPage(page: AppPage): void {
  currentPage = page
  const nextHash = pageToHash(page)
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash
  }
  refreshUi()
}

navLoginButton.addEventListener("click", () => {
  navigateToPage("login")
})

navSignButton.addEventListener("click", () => {
  navigateToPage("sign")
})

openSigningPageButton.addEventListener("click", () => {
  navigateToPage("sign")
})

window.addEventListener("hashchange", () => {
  currentPage = resolvePageFromHash(window.location.hash)
  refreshUi()
})

pairDeviceButton.addEventListener("click", async () => {
  try {
    await pairDeviceFlow()
  } catch (error) {
    if (isPairingDialogPendingError(error)) {
      return
    }
    waitingForTrustConfirmation = false
    trustModalVisible = false
    addLog(`pair failed: ${formatError(error)}`)
    refreshUi()
  }
})

loginSignButton.addEventListener("click", async () => {
  try {
    await loginAndSignFlow()
  } catch (error) {
    addLog(`login failed: ${formatError(error)}`)
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

signButton.addEventListener("click", async () => {
  try {
    await signFlow()
  } catch (error) {
    addLog(`sign failed: ${formatError(error)}`)
    refreshUi()
  }
})

appleIdInput.addEventListener("change", () => {
  saveText(APPLE_ID_STORAGE_KEY, appleIdInput.value.trim())
  refreshUi()
})

appleIdInput.addEventListener("input", () => {
  refreshUi()
})

applePasswordInput.addEventListener("input", () => {
  refreshUi()
})

rememberSessionInput.addEventListener("change", () => {
  saveText(APPLE_REMEMBER_SESSION_STORAGE_KEY, rememberSessionInput.checked ? "1" : "0")
  refreshUi()
})

ipaFileInput.addEventListener("change", () => {
  selectedIpaFile = ipaFileInput.files && ipaFileInput.files.length > 0 ? ipaFileInput.files[0] : null
  clearPreparedSigned()
  addLog(selectedIpaFile ? `ipa selected: ${selectedIpaFile.name}` : "ipa selection cleared")
  refreshUi()
})

deviceUdidSelect.addEventListener("change", () => {
  selectedTargetUdid = deviceUdidSelect.value
  saveText(SELECTED_DEVICE_UDID_STORAGE_KEY, selectedTargetUdid)
  clearPreparedSigned()
  addLog(selectedTargetUdid ? `target udid selected: ${selectedTargetUdid}` : "target udid cleared")
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

twoFactorSubmitButton.addEventListener("click", () => {
  submitTwoFactorCode()
})

twoFactorCancelButton.addEventListener("click", () => {
  cancelTwoFactorCode()
})

twoFactorCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault()
    submitTwoFactorCode()
    return
  }
  if (event.key === "Escape") {
    event.preventDefault()
    cancelTwoFactorCode()
  }
})

twoFactorCodeInput.addEventListener("input", () => {
  if (twoFactorErrorView.textContent) {
    twoFactorErrorView.textContent = ""
  }
})

trustModalCloseButton.addEventListener("click", () => {
  closeTrustModal()
})

trustModal.addEventListener("click", (event) => {
  if (event.target === trustModal) {
    closeTrustModal()
  }
})

window.addEventListener("beforeunload", () => {
  void directClient?.close()
})

if (window.location.hash !== LOGIN_PAGE_HASH && window.location.hash !== SIGN_PAGE_HASH) {
  window.location.hash = LOGIN_PAGE_HASH
}
currentPage = resolvePageFromHash(window.location.hash)

restorePersistedAccountContexts()
refreshUi()
void syncAnisetteProvisionedStatus()
addLog("ready")

function buildPreparedSourceKey(file: File, udid: string): string {
  return `${file.name}:${file.size}:${file.lastModified}:${udid}`
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

function mustGetSelect(id: string): HTMLSelectElement {
  const element = document.getElementById(id)
  if (!element || !(element instanceof HTMLSelectElement)) {
    throw new Error(`Select #${id} not found`)
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
  const created = createHostId()
  saveText(HOST_ID_STORAGE_KEY, created)
  return created
}

function getOrCreateSystemBuid(): string {
  const existing = loadText(SYSTEM_BUID_STORAGE_KEY)
  if (existing && existing.trim().length > 0) {
    return existing
  }
  const created = createSystemBuid()
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
  map[normalizedUdid] = encodeStoredPairRecord(record)
  writePairRecordMap(map)
}

function loadLegacyPairRecord(): PairRecord | null {
  const text = loadText(LEGACY_PAIR_RECORD_STORAGE_KEY)
  if (!text) {
    return null
  }
  try {
    const parsed = JSON.parse(text) as StoredPairRecordPayload
    return decodeStoredPairRecord(parsed)
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
      return decodeStoredPairRecord(fromMap)
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
  const payloadText = await generatePairRecordWithOpenSslWasm({
    devicePublicKey: devicePublicKeyBytes,
    hostId,
    systemBuid,
  })
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

function accountKey(appleId: string, teamId: string): string {
  return `${appleId.trim().toLowerCase()}::${teamId.trim().toUpperCase()}`
}

function setStoredAccountSummary(summary: StoredAccountSummary): void {
  saveText(APPLE_ACCOUNT_SUMMARY_STORAGE_KEY, JSON.stringify(summary))
}

function persistAccountSummary(context: AppleDeveloperContext): void {
  const payload: StoredAccountSummary = {
    appleId: context.appleId,
    teamId: context.team.identifier,
    teamName: context.team.name,
    updatedAtIso: new Date().toISOString(),
  }
  setStoredAccountSummary(payload)

  const existing = loadStoredAccountList()
  const next = [payload, ...existing.filter((item) => !(item.appleId === payload.appleId && item.teamId === payload.teamId))]
    .slice(0, 12)
  saveText(APPLE_ACCOUNT_LIST_STORAGE_KEY, JSON.stringify(next))
}

function persistAccountSession(context: AppleDeveloperContext): void {
  const map = readAccountSessionMap()
  const key = accountKey(context.appleId, context.team.identifier)
  const anisette = anisetteData ?? context.session.anisetteData
  map[key] = {
    appleId: context.appleId,
    teamId: context.team.identifier,
    teamName: context.team.name,
    dsid: context.session.dsid,
    authToken: context.session.authToken,
    anisetteData: encodeAnisetteData(anisette),
    updatedAtIso: new Date().toISOString(),
  }
  writeAccountSessionMap(map)
}

function removeStoredAccountSession(appleId: string, teamId: string): void {
  const key = accountKey(appleId, teamId)
  const map = readAccountSessionMap()
  if (!(key in map)) {
    return
  }
  delete map[key]
  writeAccountSessionMap(map)
  accountContextMap.delete(key)
}

function encodeAnisetteData(data: AnisetteData): StoredAnisetteDataPayload {
  return {
    machineID: data.machineID,
    oneTimePassword: data.oneTimePassword,
    localUserID: data.localUserID,
    routingInfo: data.routingInfo,
    deviceUniqueIdentifier: data.deviceUniqueIdentifier,
    deviceDescription: data.deviceDescription,
    deviceSerialNumber: data.deviceSerialNumber,
    dateIso: data.date.toISOString(),
    locale: data.locale,
    timeZone: data.timeZone,
  }
}

function decodeAnisetteData(payload: StoredAnisetteDataPayload): AnisetteData | null {
  if (
    !payload.machineID ||
    !payload.oneTimePassword ||
    !payload.localUserID ||
    !payload.deviceUniqueIdentifier ||
    !payload.deviceDescription ||
    !payload.locale ||
    !payload.timeZone
  ) {
    return null
  }
  if (!Number.isFinite(payload.routingInfo)) {
    return null
  }
  const date = new Date(payload.dateIso)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return {
    machineID: payload.machineID,
    oneTimePassword: payload.oneTimePassword,
    localUserID: payload.localUserID,
    routingInfo: payload.routingInfo,
    deviceUniqueIdentifier: payload.deviceUniqueIdentifier,
    deviceDescription: payload.deviceDescription,
    deviceSerialNumber: payload.deviceSerialNumber || "0",
    date,
    locale: payload.locale,
    timeZone: payload.timeZone,
  }
}

function readAccountSessionMap(): Record<string, StoredAccountSessionPayload> {
  const raw = loadText(APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }
    const normalized: Record<string, StoredAccountSessionPayload> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        continue
      }
      const candidate = value as Partial<StoredAccountSessionPayload>
      if (
        typeof candidate.appleId !== "string" ||
        typeof candidate.teamId !== "string" ||
        typeof candidate.teamName !== "string" ||
        typeof candidate.dsid !== "string" ||
        typeof candidate.authToken !== "string" ||
        !candidate.anisetteData ||
        typeof candidate.updatedAtIso !== "string"
      ) {
        continue
      }
      normalized[key] = {
        appleId: candidate.appleId,
        teamId: candidate.teamId,
        teamName: candidate.teamName,
        dsid: candidate.dsid,
        authToken: candidate.authToken,
        anisetteData: candidate.anisetteData as StoredAnisetteDataPayload,
        updatedAtIso: candidate.updatedAtIso,
      }
    }
    return normalized
  } catch {
    return {}
  }
}

function writeAccountSessionMap(map: Record<string, StoredAccountSessionPayload>): void {
  saveText(APPLE_ACCOUNT_SESSION_MAP_STORAGE_KEY, JSON.stringify(map))
}

function restorePersistedAccountContexts(): void {
  const sessionMap = readAccountSessionMap()
  for (const payload of Object.values(sessionMap)) {
    const anisette = decodeAnisetteData(payload.anisetteData)
    if (!anisette) {
      continue
    }

    const restored: AppleDeveloperContext = {
      appleId: payload.appleId,
      session: {
        anisetteData: anisette,
        dsid: payload.dsid,
        authToken: payload.authToken,
      },
      team: {
        identifier: payload.teamId,
        name: payload.teamName,
      } as AppleDeveloperContext["team"],
      certificates: [],
      devices: [],
    }
    accountContextMap.set(accountKey(payload.appleId, payload.teamId), restored)
  }

  const summary = loadStoredAccountSummary()
  if (!summary) {
    return
  }
  const restoredActive = accountContextMap.get(accountKey(summary.appleId, summary.teamId))
  if (!restoredActive) {
    return
  }
  loginContext = restoredActive
  appleIdInput.value = restoredActive.appleId
  addLog(`login: restored session ${restoredActive.appleId} / ${restoredActive.team.identifier}`)
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

function loadStoredAccountList(): StoredAccountSummary[] {
  const raw = loadText(APPLE_ACCOUNT_LIST_STORAGE_KEY)
  if (!raw) {
    const single = loadStoredAccountSummary()
    return single ? [single] : []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    const normalized: StoredAccountSummary[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue
      }
      const candidate = item as StoredAccountSummary
      if (!candidate.appleId || !candidate.teamId || !candidate.teamName || !candidate.updatedAtIso) {
        continue
      }
      normalized.push(candidate)
    }

    return normalized
  } catch {
    return []
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
