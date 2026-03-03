/* eslint-disable no-bitwise, prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention */
import { PlistValue, encodePlistXml } from "./plist"

export interface WebUsbTransportInstance {
  readonly isOpen: boolean
  open(): Promise<void>
  close(): Promise<void>
  send(data: ArrayBuffer): Promise<void>
  setDataHandler(handler: ((data: ArrayBuffer) => void) | null): void
  setDisconnectHandler(handler: ((reason?: unknown) => void) | null): void
}

export interface TcpConnection {
  sport: number
  dport: number
  state: "connecting" | "connected"
  txSeq: number
  txAck: number
  rxAck: number
  txWin: number
}

export interface StartSessionResult {
  sessionId: string
  enableSessionSsl: boolean
}

export interface StartServiceResult {
  port: number
  enableServiceSsl: boolean
}

interface AfcFrame {
  packetNum: number
  operation: number
  body: Uint8Array
}

export interface PairRecord {
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

export interface InstProxyStatusUpdate {
  status: string
  percentComplete: number | null
  error: string | null
  errorDescription: string | null
}

export interface StoredPairRecordPayload {
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

export interface TlsConnection {
  is_handshaking(): boolean
  write_plaintext(data: Uint8Array): void
  feed_tls(data: Uint8Array): void
  take_tls_out(): Uint8Array
  take_plain_out(): Uint8Array
  free(): void
}

export interface TlsConnectionFactory {
  ensureReady?(): Promise<void>
  createConnection(request: {
    serverName: string
    caCertificatePem: string
    certificatePem: string
    privateKeyPem: string
  }): TlsConnection
}

export interface PairRecordFactory {
  createPairRecord(request: {
    devicePublicKey: Uint8Array
    hostId: string
    systemBuid: string
  }): Promise<PairRecord>
}

export interface DirectUsbMuxClientOptions {
  log?: (message: string) => void
  onStateChange?: () => void
  lockdownLabel?: string
  tlsFactory?: TlsConnectionFactory
  pairRecordFactory?: PairRecordFactory
  serviceConnectWarmupMs?: number
  serviceConnectMaxAttempts?: number
  serviceConnectRetryBaseMs?: number
}

interface Waiter<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

const MUX_PROTO_VERSION = 0
const MUX_PROTO_CONTROL = 1
const MUX_PROTO_SETUP = 2
const MUX_PROTO_TCP = 6

const TCP_FLAG_SYN = 0x02
const TCP_FLAG_RST = 0x04
const TCP_FLAG_ACK = 0x10

const MUX_MAGIC_HOST = 0xfeedface
const MUX_MAGIC_DEVICE_ALT = 0xfaceface
export const LOCKDOWN_PORT = 62078
const MAX_MUX_PACKET = 262144
const MAX_LOCKDOWN_FRAME = 1048576
const MAX_AFC_FRAME = 8 * 1024 * 1024
const AFC_HEADER_SIZE = 40
const AFC_MAGIC = "CFA6LPAA"
const AFC_OP_STATUS = 0x00000001
const AFC_OP_DATA = 0x00000002
const AFC_OP_READ_DIR = 0x00000003
const AFC_OP_MAKE_DIR = 0x00000009
const AFC_OP_GET_DEVINFO = 0x0000000b
const AFC_OP_FILE_OPEN = 0x0000000d
const AFC_OP_FILE_OPEN_RES = 0x0000000e
const AFC_OP_FILE_READ = 0x0000000f
const AFC_OP_FILE_WRITE = 0x00000010
const AFC_OP_FILE_CLOSE = 0x00000014
const AFC_E_END_OF_DATA = 14
const AFC_E_OBJECT_EXISTS = 16
const AFC_FOPEN_RDONLY = 0x00000001
const AFC_FOPEN_WR = 0x00000004
const AFC_RW_CHUNK_SIZE = 60 * 1024
const EMPTY_BYTES = new Uint8Array(0)

const DEFAULT_SERVICE_CONNECT_WARMUP_MS = 1800
const DEFAULT_SERVICE_CONNECT_MAX_ATTEMPTS = 6
const DEFAULT_SERVICE_CONNECT_RETRY_BASE_MS = 900

export class DirectUsbMuxClient {
  private readonly transport: WebUsbTransportInstance
  private readonly log: (message: string) => void
  private readonly onStateChange: () => void
  private readonly lockdownLabel: string
  private readonly tlsFactory: TlsConnectionFactory | null
  private readonly pairRecordFactory: PairRecordFactory | null
  private readonly serviceConnectWarmupMs: number
  private readonly serviceConnectMaxAttempts: number
  private readonly serviceConnectRetryBaseMs: number

  private muxVersion = 0
  private muxTxSeq = 0
  private muxRxSeq = 0xffff
  private readBuffer = new Uint8Array(0)
  private lockdownBuffer = new Uint8Array(0)
  private afcBuffer = new Uint8Array(0)
  private afcPacketNum = 0
  private writeChain = Promise.resolve()
  private packetChain = Promise.resolve()
  private tlsFlushChain = Promise.resolve()
  private sportCounter = 32000
  private readonly warnedMagicValues = new Set<number>()
  private readonly tlsOutboundQueue: Uint8Array[] = []

  private handshakeComplete = false
  private sessionId: string | null = null
  private sessionSslEnabled = false
  private tlsActive = false
  private deviceUdid: string | null = null
  private deviceName: string | null = null
  private pairRecord: PairRecord | null = null
  private connection: TcpConnection | null = null
  private activeService: "lockdownd" | "afc" | "instproxy" | null = null
  private tlsConnection: TlsConnection | null = null
  private preparedTlsConnection: TlsConnection | null = null
  private preparedTlsFirstFlight = EMPTY_BYTES

  private versionWaiter: Waiter<number> | null = null
  private connectWaiter: Waiter<void> | null = null
  private responseWaiter: Waiter<Uint8Array> | null = null
  private readonly plistResponseQueue: Uint8Array[] = []
  private afcResponseWaiter: Waiter<AfcFrame> | null = null
  private afcResponsePacketNum = 0
  private tlsHandshakeWaiter: Waiter<void> | null = null

  constructor(
    transport: WebUsbTransportInstance,
    options: DirectUsbMuxClientOptions = {},
  ) {
    this.transport = transport
    this.log = options.log ?? (() => undefined)
    this.onStateChange = options.onStateChange ?? (() => undefined)
    this.lockdownLabel = options.lockdownLabel ?? "webmuxd.client"
    this.tlsFactory = options.tlsFactory ?? null
    this.pairRecordFactory = options.pairRecordFactory ?? null
    this.serviceConnectWarmupMs =
      options.serviceConnectWarmupMs ?? DEFAULT_SERVICE_CONNECT_WARMUP_MS
    this.serviceConnectMaxAttempts =
      options.serviceConnectMaxAttempts ?? DEFAULT_SERVICE_CONNECT_MAX_ATTEMPTS
    this.serviceConnectRetryBaseMs =
      options.serviceConnectRetryBaseMs ?? DEFAULT_SERVICE_CONNECT_RETRY_BASE_MS
  }

  get isHandshakeComplete(): boolean {
    return this.handshakeComplete
  }

  get isLockdownConnected(): boolean {
    return this.connection?.state === "connected" && this.activeService === "lockdownd"
  }

  get isAfcConnected(): boolean {
    return this.connection?.state === "connected" && this.activeService === "afc"
  }

  get isInstProxyConnected(): boolean {
    return this.connection?.state === "connected" && this.activeService === "instproxy"
  }

  get isSessionStarted(): boolean {
    return this.sessionId !== null
  }

  get isSessionSslEnabled(): boolean {
    return this.sessionSslEnabled
  }

  get isTlsActive(): boolean {
    return this.tlsActive
  }

  get isPaired(): boolean {
    return this.pairRecord !== null
  }

  get currentPairRecord(): PairRecord | null {
    return this.pairRecord
  }

  loadPairRecord(record: PairRecord | null): void {
    if (!record) {
      return
    }
    this.clearPreparedTls()
    this.pairRecord = record
  }

  async getOrFetchDeviceUdid(): Promise<string> {
    if (this.deviceUdid) {
      return this.deviceUdid
    }
    this.ensureLockdownConnected()
    const response = await this.sendGetValue("UniqueDeviceID")
    const udid = extractPlistValue(response, "Value")?.trim()
    if (!udid) {
      throw new Error("GetValue(UniqueDeviceID) returned empty Value")
    }
    this.deviceUdid = udid
    return udid
  }

  async getOrFetchDeviceName(): Promise<string | null> {
    if (this.deviceName && this.deviceName.trim().length > 0) {
      return this.deviceName
    }
    this.ensureLockdownConnected()
    const response = await this.sendGetValue("DeviceName")
    const deviceName = extractPlistValue(response, "Value")?.trim() ?? ""
    this.deviceName = deviceName.length > 0 ? deviceName : null
    return this.deviceName
  }

  async openAndHandshake(): Promise<void> {
    if (this.handshakeComplete) {
      return
    }

    this.transport.setDataHandler((data) => this.onTransportData(data))
    this.transport.setDisconnectHandler((reason) => this.onTransportDisconnect(reason))

    if (!this.transport.isOpen) {
      await this.transport.open()
      this.log("USB transport opened.")
    }

    const waitVersion = this.createWaiter<number>("Version", 4000)
    this.versionWaiter = waitVersion

    await this.sendVersionRequest()
    const version = await waitVersion.promise
    if (version >= 2) {
      await this.sendSetupPacket()
    }

    this.handshakeComplete = true
    this.log(`MUX handshake complete (version=${version}).`)
    this.onStateChange()
  }

  async connectLockdown(port: number = LOCKDOWN_PORT): Promise<void> {
    if (this.isLockdownConnected) {
      return
    }
    if (this.connection && this.activeService !== "lockdownd") {
      this.dropCurrentConnection(`Switch ${this.activeService ?? "service"} -> lockdownd`)
    }
    await this.connectServicePort(port, "lockdownd")
  }

  async sendQueryType(): Promise<Uint8Array> {
    return await this.sendLockdownRequest({
      Label: this.lockdownLabel,
      ProtocolVersion: "2",
      Request: "QueryType",
    })
  }

  async sendGetValue(key: string): Promise<Uint8Array> {
    if (key.trim().length === 0) {
      throw new Error("GetValue key is empty")
    }
    return await this.sendLockdownRequest({
      Label: this.lockdownLabel,
      ProtocolVersion: "2",
      Request: "GetValue",
      Key: key,
    })
  }

  async pairDevice(hostId: string, systemBuid: string): Promise<PairRecord> {
    this.ensureLockdownConnected()
    if (!this.pairRecordFactory) {
      throw new Error("pairRecordFactory is required for pairing")
    }
    if (hostId.trim().length === 0 || systemBuid.trim().length === 0) {
      throw new Error("HostID or SystemBUID is empty")
    }

    const devicePublicKeyData = await this.fetchDevicePublicKey()
    const record = await this.pairRecordFactory.createPairRecord({
      devicePublicKey: devicePublicKeyData,
      hostId,
      systemBuid,
    })

    const response = await this.sendLockdownRequest({
      Label: this.lockdownLabel,
      ProtocolVersion: "2",
      Request: "Pair",
      PairRecord: {
        DeviceCertificate: encodeUtf8(record.deviceCertificatePem),
        DevicePublicKey: record.devicePublicKey,
        HostCertificate: encodeUtf8(record.hostCertificatePem),
        HostID: record.hostId,
        RootCertificate: encodeUtf8(record.rootCertificatePem),
        SystemBUID: record.systemBuid,
      },
      PairingOptions: {
        ExtendedPairingErrors: true,
      },
    })

    const errorValue = extractPlistValue(response, "Error")
    if (errorValue) {
      throw new Error(`Pair error=${errorValue}`)
    }

    const escrowBag = extractPlistData(response, "EscrowBag")
    if (escrowBag) {
      record.escrowBag = escrowBag
    }

    this.clearPreparedTls()
    this.pairRecord = record
    this.onStateChange()
    return record
  }

  async startSession(hostId: string, systemBuid: string): Promise<StartSessionResult> {
    if (hostId.trim().length === 0 || systemBuid.trim().length === 0) {
      throw new Error("HostID or SystemBUID is empty")
    }
    this.ensureLockdownConnected()
    if (this.sessionId) {
      return {
        sessionId: this.sessionId,
        enableSessionSsl: this.sessionSslEnabled,
      }
    }

    if (this.pairRecord) {
      await this.prepareTlsForStartSession()
    }

    const response = await this.sendLockdownRequest({
      Label: this.lockdownLabel,
      ProtocolVersion: "2",
      Request: "StartSession",
      HostID: hostId,
      SystemBUID: systemBuid,
    })

    const errorValue = extractPlistValue(response, "Error")
    if (errorValue) {
      throw new Error(`StartSession error=${errorValue}`)
    }

    const sessionId = extractPlistValue(response, "SessionID")
    if (!sessionId) {
      throw new Error("StartSession response missing SessionID")
    }
    const sslRaw = extractPlistValue(response, "EnableSessionSSL")
    const enableSessionSsl = sslRaw === "true" || sslRaw === "1"

    this.sessionId = sessionId
    this.sessionSslEnabled = enableSessionSsl

    if (enableSessionSsl) {
      if (!this.pairRecord) {
        throw new Error("StartSession requires pair record for TLS but none is loaded")
      }
      if (!this.tlsFactory) {
        throw new Error("tlsFactory is required when EnableSessionSSL=true")
      }
      await this.upgradeToTls()
    } else {
      this.clearPreparedTls()
    }

    this.onStateChange()

    return {
      sessionId,
      enableSessionSsl,
    }
  }

  async startAfcService(): Promise<StartServiceResult> {
    await this.ensureLockdownSessionForServiceStart()

    const response = await this.sendLockdownRequest({
      Label: this.lockdownLabel,
      ProtocolVersion: "2",
      Request: "StartService",
      Service: "com.apple.afc",
    })
    const errorValue = extractPlistValue(response, "Error")
    if (errorValue) {
      throw new Error(`StartService error=${errorValue}`)
    }
    const portText = extractPlistValue(response, "Port")
    if (!portText) {
      throw new Error("StartService response missing Port")
    }
    const port = Number.parseInt(portText, 10)
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`StartService returned invalid Port=${portText}`)
    }
    const sslRaw = extractPlistValue(response, "EnableServiceSSL")
    const enableServiceSsl = sslRaw === "true" || sslRaw === "1"

    this.dropCurrentConnection("Switch lockdownd -> afc")
    await sleepMs(this.serviceConnectWarmupMs)
    await this.connectServicePort(port, "afc")
    return { port, enableServiceSsl }
  }

  async startInstProxyService(): Promise<StartServiceResult> {
    await this.ensureLockdownSessionForServiceStart()

    const response = await this.sendLockdownRequest({
      Label: this.lockdownLabel,
      ProtocolVersion: "2",
      Request: "StartService",
      Service: "com.apple.mobile.installation_proxy",
    })
    const errorValue = extractPlistValue(response, "Error")
    if (errorValue) {
      throw new Error(`StartService error=${errorValue}`)
    }
    const portText = extractPlistValue(response, "Port")
    if (!portText) {
      throw new Error("StartService response missing Port")
    }
    const port = Number.parseInt(portText, 10)
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`StartService returned invalid Port=${portText}`)
    }
    const sslRaw = extractPlistValue(response, "EnableServiceSSL")
    const enableServiceSsl = sslRaw === "true" || sslRaw === "1"

    this.dropCurrentConnection("Switch lockdownd -> instproxy")
    await sleepMs(this.serviceConnectWarmupMs)
    await this.connectServicePort(port, "instproxy")
    return { port, enableServiceSsl }
  }

  async instProxyInstallPackage(
    packagePath: string,
    onStatus?: (update: InstProxyStatusUpdate) => void,
  ): Promise<void> {
    this.ensureInstProxyConnected()

    const normalizedPackagePath = packagePath.trim().replace(/^\/+/, "")
    if (normalizedPackagePath.length === 0) {
      throw new Error("InstProxy install package path is empty")
    }
    if (this.responseWaiter) {
      throw new Error("Another plist request is in flight")
    }
    this.plistResponseQueue.length = 0
    await this.sendPlistCommand(
      {
        Command: "Install",
        PackagePath: normalizedPackagePath,
        ClientOptions: {
          PackageType: "Developer",
        },
      },
      "InstProxy",
    )

    for (let index = 0; index < 4096; index += 1) {
      const responsePayload = await this.waitForNextPlistResponse(
        "InstProxy Install status",
        120000,
      )
      const update: InstProxyStatusUpdate = {
        status: extractPlistValue(responsePayload, "Status") ?? "",
        percentComplete: extractPlistNumber(responsePayload, "PercentComplete"),
        error: extractPlistValue(responsePayload, "Error"),
        errorDescription: extractPlistValue(responsePayload, "ErrorDescription"),
      }
      onStatus?.(update)

      if (update.error) {
        const detail = update.errorDescription ? ` (${update.errorDescription})` : ""
        throw new Error(`InstProxy Install error=${update.error}${detail}`)
      }
      if (update.status === "Complete") {
        return
      }
    }

    throw new Error("InstProxy Install exceeded response limit")
  }

  async instProxyBrowseUserApps(): Promise<string[]> {
    this.ensureInstProxyConnected()

    if (this.responseWaiter) {
      throw new Error("Another plist request is in flight")
    }
    this.plistResponseQueue.length = 0
    await this.sendPlistCommand(
      {
        Command: "Browse",
        ClientOptions: {
          ApplicationType: "User",
          ReturnAttributes: ["CFBundleIdentifier", "CFBundleDisplayName", "CFBundleName"],
        },
      },
      "InstProxy",
    )

    const bundleIds: string[] = []
    for (let index = 0; index < 256; index += 1) {
      const responseXml = await this.waitForNextPlistResponse("InstProxy Browse status", 10000)
      const errorValue = extractPlistValue(responseXml, "Error")
      if (errorValue) {
        throw new Error(`InstProxy Browse error=${errorValue}`)
      }

      bundleIds.push(...extractInstProxyBundleIds(responseXml))
      const status = extractPlistValue(responseXml, "Status")
      if (status === "Complete") {
        return Array.from(new Set(bundleIds))
      }
    }
    throw new Error("InstProxy Browse exceeded response limit")
  }

  async afcGetDeviceInfo(): Promise<Record<string, string>> {
    const frame = await this.sendAfcRequest(AFC_OP_GET_DEVINFO, EMPTY_BYTES)
    if (frame.operation !== AFC_OP_DATA) {
      throw new Error(`AFC unexpected op=0x${frame.operation.toString(16)} for GetDeviceInfo`)
    }
    return parseAfcKeyValueBody(frame.body)
  }

  async afcReadDir(path: string): Promise<string[]> {
    const requestPath = path.trim().length > 0 ? path.trim() : "/"
    const payload = encodeUtf8(`${requestPath}\0`)
    const frame = await this.sendAfcRequest(AFC_OP_READ_DIR, payload)
    if (frame.operation !== AFC_OP_DATA) {
      throw new Error(`AFC unexpected op=0x${frame.operation.toString(16)} for ReadDir`)
    }
    return parseAfcStringList(frame.body)
  }

  async afcMakeDir(path: string): Promise<void> {
    const requestPath = path.trim()
    if (requestPath.length === 0 || requestPath === "/") {
      return
    }
    const payload = encodeUtf8(`${requestPath}\0`)
    const frame = await this.sendAfcRequest(
      AFC_OP_MAKE_DIR,
      payload,
      EMPTY_BYTES,
      [0, AFC_E_OBJECT_EXISTS],
    )
    if (frame.operation !== AFC_OP_STATUS) {
      throw new Error(`AFC unexpected op=0x${frame.operation.toString(16)} for MakeDir`)
    }
  }

  async afcWriteFile(path: string, data: Uint8Array): Promise<void> {
    const requestPath = path.trim()
    if (requestPath.length === 0) {
      throw new Error("AFC WriteFile path is empty")
    }
    const handle = await this.afcFileOpen(requestPath, AFC_FOPEN_WR)
    try {
      if (data.byteLength === 0) {
        return
      }
      for (let offset = 0; offset < data.byteLength; offset += AFC_RW_CHUNK_SIZE) {
        const end = Math.min(offset + AFC_RW_CHUNK_SIZE, data.byteLength)
        await this.afcFileWrite(handle, data.slice(offset, end))
      }
    } finally {
      await this.afcFileClose(handle)
    }
  }

  async afcReadFile(path: string, maxBytes: number): Promise<Uint8Array> {
    const requestPath = path.trim()
    if (requestPath.length === 0) {
      throw new Error("AFC ReadFile path is empty")
    }
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new Error(`AFC ReadFile invalid maxBytes=${maxBytes}`)
    }
    const limit = Math.trunc(maxBytes)
    const handle = await this.afcFileOpen(requestPath, AFC_FOPEN_RDONLY)
    try {
      const chunks: Uint8Array[] = []
      let total = 0
      while (total < limit) {
        const toRead = Math.min(AFC_RW_CHUNK_SIZE, limit - total)
        const chunk = await this.afcFileRead(handle, toRead)
        if (chunk.byteLength === 0) {
          break
        }
        chunks.push(chunk)
        total += chunk.byteLength
        if (chunk.byteLength < toRead) {
          break
        }
      }
      return concatByteChunks(chunks, total)
    } finally {
      await this.afcFileClose(handle)
    }
  }

  async close(): Promise<void> {
    this.resolveAndResetWaiters(new Error("Closed"))
    this.connection = null
    this.activeService = null
    this.resetAfcState()
    this.handshakeComplete = false
    this.sessionId = null
    this.sessionSslEnabled = false
    this.resetTlsEngine()
    this.clearPreparedTls()
    this.muxVersion = 0
    this.muxTxSeq = 0
    this.muxRxSeq = 0xffff
    this.readBuffer = new Uint8Array(0)
    this.lockdownBuffer = new Uint8Array(0)
    this.writeChain = Promise.resolve()
    this.packetChain = Promise.resolve()

    if (this.transport.isOpen) {
      await this.transport.close()
    }
    this.onStateChange()
  }

  private ensureLockdownConnected(): void {
    if (
      !this.connection ||
      this.connection.state !== "connected" ||
      this.activeService !== "lockdownd"
    ) {
      throw new Error("Lockdown TCP is not connected")
    }
  }

  private ensureInstProxyConnected(): void {
    if (
      !this.connection ||
      this.connection.state !== "connected" ||
      this.activeService !== "instproxy"
    ) {
      throw new Error("InstProxy TCP is not connected")
    }
  }

  private async fetchDevicePublicKey(): Promise<Uint8Array> {
    const response = await this.sendLockdownRequest({
      Label: this.lockdownLabel,
      ProtocolVersion: "2",
      Request: "GetValue",
      Key: "DevicePublicKey",
    })
    const data = extractPlistData(response, "Value")
    if (!data) {
      throw new Error("GetValue(DevicePublicKey) returned empty Value")
    }
    return data
  }

  private async sendLockdownRequest(requestMap: { [key: string]: PlistValue }): Promise<Uint8Array> {
    if (
      !this.connection ||
      this.connection.state !== "connected" ||
      (this.activeService !== "lockdownd" && this.activeService !== "instproxy")
    ) {
      throw new Error("Plist service TCP is not connected")
    }
    if (this.responseWaiter) {
      throw new Error("Another plist request is in flight")
    }
    this.plistResponseQueue.length = 0
    const prefix = this.activeService === "instproxy" ? "InstProxy" : "Lockdown"
    await this.sendPlistCommand(requestMap, prefix)
    return await this.waitForNextPlistResponse(`${prefix} response`, 5000)
  }

  private async sendPlistCommand(
    requestMap: { [key: string]: PlistValue },
    prefix: string,
  ): Promise<void> {
    const requestName =
      typeof requestMap.Request === "string"
        ? requestMap.Request
        : typeof requestMap.Command === "string"
          ? requestMap.Command
          : "UnknownRequest"
    const payload = encodePlistXml(requestMap)
    const frame = new Uint8Array(4 + payload.byteLength)
    writeU32(frame, 0, payload.byteLength)
    frame.set(payload, 4)
    await this.sendLockdownFrame(frame)
    this.log(`${prefix} ${requestName} sent.`)
  }

  private async waitForNextPlistResponse(waiterName: string, timeoutMs: number): Promise<Uint8Array> {
    if (this.plistResponseQueue.length > 0) {
      return this.plistResponseQueue.shift() as Uint8Array
    }
    if (this.responseWaiter) {
      throw new Error("Another plist response waiter is active")
    }
    const waitResponse = this.createWaiter<Uint8Array>(waiterName, timeoutMs)
    this.responseWaiter = waitResponse
    try {
      return await waitResponse.promise
    } finally {
      this.responseWaiter = null
    }
  }

  private async sendLockdownFrame(frame: Uint8Array): Promise<void> {
    if (this.tlsConnection) {
      if (!this.tlsActive) {
        throw new Error("TLS handshake is not completed")
      }
      this.tlsConnection.write_plaintext(frame)
      this.enqueueTlsOutbound(this.tlsConnection.take_tls_out())
      await this.flushTlsOutbound()
      return
    }
    await this.sendTcpFrame(TCP_FLAG_ACK, frame)
  }

  private async sendAfcRequest(
    operation: number,
    data: Uint8Array,
    payload: Uint8Array = EMPTY_BYTES,
    okStatuses: readonly number[] = [0],
  ): Promise<AfcFrame> {
    if (!this.connection || this.connection.state !== "connected" || this.activeService !== "afc") {
      throw new Error("AFC TCP is not connected")
    }
    if (this.afcResponseWaiter) {
      throw new Error("Another AFC request is in flight")
    }
    const packetNum = (this.afcPacketNum + 1) >>> 0
    this.afcPacketNum = packetNum
    this.afcResponsePacketNum = packetNum

    const frame = encodeAfcFrame(packetNum, operation, data, payload)
    const waitResponse = this.createWaiter<AfcFrame>("AFC response", 8000)
    this.afcResponseWaiter = waitResponse

    let response: AfcFrame
    try {
      await this.sendTcpFrame(TCP_FLAG_ACK, frame)
      response = await waitResponse.promise
    } finally {
      this.afcResponseWaiter = null
      this.afcResponsePacketNum = 0
    }

    if (response.packetNum !== packetNum) {
      throw new Error(`AFC packet mismatch request=${packetNum} response=${response.packetNum}`)
    }
    if (response.operation === AFC_OP_STATUS) {
      const status = response.body.byteLength >= 8 ? readU64Le(response.body, 0) : 1
      if (!okStatuses.includes(status)) {
        throw new Error(`AFC status=${status} (${afcErrorName(status)})`)
      }
    }
    return response
  }

  private async ensureLockdownSessionForServiceStart(): Promise<void> {
    if (!this.handshakeComplete) {
      await this.openAndHandshake()
    }
    if (!this.isLockdownConnected) {
      await this.connectLockdown(LOCKDOWN_PORT)
    }
    if (!this.sessionId) {
      if (!this.pairRecord) {
        throw new Error("Pair record is missing; run pair step first")
      }
      await this.startSession(this.pairRecord.hostId, this.pairRecord.systemBuid)
    }
    if (this.sessionSslEnabled && !this.tlsActive) {
      throw new Error("Lockdown TLS channel is not active")
    }
  }

  private async afcFileOpen(path: string, mode: number): Promise<number> {
    const requestPath = path.trim()
    if (requestPath.length === 0) {
      throw new Error("AFC file open path is empty")
    }
    const pathBytes = encodeUtf8(`${requestPath}\0`)
    const data = new Uint8Array(8 + pathBytes.byteLength)
    writeU64Le(data, 0, mode >>> 0)
    data.set(pathBytes, 8)
    const frame = await this.sendAfcRequest(AFC_OP_FILE_OPEN, data)
    if (frame.operation !== AFC_OP_FILE_OPEN_RES) {
      throw new Error(`AFC unexpected op=0x${frame.operation.toString(16)} for FileOpen`)
    }
    if (frame.body.byteLength < 8) {
      throw new Error("AFC FileOpen response is missing file handle")
    }
    return readU64Le(frame.body, 0)
  }

  private async afcFileRead(handle: number, size: number): Promise<Uint8Array> {
    if (!Number.isFinite(handle) || handle <= 0) {
      throw new Error(`AFC file read invalid handle=${handle}`)
    }
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`AFC file read invalid size=${size}`)
    }
    const request = new Uint8Array(16)
    writeU64Le(request, 0, handle)
    writeU64Le(request, 8, Math.trunc(size))
    const frame = await this.sendAfcRequest(AFC_OP_FILE_READ, request, EMPTY_BYTES, [0, AFC_E_END_OF_DATA])
    if (frame.operation === AFC_OP_STATUS) {
      return EMPTY_BYTES
    }
    if (frame.operation !== AFC_OP_DATA) {
      throw new Error(`AFC unexpected op=0x${frame.operation.toString(16)} for FileRead`)
    }
    return frame.body
  }

  private async afcFileWrite(handle: number, bytes: Uint8Array): Promise<void> {
    if (!Number.isFinite(handle) || handle <= 0) {
      throw new Error(`AFC file write invalid handle=${handle}`)
    }
    const data = new Uint8Array(8)
    writeU64Le(data, 0, handle)
    const frame = await this.sendAfcRequest(AFC_OP_FILE_WRITE, data, bytes)
    if (frame.operation !== AFC_OP_STATUS) {
      throw new Error(`AFC unexpected op=0x${frame.operation.toString(16)} for FileWrite`)
    }
  }

  private async afcFileClose(handle: number): Promise<void> {
    if (!Number.isFinite(handle) || handle <= 0) {
      throw new Error(`AFC file close invalid handle=${handle}`)
    }
    const data = new Uint8Array(8)
    writeU64Le(data, 0, handle)
    const frame = await this.sendAfcRequest(AFC_OP_FILE_CLOSE, data)
    if (frame.operation !== AFC_OP_STATUS) {
      throw new Error(`AFC unexpected op=0x${frame.operation.toString(16)} for FileClose`)
    }
  }

  private async prepareTlsForStartSession(): Promise<void> {
    if (!this.pairRecord || this.tlsActive || this.preparedTlsConnection) {
      return
    }
    if (!this.tlsFactory) {
      return
    }
    if (this.tlsFactory.ensureReady) {
      await this.tlsFactory.ensureReady()
    }

    this.preparedTlsConnection = this.buildTlsConnectionWithFallback()
    this.preparedTlsFirstFlight = this.preparedTlsConnection.take_tls_out()
  }

  private buildTlsConnectionWithFallback(): TlsConnection {
    if (!this.pairRecord || !this.tlsFactory) {
      throw new Error("Pair record and tlsFactory are required for TLS")
    }

    try {
      return this.tlsFactory.createConnection({
        serverName: "lockdownd",
        caCertificatePem: this.pairRecord.rootCertificatePem,
        certificatePem: this.pairRecord.rootCertificatePem,
        privateKeyPem: this.pairRecord.rootPrivateKeyPem,
      })
    } catch {
      return this.tlsFactory.createConnection({
        serverName: "lockdownd",
        caCertificatePem: this.pairRecord.rootCertificatePem,
        certificatePem: this.pairRecord.hostCertificatePem,
        privateKeyPem: this.pairRecord.hostPrivateKeyPem,
      })
    }
  }

  private async upgradeToTls(): Promise<void> {
    if (!this.connection || this.connection.state !== "connected") {
      throw new Error("Lockdown TCP is not connected")
    }
    if (!this.pairRecord) {
      throw new Error("Pair record is required for TLS upgrade")
    }
    if (!this.tlsFactory) {
      throw new Error("tlsFactory is required for TLS upgrade")
    }
    if (this.tlsActive) {
      return
    }

    this.lockdownBuffer = new Uint8Array(0)
    this.resetTlsEngine()
    this.tlsOutboundQueue.length = 0

    const waitTls = this.createWaiter<void>("TLS handshake", 8000)
    this.tlsHandshakeWaiter = waitTls

    try {
      if (this.preparedTlsConnection) {
        this.tlsConnection = this.preparedTlsConnection
        this.preparedTlsConnection = null
        const first = this.preparedTlsFirstFlight
        this.preparedTlsFirstFlight = EMPTY_BYTES
        if (first.byteLength > 0) {
          this.enqueueTlsOutbound(first)
        }
      } else {
        if (this.tlsFactory.ensureReady) {
          await this.tlsFactory.ensureReady()
        }
        this.tlsConnection = this.buildTlsConnectionWithFallback()
        this.enqueueTlsOutbound(this.tlsConnection.take_tls_out())
      }
      await this.flushTlsOutbound()
      this.markTlsHandshakeCompletedIfReady()
      await waitTls.promise
    } catch (error) {
      const err = new Error(formatError(error))
      this.rejectWaiter(this.tlsHandshakeWaiter, err)
      this.tlsHandshakeWaiter = null
      this.resetTlsEngine()
      throw err
    }
  }

  private enqueueTlsOutbound(payload: Uint8Array): void {
    if (payload.byteLength === 0) {
      return
    }
    this.tlsOutboundQueue.push(payload)
    void this.flushTlsOutbound()
  }

  private async flushTlsOutbound(): Promise<void> {
    const task = this.tlsFlushChain.then(async () => {
      while (this.tlsOutboundQueue.length > 0) {
        const payload = this.tlsOutboundQueue.shift()
        if (!payload) {
          continue
        }
        await this.sendTcpFrame(TCP_FLAG_ACK, payload)
      }
    })
    this.tlsFlushChain = task.catch(() => undefined)
    await task
  }

  private async sendVersionRequest(): Promise<void> {
    const payload = new Uint8Array(12)
    writeU32(payload, 0, 2)
    writeU32(payload, 4, 0)
    writeU32(payload, 8, 0)
    await this.sendMuxPacket(MUX_PROTO_VERSION, payload, { forceLegacyHeader: true })
  }

  private async sendSetupPacket(): Promise<void> {
    await this.sendMuxPacket(MUX_PROTO_SETUP, new Uint8Array([0x07]), {
      resetMuxSequence: true,
    })
  }

  private async sendTcpFrame(flags: number, tcpPayload: Uint8Array): Promise<void> {
    if (!this.connection) {
      throw new Error("TCP connection is not initialized")
    }

    const tcpHeader = new Uint8Array(20)
    writeU16(tcpHeader, 0, this.connection.sport)
    writeU16(tcpHeader, 2, this.connection.dport)
    writeU32(tcpHeader, 4, this.connection.txSeq)
    writeU32(tcpHeader, 8, this.connection.txAck)
    tcpHeader[12] = 5 << 4
    tcpHeader[13] = flags
    writeU16(tcpHeader, 14, Math.min(this.connection.txWin, 0xffff))
    writeU16(tcpHeader, 16, 0)
    writeU16(tcpHeader, 18, 0)

    const frame = concatBytes(tcpHeader, tcpPayload)
    await this.sendMuxPacket(MUX_PROTO_TCP, frame)

    if (tcpPayload.byteLength > 0) {
      this.connection.txSeq = (this.connection.txSeq + tcpPayload.byteLength) >>> 0
    }
  }

  private async connectServicePort(
    port: number,
    service: "lockdownd" | "afc" | "instproxy",
  ): Promise<void> {
    if (!this.handshakeComplete) {
      throw new Error("MUX handshake is not completed")
    }
    if (this.connection) {
      throw new Error(`TCP is already in use (${this.activeService ?? "unknown"})`)
    }
    const maxAttempts = service === "lockdownd" ? 1 : this.serviceConnectMaxAttempts
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const sport = this.nextSport()
      this.resetAfcState()
      this.activeService = service
      this.connection = {
        sport,
        dport: port,
        state: "connecting",
        txSeq: 0,
        txAck: 0,
        rxAck: 0,
        txWin: 131072,
      }

      const waitConnect = this.createWaiter<void>("TCP connect", 5000)
      this.connectWaiter = waitConnect

      try {
        await this.sendTcpFrame(TCP_FLAG_SYN, EMPTY_BYTES)
        await waitConnect.promise
        this.onStateChange()
        return
      } catch (error) {
        const err = error instanceof Error ? error : new Error(formatError(error))
        lastError = err
        this.connectWaiter = null
        this.connection = null
        this.activeService = null

        const lower = err.message.toLowerCase()
        const retryable = lower.includes("refused") || lower.includes("timeout")
        if (attempt < maxAttempts && retryable) {
          const retryDelayMs = Math.min(this.serviceConnectRetryBaseMs * attempt, 4000)
          await sleepMs(retryDelayMs)
          continue
        }
        throw err
      }
    }

    throw lastError ?? new Error(`TCP connect failed for ${service}`)
  }

  private async sendMuxPacket(
    protocol: number,
    payload: Uint8Array,
    options: { forceLegacyHeader?: boolean; resetMuxSequence?: boolean } = {},
  ): Promise<void> {
    const useV2Header = !options.forceLegacyHeader && this.muxVersion >= 2
    if (useV2Header && options.resetMuxSequence) {
      this.muxTxSeq = 0
      this.muxRxSeq = 0xffff
    }

    const headerSize = useV2Header ? 16 : 8
    const packet = new Uint8Array(headerSize + payload.byteLength)

    writeU32(packet, 0, protocol)
    writeU32(packet, 4, packet.byteLength)

    if (useV2Header) {
      writeU32(packet, 8, MUX_MAGIC_HOST)
      writeU16(packet, 12, this.muxTxSeq)
      writeU16(packet, 14, this.muxRxSeq)
      this.muxTxSeq = (this.muxTxSeq + 1) & 0xffff
    }

    packet.set(payload, headerSize)

    await this.enqueueSend(packet)
  }

  private async enqueueSend(packet: Uint8Array): Promise<void> {
    const bytes = packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength)

    const task = this.writeChain.then(async () => {
      await this.transport.send(bytes)
    })

    this.writeChain = task.catch(() => undefined)
    await task
  }

  private onTransportData(data: ArrayBuffer): void {
    const incoming = new Uint8Array(data)
    if (incoming.byteLength === 0) {
      return
    }

    this.readBuffer = concatBytes(this.readBuffer, incoming)
    this.drainMuxPackets()
  }

  private drainMuxPackets(): void {
    let offset = 0

    while (this.readBuffer.byteLength - offset >= 8) {
      const protocol = readU32(this.readBuffer, offset)
      const packetLength = readU32(this.readBuffer, offset + 4)

      if (packetLength < 8 || packetLength > MAX_MUX_PACKET) {
        this.readBuffer = new Uint8Array(0)
        return
      }

      if (this.readBuffer.byteLength - offset < packetLength) {
        break
      }

      const packet = this.readBuffer.slice(offset, offset + packetLength)

      let headerSize = this.muxVersion >= 2 ? 16 : 8
      if (headerSize === 16) {
        if (packet.byteLength < 16) {
          this.readBuffer = new Uint8Array(0)
          return
        }
        const magic = readU32(packet, 8)
        if (magic !== MUX_MAGIC_HOST && magic !== MUX_MAGIC_DEVICE_ALT) {
          if (!this.warnedMagicValues.has(magic)) {
            this.warnedMagicValues.add(magic)
            this.log(`Unexpected MUX magic: 0x${magic.toString(16)}.`)
          }
        }
        this.muxRxSeq = readU16(packet, 14)
      } else {
        headerSize = 8
      }

      const payload = packet.slice(headerSize)
      this.enqueueMuxPacket(protocol, payload)

      offset += packetLength
    }

    if (offset > 0) {
      this.readBuffer = this.readBuffer.slice(offset)
    }
  }

  private enqueueMuxPacket(protocol: number, payload: Uint8Array): void {
    const task = this.packetChain.then(async () => {
      await this.handleMuxPacket(protocol, payload)
    })
    this.packetChain = task.catch((error) => {
      this.log(`MUX packet handler error: ${formatError(error)}`)
    })
  }

  private async handleMuxPacket(protocol: number, payload: Uint8Array): Promise<void> {
    switch (protocol) {
      case MUX_PROTO_VERSION:
        this.handleVersionPacket(payload)
        return
      case MUX_PROTO_CONTROL:
        this.handleControlPacket(payload)
        return
      case MUX_PROTO_TCP:
        await this.handleTcpPacket(payload)
        return
      default:
        this.log(`Unhandled MUX protocol=${protocol}, len=${payload.byteLength}`)
    }
  }

  private handleVersionPacket(payload: Uint8Array): void {
    if (payload.byteLength < 12) {
      this.rejectWaiter(this.versionWaiter, new Error("Version packet too small"))
      this.versionWaiter = null
      return
    }

    const major = readU32(payload, 0)
    this.muxVersion = major

    this.resolveWaiter(this.versionWaiter, major)
    this.versionWaiter = null
  }

  private handleControlPacket(_payload: Uint8Array): void {
    return
  }

  private async handleTcpPacket(payload: Uint8Array): Promise<void> {
    if (payload.byteLength < 20) {
      return
    }

    const srcPort = readU16(payload, 0)
    const dstPort = readU16(payload, 2)
    const seq = readU32(payload, 4)
    const ack = readU32(payload, 8)
    const dataOffsetWords = (payload[12] >> 4) & 0x0f
    const flags = payload[13]

    const tcpHeaderSize = dataOffsetWords * 4
    if (payload.byteLength < tcpHeaderSize) {
      return
    }

    const data = payload.slice(tcpHeaderSize)
    const conn = this.connection

    if (!conn) {
      return
    }

    if (conn.sport !== dstPort || conn.dport !== srcPort) {
      return
    }

    if (conn.state === "connecting") {
      if (flags === (TCP_FLAG_SYN | TCP_FLAG_ACK)) {
        conn.txSeq = (conn.txSeq + 1) >>> 0
        conn.txAck = (seq + 1) >>> 0
        conn.state = "connected"
        await this.sendTcpFrame(TCP_FLAG_ACK, EMPTY_BYTES)
        this.resolveWaiter(this.connectWaiter, undefined)
        this.connectWaiter = null
        this.onStateChange()
      } else if ((flags & TCP_FLAG_RST) !== 0) {
        const error = new Error("TCP connect refused by device")
        this.rejectWaiter(this.connectWaiter, error)
        this.connectWaiter = null
      }
      return
    }

    conn.rxAck = ack

    if ((flags & TCP_FLAG_RST) !== 0) {
      this.resolveAndResetWaiters(new Error("TCP reset from device"))
      this.connection = null
      this.activeService = null
      this.resetAfcState()
      this.resetTlsEngine()
      this.clearPreparedTls()
      this.sessionId = null
      this.sessionSslEnabled = false
      this.lockdownBuffer = new Uint8Array(0)
      this.onStateChange()
      return
    }

    if (data.byteLength > 0) {
      conn.txAck = (seq + data.byteLength) >>> 0
      if (this.tlsConnection) {
        try {
          await this.processTlsInbound(data)
        } catch (error) {
          const err = new Error(formatError(error))
          this.resolveAndResetWaiters(err)
          this.connection = null
          this.activeService = null
          this.resetAfcState()
          this.resetTlsEngine()
          this.clearPreparedTls()
          this.sessionId = null
          this.sessionSslEnabled = false
          this.lockdownBuffer = new Uint8Array(0)
          this.onStateChange()
          return
        }
      } else if (this.activeService === "afc") {
        this.pushAfcData(data)
      } else {
        this.pushLockdownData(data)
      }
      await this.sendTcpFrame(TCP_FLAG_ACK, EMPTY_BYTES)
    }
  }

  private pushLockdownData(data: Uint8Array): void {
    this.lockdownBuffer = concatBytes(this.lockdownBuffer, data)

    while (this.lockdownBuffer.byteLength >= 4) {
      const frameLength = readU32(this.lockdownBuffer, 0)

      if (frameLength === 0 || frameLength > MAX_LOCKDOWN_FRAME) {
        this.lockdownBuffer = new Uint8Array(0)
        return
      }

      const totalLength = 4 + frameLength
      if (this.lockdownBuffer.byteLength < totalLength) {
        return
      }

      const payload = this.lockdownBuffer.slice(4, totalLength)

      if (this.responseWaiter) {
        this.resolveWaiter(this.responseWaiter, payload)
      } else {
        this.plistResponseQueue.push(payload)
        if (this.plistResponseQueue.length > 128) {
          this.plistResponseQueue.shift()
        }
      }

      this.lockdownBuffer = this.lockdownBuffer.slice(totalLength)
    }
  }

  private pushAfcData(data: Uint8Array): void {
    this.afcBuffer = concatBytes(this.afcBuffer, data)
    while (this.afcBuffer.byteLength >= AFC_HEADER_SIZE) {
      const magic = decodeUtf8(this.afcBuffer.slice(0, 8))
      if (magic !== AFC_MAGIC) {
        this.afcBuffer = new Uint8Array(0)
        return
      }
      const entireLength = readU64Le(this.afcBuffer, 8)
      const thisLength = readU64Le(this.afcBuffer, 16)
      const packetNum = readU64Le(this.afcBuffer, 24)
      const operation = readU64Le(this.afcBuffer, 32)

      if (
        entireLength < AFC_HEADER_SIZE ||
        thisLength < AFC_HEADER_SIZE ||
        thisLength > entireLength ||
        entireLength > MAX_AFC_FRAME
      ) {
        this.afcBuffer = new Uint8Array(0)
        return
      }
      if (this.afcBuffer.byteLength < entireLength) {
        return
      }

      const frameData = this.afcBuffer.slice(0, entireLength)
      const dataPart = frameData.slice(AFC_HEADER_SIZE, thisLength)
      const payloadPart = frameData.slice(thisLength, entireLength)
      const body = concatBytes(dataPart, payloadPart)
      this.resolveWaiter(this.afcResponseWaiter, {
        packetNum,
        operation,
        body,
      })
      this.afcResponseWaiter = null
      this.afcBuffer = this.afcBuffer.slice(entireLength)
    }
  }

  private onTransportDisconnect(reason: unknown): void {
    this.log(`USB disconnected: ${formatError(reason)}`)
    this.resolveAndResetWaiters(new Error("USB disconnected"))
    this.connection = null
    this.activeService = null
    this.resetAfcState()
    this.handshakeComplete = false
    this.sessionId = null
    this.sessionSslEnabled = false
    this.resetTlsEngine()
    this.clearPreparedTls()
    this.packetChain = Promise.resolve()
    this.onStateChange()
  }

  private async processTlsInbound(data: Uint8Array): Promise<void> {
    if (!this.tlsConnection) {
      return
    }
    this.tlsConnection.feed_tls(data)

    const plain = this.tlsConnection.take_plain_out()
    if (plain.byteLength > 0) {
      this.pushLockdownData(plain)
    }

    this.enqueueTlsOutbound(this.tlsConnection.take_tls_out())
    this.markTlsHandshakeCompletedIfReady()
    await this.flushTlsOutbound()
  }

  private markTlsHandshakeCompletedIfReady(): void {
    if (!this.tlsConnection || this.tlsActive) {
      return
    }
    if (this.tlsConnection.is_handshaking()) {
      return
    }
    this.tlsActive = true
    this.resolveWaiter(this.tlsHandshakeWaiter, undefined)
    this.tlsHandshakeWaiter = null
    this.onStateChange()
  }

  private resetTlsEngine(): void {
    this.tlsActive = false
    if (this.tlsConnection) {
      this.tlsConnection.free()
      this.tlsConnection = null
    }
    this.tlsOutboundQueue.length = 0
    this.tlsFlushChain = Promise.resolve()
  }

  private clearPreparedTls(): void {
    if (this.preparedTlsConnection) {
      this.preparedTlsConnection.free()
      this.preparedTlsConnection = null
    }
    this.preparedTlsFirstFlight = EMPTY_BYTES
  }

  private resetAfcState(): void {
    this.afcBuffer = new Uint8Array(0)
    this.afcPacketNum = 0
    this.afcResponsePacketNum = 0
    this.afcResponseWaiter = null
    this.plistResponseQueue.length = 0
  }

  private dropCurrentConnection(_reason: string): void {
    this.connection = null
    this.activeService = null
    this.resetAfcState()
    this.lockdownBuffer = new Uint8Array(0)
    this.resetTlsEngine()
    this.clearPreparedTls()
    this.sessionId = null
    this.sessionSslEnabled = false
    this.responseWaiter = null
    this.plistResponseQueue.length = 0
    this.connectWaiter = null
    this.tlsHandshakeWaiter = null
    this.onStateChange()
  }

  private resolveAndResetWaiters(error: Error): void {
    this.rejectWaiter(this.versionWaiter, error)
    this.rejectWaiter(this.connectWaiter, error)
    this.rejectWaiter(this.responseWaiter, error)
    this.rejectWaiter(this.afcResponseWaiter, error)
    this.rejectWaiter(this.tlsHandshakeWaiter, error)
    this.versionWaiter = null
    this.connectWaiter = null
    this.responseWaiter = null
    this.plistResponseQueue.length = 0
    this.afcResponseWaiter = null
    this.tlsHandshakeWaiter = null
  }

  private createWaiter<T>(name: string, timeoutMs: number): Waiter<T> {
    let resolveFn: ((value: T) => void) | null = null
    let rejectFn: ((reason?: unknown) => void) | null = null

    const promise = new Promise<T>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })

    const timeout = scheduleTimeout(() => {
      rejectFn?.(new Error(`${name} timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    return {
      promise,
      resolve: (value: T) => {
        cancelTimeout(timeout)
        resolveFn?.(value)
      },
      reject: (reason?: unknown) => {
        cancelTimeout(timeout)
        rejectFn?.(reason)
      },
    }
  }

  private resolveWaiter<T>(waiter: Waiter<T> | null, value: T): void {
    waiter?.resolve(value)
  }

  private rejectWaiter<T>(waiter: Waiter<T> | null, reason: unknown): void {
    waiter?.reject(reason)
  }

  private nextSport(): number {
    this.sportCounter += 1
    if (this.sportCounter > 65000) {
      this.sportCounter = 32000
    }
    return this.sportCounter
  }
}

export async function installIpaViaInstProxy(
  client: DirectUsbMuxClient,
  ipaData: Uint8Array,
  fileName: string,
  onLog?: (message: string) => void,
): Promise<void> {
  const safeFileName = sanitizeIpaFileName(fileName)
  const stagingDir = "/PublicStaging"
  const devicePath = `${stagingDir}/${safeFileName}`
  const packagePath = `PublicStaging/${safeFileName}`

  onLog?.(`Install pipeline: staging ${safeFileName} (${ipaData.byteLength} bytes)...`)

  await client.startAfcService()
  await client.afcMakeDir(stagingDir)
  await client.afcWriteFile(devicePath, ipaData)
  onLog?.(`Install pipeline: staged IPA at ${devicePath}.`)

  await client.startInstProxyService()
  await client.instProxyInstallPackage(packagePath, (update) => {
    const percentText =
      update.percentComplete !== null ? `, Percent=${update.percentComplete}%` : ""
    const statusText = update.status || "<unknown>"
    onLog?.(`InstProxy status: ${statusText}${percentText}`)
  })
  onLog?.("InstProxy install complete.")
}

export function sanitizeIpaFileName(fileName: string): string {
  const trimmed = fileName.trim()
  const fallback = "webmuxd-upload.ipa"
  const base = trimmed.length > 0 ? trimmed : fallback
  const safe = base.replace(/[^\w.\-]+/g, "_")
  return safe.toLowerCase().endsWith(".ipa") ? safe : `${safe}.ipa`
}

export function createHostId(): string {
  const cryptoWithRandomUuid = crypto as Crypto & { randomUUID?: () => string }
  if (typeof cryptoWithRandomUuid.randomUUID === "function") {
    return cryptoWithRandomUuid.randomUUID().toUpperCase()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase()
}

export function createSystemBuid(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
}

export function encodeStoredPairRecord(record: PairRecord): StoredPairRecordPayload {
  return {
    hostId: record.hostId,
    systemBuid: record.systemBuid,
    hostCertificatePem: normalizePem(record.hostCertificatePem),
    hostPrivateKeyPem: normalizePem(record.hostPrivateKeyPem),
    rootCertificatePem: normalizePem(record.rootCertificatePem),
    rootPrivateKeyPem: normalizePem(record.rootPrivateKeyPem),
    deviceCertificatePem: normalizePem(record.deviceCertificatePem),
    devicePublicKey: bytesToBase64(record.devicePublicKey),
    escrowBag: record.escrowBag ? bytesToBase64(record.escrowBag) : null,
  }
}

export function decodeStoredPairRecord(parsed: StoredPairRecordPayload): PairRecord | null {
  if (!parsed.hostId || !parsed.systemBuid || !parsed.devicePublicKey) {
    return null
  }

  const hostCertificatePem = normalizePem(parsed.hostCertificatePem)
  const hostPrivateKeyPem = normalizePem(parsed.hostPrivateKeyPem)
  const rootCertificatePem = normalizePem(parsed.rootCertificatePem)
  const rootPrivateKeyPem = normalizePem(parsed.rootPrivateKeyPem)
  const deviceCertificatePem = normalizePem(parsed.deviceCertificatePem)

  return {
    hostId: parsed.hostId,
    systemBuid: parsed.systemBuid,
    hostCertificatePem,
    hostPrivateKeyPem,
    rootCertificatePem,
    rootPrivateKeyPem,
    deviceCertificatePem,
    devicePublicKey: base64ToBytes(parsed.devicePublicKey),
    escrowBag: parsed.escrowBag ? base64ToBytes(parsed.escrowBag) : undefined,
  }
}

function parseAfcStringList(body: Uint8Array): string[] {
  const text = decodeUtf8(body)
  return text
    .split("\0")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseAfcKeyValueBody(body: Uint8Array): Record<string, string> {
  const parts = parseAfcStringList(body)
  const out: Record<string, string> = {}
  for (let index = 0; index + 1 < parts.length; index += 2) {
    out[parts[index]] = parts[index + 1]
  }
  return out
}

function extractInstProxyBundleIds(payload: Uint8Array | string): string[] {
  const root = parsePlistRoot(payload)
  if (!isPlistDict(root)) {
    return []
  }
  const currentListValue = root.CurrentList
  if (!Array.isArray(currentListValue)) {
    return []
  }
  const bundleIds: string[] = []
  for (const item of currentListValue) {
    if (!isPlistDict(item)) {
      continue
    }
    const bundleId = item.CFBundleIdentifier
    if (typeof bundleId === "string" && bundleId.length > 0) {
      bundleIds.push(bundleId)
    }
  }
  return bundleIds
}

function afcErrorName(status: number): string {
  const names: Record<number, string> = {
    0: "AFC_E_SUCCESS",
    1: "AFC_E_UNKNOWN_ERROR",
    2: "AFC_E_OP_HEADER_INVALID",
    3: "AFC_E_NO_RESOURCES",
    4: "AFC_E_READ_ERROR",
    5: "AFC_E_WRITE_ERROR",
    6: "AFC_E_UNKNOWN_PACKET_TYPE",
    7: "AFC_E_INVALID_ARG",
    8: "AFC_E_OBJECT_NOT_FOUND",
    9: "AFC_E_OBJECT_IS_DIR",
    10: "AFC_E_PERM_DENIED",
    11: "AFC_E_SERVICE_NOT_CONNECTED",
    12: "AFC_E_OP_TIMEOUT",
    13: "AFC_E_TOO_MUCH_DATA",
    14: "AFC_E_END_OF_DATA",
    15: "AFC_E_OP_NOT_SUPPORTED",
    16: "AFC_E_OBJECT_EXISTS",
    17: "AFC_E_OBJECT_BUSY",
    18: "AFC_E_NO_SPACE_LEFT",
    19: "AFC_E_OP_WOULD_BLOCK",
    20: "AFC_E_IO_ERROR",
    21: "AFC_E_OP_INTERRUPTED",
    22: "AFC_E_OP_IN_PROGRESS",
    23: "AFC_E_INTERNAL_ERROR",
    30: "AFC_E_MUX_ERROR",
    31: "AFC_E_NO_MEM",
    32: "AFC_E_NOT_ENOUGH_DATA",
    33: "AFC_E_DIR_NOT_EMPTY",
    34: "AFC_E_SSL_ERROR",
  }
  return names[status] ?? "AFC_E_UNKNOWN"
}

function extractPlistValue(payload: Uint8Array | string, key: string): string | null {
  const root = parsePlistRoot(payload)
  if (!isPlistDict(root)) {
    return null
  }
  const value = root[key]
  return stringifyPlistRuntimeValue(value)
}

function extractPlistData(payload: Uint8Array | string, key: string): Uint8Array | null {
  const root = parsePlistRoot(payload)
  if (!isPlistDict(root)) {
    return null
  }
  const value = root[key]
  if (value instanceof Uint8Array) {
    return value
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  return null
}

function extractPlistNumber(payload: Uint8Array | string, key: string): number | null {
  const root = parsePlistRoot(payload)
  if (!isPlistDict(root)) {
    return null
  }
  const value = root[key]
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function parsePlistRoot(payload: Uint8Array | string): PlistValue | null {
  if (typeof payload === "string") {
    return parseXmlPlistToRuntimeValue(payload)
  }
  if (isBinaryPlist(payload)) {
    return parseBinaryPlist(payload)
  }
  return parseXmlPlistToRuntimeValue(decodeUtf8(payload))
}

function isPlistDict(value: PlistValue | null): value is { [key: string]: PlistValue } {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Uint8Array) &&
      !(value instanceof ArrayBuffer),
  )
}

function stringifyPlistRuntimeValue(value: PlistValue | undefined): string | null {
  if (value === undefined) {
    return null
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number") {
    return String(value)
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return "[data]"
  }
  if (Array.isArray(value)) {
    return "[array]"
  }
  if (value && typeof value === "object") {
    return "[dict]"
  }
  return String(value)
}

function parseXmlPlistToRuntimeValue(xml: string): PlistValue | null {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is unavailable")
  }
  const parser = new DOMParser()
  const documentNode = parser.parseFromString(xml, "application/xml")
  const parserError = documentNode.querySelector("parsererror")
  if (parserError) {
    return null
  }
  const rootNode = documentNode.querySelector("plist > *")
  if (!rootNode) {
    return null
  }
  return parseXmlPlistNode(rootNode)
}

function parseXmlPlistNode(node: Element): PlistValue {
  switch (node.tagName) {
    case "string":
    case "date":
      return node.textContent ?? ""
    case "integer": {
      const text = (node.textContent ?? "").trim()
      const value = Number.parseInt(text, 10)
      return Number.isFinite(value) ? value : 0
    }
    case "real": {
      const text = (node.textContent ?? "").trim()
      const value = Number.parseFloat(text)
      return Number.isFinite(value) ? value : 0
    }
    case "data":
      return base64ToBytes((node.textContent ?? "").trim())
    case "true":
      return true
    case "false":
      return false
    case "array":
      return Array.from(node.children).map((child) => parseXmlPlistNode(child))
    case "dict": {
      const map: { [key: string]: PlistValue } = {}
      const nodes = Array.from(node.children)
      for (let index = 0; index < nodes.length - 1; index += 2) {
        const keyNode = nodes[index]
        const valueNode = nodes[index + 1]
        if (keyNode?.tagName !== "key") {
          continue
        }
        map[keyNode.textContent ?? ""] = parseXmlPlistNode(valueNode)
      }
      return map
    }
    default:
      return node.textContent ?? ""
  }
}

function isBinaryPlist(payload: Uint8Array): boolean {
  return (
    payload.byteLength >= 8 &&
    payload[0] === 0x62 &&
    payload[1] === 0x70 &&
    payload[2] === 0x6c &&
    payload[3] === 0x69 &&
    payload[4] === 0x73 &&
    payload[5] === 0x74 &&
    payload[6] === 0x30 &&
    payload[7] === 0x30
  )
}

function parseBinaryPlist(payload: Uint8Array): PlistValue {
  if (!isBinaryPlist(payload)) {
    throw new Error("Not a binary plist")
  }
  if (payload.byteLength < 40) {
    throw new Error("Binary plist is too short")
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const trailerOffset = payload.byteLength - 32
  const offsetSize = view.getUint8(trailerOffset + 6)
  const objectRefSize = view.getUint8(trailerOffset + 7)
  const numObjects = readU64Be(view, trailerOffset + 8)
  const topObject = readU64Be(view, trailerOffset + 16)
  const offsetTableOffset = readU64Be(view, trailerOffset + 24)

  if (offsetSize < 1 || objectRefSize < 1) {
    throw new Error("Invalid bplist trailer sizes")
  }
  if (numObjects <= 0) {
    throw new Error("Invalid bplist object count")
  }

  const offsets: number[] = []
  for (let index = 0; index < numObjects; index += 1) {
    const entryOffset = offsetTableOffset + index * offsetSize
    if (entryOffset + offsetSize > payload.byteLength) {
      throw new Error("bplist offset table out of range")
    }
    offsets.push(readUIntBe(view, entryOffset, offsetSize))
  }

  const objectCache = new Map<number, PlistValue>()

  const parseObject = (objectIndex: number): PlistValue => {
    if (objectCache.has(objectIndex)) {
      return objectCache.get(objectIndex) as PlistValue
    }
    if (objectIndex < 0 || objectIndex >= offsets.length) {
      throw new Error(`bplist object index out of range: ${objectIndex}`)
    }
    const objectOffset = offsets[objectIndex]
    if (objectOffset >= payload.byteLength) {
      throw new Error(`bplist object offset out of range: ${objectOffset}`)
    }

    const marker = view.getUint8(objectOffset)
    const objectType = marker >> 4
    const objectInfo = marker & 0x0f

    const readLength = (): { length: number; start: number } => {
      if (objectInfo !== 0x0f) {
        return { length: objectInfo, start: objectOffset + 1 }
      }
      const intMarkerOffset = objectOffset + 1
      const intMarker = view.getUint8(intMarkerOffset)
      const intType = intMarker >> 4
      const intInfo = intMarker & 0x0f
      if (intType !== 0x1) {
        throw new Error("bplist length marker is not integer")
      }
      const intByteSize = 1 << intInfo
      const intValueOffset = intMarkerOffset + 1
      const length = readUIntBe(view, intValueOffset, intByteSize)
      return { length, start: intValueOffset + intByteSize }
    }

    let result: PlistValue
    switch (objectType) {
      case 0x0:
        if (objectInfo === 0x8) {
          result = false
        } else if (objectInfo === 0x9) {
          result = true
        } else {
          result = ""
        }
        break
      case 0x1: {
        const byteSize = 1 << objectInfo
        result = readIntBe(view, objectOffset + 1, byteSize)
        break
      }
      case 0x2: {
        const byteSize = 1 << objectInfo
        if (byteSize === 4) {
          result = view.getFloat32(objectOffset + 1, false)
        } else if (byteSize === 8) {
          result = view.getFloat64(objectOffset + 1, false)
        } else {
          throw new Error(`Unsupported bplist float size=${byteSize}`)
        }
        break
      }
      case 0x3: {
        const byteSize = 1 << objectInfo
        if (byteSize !== 8) {
          throw new Error(`Unsupported bplist date size=${byteSize}`)
        }
        const appleEpochSeconds = view.getFloat64(objectOffset + 1, false)
        const unixMs = (appleEpochSeconds + 978307200) * 1000
        result = new Date(unixMs).toISOString()
        break
      }
      case 0x4: {
        const { length, start } = readLength()
        result = payload.slice(start, start + length)
        break
      }
      case 0x5: {
        const { length, start } = readLength()
        result = decodeUtf8(payload.slice(start, start + length))
        break
      }
      case 0x6: {
        const { length, start } = readLength()
        let text = ""
        for (let i = 0; i < length; i += 1) {
          const codePoint = view.getUint16(start + i * 2, false)
          text += String.fromCharCode(codePoint)
        }
        result = text
        break
      }
      case 0x8: {
        const byteSize = objectInfo + 1
        result = readUIntBe(view, objectOffset + 1, byteSize)
        break
      }
      case 0xa: {
        const { length, start } = readLength()
        const arrayValue: PlistValue[] = []
        for (let i = 0; i < length; i += 1) {
          const refOffset = start + i * objectRefSize
          const ref = readUIntBe(view, refOffset, objectRefSize)
          arrayValue.push(parseObject(ref))
        }
        result = arrayValue
        break
      }
      case 0xd: {
        const { length, start } = readLength()
        const dictValue: { [key: string]: PlistValue } = {}
        const keysStart = start
        const valuesStart = start + length * objectRefSize
        for (let i = 0; i < length; i += 1) {
          const keyRef = readUIntBe(view, keysStart + i * objectRefSize, objectRefSize)
          const valueRef = readUIntBe(view, valuesStart + i * objectRefSize, objectRefSize)
          const keyNode = parseObject(keyRef)
          if (typeof keyNode !== "string") {
            continue
          }
          dictValue[keyNode] = parseObject(valueRef)
        }
        result = dictValue
        break
      }
      default:
        throw new Error(`Unsupported bplist object type=0x${objectType.toString(16)}`)
    }

    objectCache.set(objectIndex, result)
    return result
  }

  return parseObject(topObject)
}

function readUIntBe(view: DataView, offset: number, byteLength: number): number {
  let value = 0
  for (let index = 0; index < byteLength; index += 1) {
    value = value * 256 + view.getUint8(offset + index)
    if (!Number.isSafeInteger(value)) {
      throw new Error("Integer exceeds max safe range")
    }
  }
  return value
}

function readIntBe(view: DataView, offset: number, byteLength: number): number {
  switch (byteLength) {
    case 1:
      return view.getInt8(offset)
    case 2:
      return view.getInt16(offset, false)
    case 4:
      return view.getInt32(offset, false)
    case 8: {
      const high = view.getUint32(offset, false)
      const low = view.getUint32(offset + 4, false)
      if ((high & 0x80000000) === 0) {
        const value = high * 4294967296 + low
        if (!Number.isSafeInteger(value)) {
          throw new Error("Signed integer exceeds safe range")
        }
        return value
      }
      const invHigh = (~high) >>> 0
      const invLow = (~low) >>> 0
      const twos = invHigh * 4294967296 + invLow + 1
      if (!Number.isSafeInteger(twos)) {
        throw new Error("Signed integer exceeds safe range")
      }
      return -twos
    }
    default:
      return readUIntBe(view, offset, byteLength)
  }
}

function readU64Be(view: DataView, offset: number): number {
  const high = view.getUint32(offset, false)
  const low = view.getUint32(offset + 4, false)
  const value = high * 4294967296 + low
  if (!Number.isSafeInteger(value)) {
    throw new Error("u64 exceeds max safe integer")
  }
  return value
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const merged = new Uint8Array(left.byteLength + right.byteLength)
  if (left.byteLength > 0) {
    merged.set(left, 0)
  }
  if (right.byteLength > 0) {
    merged.set(right, left.byteLength)
  }
  return merged
}

function concatByteChunks(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array {
  if (totalBytes === 0) {
    return EMPTY_BYTES
  }
  const out = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function readU16(source: Uint8Array, offset: number): number {
  return new DataView(source.buffer, source.byteOffset, source.byteLength).getUint16(offset, false)
}

function readU32(source: Uint8Array, offset: number): number {
  return new DataView(source.buffer, source.byteOffset, source.byteLength).getUint32(offset, false)
}

function writeU16(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(offset, value, false)
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, false)
}

function writeU64Le(target: Uint8Array, offset: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invalid u64 value=${value}`)
  }
  const low = value >>> 0
  const high = Math.floor(value / 4294967296) >>> 0
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength)
  view.setUint32(offset, low, true)
  view.setUint32(offset + 4, high, true)
}

function readU64Le(source: Uint8Array, offset: number): number {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength)
  const low = view.getUint32(offset, true)
  const high = view.getUint32(offset + 4, true)
  const value = high * 4294967296 + low
  if (!Number.isSafeInteger(value)) {
    throw new Error(`u64 exceeds max safe integer: ${high}:${low}`)
  }
  return value
}

function encodeAfcFrame(
  packetNum: number,
  operation: number,
  data: Uint8Array,
  payload: Uint8Array = EMPTY_BYTES,
): Uint8Array {
  const thisLength = AFC_HEADER_SIZE + data.byteLength
  const frameLength = thisLength + payload.byteLength
  const frame = new Uint8Array(frameLength)
  frame.set(encodeUtf8(AFC_MAGIC), 0)
  writeU64Le(frame, 8, frameLength)
  writeU64Le(frame, 16, thisLength)
  writeU64Le(frame, 24, packetNum)
  writeU64Le(frame, 32, operation >>> 0)
  if (data.byteLength > 0) {
    frame.set(data, AFC_HEADER_SIZE)
  }
  if (payload.byteLength > 0) {
    frame.set(payload, thisLength)
  }
  return frame
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    scheduleTimeout(resolve, ms)
  })
}

function bytesToBase64(value: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = ""
    for (const byte of value) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64")
  }
  throw new Error("No base64 encoder available")
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s+/g, "")
  if (typeof atob === "function") {
    const binary = atob(normalized)
    const out = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      out[index] = binary.charCodeAt(index)
    }
    return out
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(normalized, "base64"))
  }
  throw new Error("No base64 decoder available")
}

function normalizePem(value: string): string {
  const normalized = value.replace(/\0/g, "").replace(/\r\n/g, "\n").trim()
  return `${normalized}\n`
}

function scheduleTimeout(handler: () => void, ms: number): number {
  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    return window.setTimeout(handler, ms)
  }
  return setTimeout(handler, ms) as unknown as number
}

function cancelTimeout(timeout: number): void {
  if (typeof window !== "undefined" && typeof window.clearTimeout === "function") {
    window.clearTimeout(timeout)
    return
  }
  clearTimeout(timeout as unknown as ReturnType<typeof setTimeout>)
}
