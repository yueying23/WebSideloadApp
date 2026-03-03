import { strFromU8, unzipSync } from "fflate"
import {
  AppleAPI,
  Fetch,
  signIPA,
  type AnisetteData,
  type AppID,
  type Certificate,
  type Device,
  type Team,
} from "altsign.js"
import { initLibcurl, libcurl } from "./anisette-libcurl-init"

const SIGNING_IDENTITY_STORAGE_KEY = "webmuxd:signing-identities"
const PRIMARY_APP_INFO_PLIST_RE = /^Payload\/[^/]+\.app\/Info\.plist$/

interface ParsedIpaInfo {
  bundleId?: string
  displayName?: string
}

interface CachedSigningIdentityPayload {
  certId: string
  certPublicKeyBase64: string
  privateKeyBase64: string
}

interface StoredSigningIdentityMap {
  [appleAndTeamKey: string]: CachedSigningIdentityPayload
}

export interface AppleSigningCredentials {
  appleId: string
  password: string
}

export interface AppleSigningRequest {
  ipaFile: File
  anisetteData: AnisetteData
  credentials: AppleSigningCredentials
  deviceUdid: string
  deviceName?: string
  bundleIdOverride?: string
  displayNameOverride?: string
  onLog: (message: string) => void
}

export interface AppleSigningResult {
  signedFile: File
  outputBundleId: string
  teamId: string
}

export interface AppleDeveloperSession {
  anisetteData: AnisetteData
  dsid: string
  authToken: string
}

export interface AppleDeveloperContext {
  appleId: string
  session: AppleDeveloperSession
  team: Team
  certificates: Certificate[]
  devices: Device[]
}

export interface AppleDeveloperLoginRequest {
  anisetteData: AnisetteData
  credentials: AppleSigningCredentials
  onLog?: (message: string) => void
  onTwoFactorRequired?: (submitCode: (code: string) => void) => void
}

export interface AppleSigningWithContextRequest {
  ipaFile: File
  context: AppleDeveloperContext
  deviceUdid: string
  deviceName?: string
  bundleIdOverride?: string
  displayNameOverride?: string
  onLog: (message: string) => void
}

let appleApiInstance: AppleAPI | null = null

function getAppleApi(): AppleAPI {
  if (appleApiInstance) {
    return appleApiInstance
  }
  const appleFetch = new Fetch(initLibcurl, async (url, options) => {
    const response = await libcurl.fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      redirect: "manual",
      insecure: true,
      verbose: 4,
      _libcurl_http_version: 1.1,
    } as never)
    return response
  })
  appleApiInstance = new AppleAPI(appleFetch)
  return appleApiInstance
}

export async function loginAppleDeveloperAccount(
  request: AppleDeveloperLoginRequest,
): Promise<AppleDeveloperContext> {
  const appleId = request.credentials.appleId.trim()
  const password = request.credentials.password
  if (!appleId || !password) {
    throw new Error("Cannot login Apple account: Apple ID or password is empty")
  }

  const log = request.onLog ?? (() => undefined)
  log(`Login stage: authenticating Apple account ${maskEmail(appleId)}...`)

  const api = getAppleApi()
  const { session } = await api.authenticate(
    appleId,
    password,
    request.anisetteData,
    (submitCode) => {
      if (request.onTwoFactorRequired) {
        request.onTwoFactorRequired((code) => {
          const normalized = code.trim()
          if (normalized.length === 0) {
            throw new Error("2FA code is required")
          }
          submitCode(normalized)
        })
        return
      }
      const code = window.prompt("Apple 2FA code")
      if (!code || code.trim().length === 0) {
        throw new Error("2FA code is required")
      }
      submitCode(code.trim())
    },
  )

  log("Login stage: fetching team/certificates/devices...")
  const team = await api.fetchTeam(session)
  const [certificates, devices] = await Promise.all([
    api.fetchCertificates(session, team),
    api.fetchDevices(session, team).catch(() => [] as Device[]),
  ])

  log(
    `Login stage: team=${team.identifier} (${team.name}), certs=${certificates.length}, devices=${devices.length}.`,
  )

  return {
    appleId,
    session,
    team,
    certificates,
    devices,
  }
}

export async function refreshAppleDeveloperContext(
  context: AppleDeveloperContext,
  onLog?: (message: string) => void,
): Promise<AppleDeveloperContext> {
  const log = onLog ?? (() => undefined)
  const api = getAppleApi()
  log("Signing stage: refreshing team/certificates/devices...")
  const team = await api.fetchTeam(context.session)
  const [certificates, devices] = await Promise.all([
    api.fetchCertificates(context.session, team),
    api.fetchDevices(context.session, team).catch(() => [] as Device[]),
  ])
  log(
    `Signing stage: refreshed team=${team.identifier}, certs=${certificates.length}, devices=${devices.length}.`,
  )
  return {
    ...context,
    team,
    certificates,
    devices,
  }
}

export async function signIpaWithApple(
  request: AppleSigningRequest,
): Promise<AppleSigningResult> {
  const context = await loginAppleDeveloperAccount({
    anisetteData: request.anisetteData,
    credentials: request.credentials,
    onLog: request.onLog,
  })
  return await signIpaWithAppleContext({
    ipaFile: request.ipaFile,
    context,
    deviceUdid: request.deviceUdid,
    deviceName: request.deviceName,
    bundleIdOverride: request.bundleIdOverride,
    displayNameOverride: request.displayNameOverride,
    onLog: request.onLog,
  })
}

export async function signIpaWithAppleContext(
  request: AppleSigningWithContextRequest,
): Promise<AppleSigningResult> {
  const { ipaFile, context, onLog } = request
  const ipaData = new Uint8Array(await ipaFile.arrayBuffer())
  const ipaInfo = readIpaInfo(ipaData)

  const bundleIdBase = (request.bundleIdOverride ?? ipaInfo.bundleId ?? "").trim()
  if (bundleIdBase.length === 0) {
    throw new Error("Cannot sign IPA: bundle identifier is missing")
  }

  const api = getAppleApi()
  const team = context.team
  onLog(`Signing stage: using team ${team.identifier} (${team.name}).`)

  const finalBundleId = buildTeamScopedBundleId(bundleIdBase, team.identifier)
  const displayName = (request.displayNameOverride ?? ipaInfo.displayName ?? "").trim()

  const identity = await ensureSigningIdentity(
    api,
    context.session,
    team,
    context.appleId,
    onLog,
  )
  await ensureDeviceRegistered(
    api,
    context.session,
    team,
    request.deviceUdid,
    request.deviceName,
    onLog,
  )
  const appId = await ensureAppId(api, context.session, team, finalBundleId, onLog)

  onLog("Signing stage: fetching provisioning profile...")
  const provisioningProfile = await api.fetchProvisioningProfile(context.session, team, appId)

  onLog("Signing stage: resigning IPA in browser...")
  const signed = await signIPA({
    ipaData,
    certificate: identity.certificate.publicKey,
    privateKey: identity.privateKey,
    provisioningProfile: provisioningProfile.data,
    bundleID: finalBundleId,
    displayName: displayName.length > 0 ? displayName : undefined,
    adhoc: false,
    forceSign: true,
  })

  const outputFileName = toSignedFileName(ipaFile.name)
  const signedArray = new Uint8Array(signed.data.byteLength)
  signedArray.set(signed.data)
  const signedBuffer = signedArray.buffer.slice(0)
  const signedFile = new File([signedBuffer], outputFileName, {
    type: "application/octet-stream",
  })
  onLog(`Signing stage: complete (${signed.data.byteLength} bytes).`)

  return {
    signedFile,
    outputBundleId: finalBundleId,
    teamId: team.identifier,
  }
}

async function ensureSigningIdentity(
  api: AppleAPI,
  session: { anisetteData: AnisetteData; dsid: string; authToken: string },
  team: Team,
  appleId: string,
  onLog: (message: string) => void,
): Promise<{ certificate: Certificate; privateKey: Uint8Array }> {
  const certificates = await api.fetchCertificates(session, team)
  const cached = loadCachedSigningIdentity(appleId, team.identifier)

  if (cached) {
    const matched = certificates.find((item) => item.identifier === cached.certId)
    if (matched) {
      onLog(`Signing stage: using cached certificate ${matched.identifier}.`)
      return {
        certificate: {
          ...matched,
          publicKey: base64ToBytes(cached.certPublicKeyBase64),
        },
        privateKey: base64ToBytes(cached.privateKeyBase64),
      }
    }
  }

  onLog("Signing stage: creating development certificate...")
  let created: { certificate: Certificate; privateKey: Uint8Array }
  try {
    created = await api.addCertificate(session, team, `webmuxd-${Date.now()}`)
  } catch (error) {
    const message = String(error)
    if (!message.includes("7460") || certificates.length === 0) {
      throw error
    }
    const target = certificates[0]
    onLog(`Signing stage: certificate limit hit, revoking ${target.identifier}...`)
    await api.revokeCertificate(session, team, target)
    created = await api.addCertificate(session, team, `webmuxd-${Date.now()}`)
  }

  saveCachedSigningIdentity(appleId, team.identifier, {
    certId: created.certificate.identifier,
    certPublicKeyBase64: bytesToBase64(created.certificate.publicKey),
    privateKeyBase64: bytesToBase64(created.privateKey),
  })
  onLog(`Signing stage: certificate ready ${created.certificate.identifier}.`)
  return created
}

async function ensureDeviceRegistered(
  api: AppleAPI,
  session: { anisetteData: AnisetteData; dsid: string; authToken: string },
  team: Team,
  deviceUdid: string,
  deviceName: string | undefined,
  onLog: (message: string) => void,
): Promise<void> {
  const normalizedUdid = normalizeUdid(deviceUdid)
  if (!normalizedUdid) {
    onLog("Signing stage: skip device registration because UDID is empty.")
    return
  }

  let devices: Device[] = []
  try {
    devices = await api.fetchDevices(session, team)
  } catch (error) {
    onLog(`Signing stage: fetchDevices failed, skip registration check: ${formatError(error)}`)
  }
  const existed = findRegisteredDevice(devices, normalizedUdid)
  if (existed) {
    onLog(`Signing stage: device already registered (${existed.identifier}).`)
    return
  }

  const registerName =
    deviceName && deviceName.trim().length > 0
      ? deviceName.trim()
      : `webmuxd-${normalizedUdid.slice(-6)}`
  try {
    onLog(`Signing stage: registering device ${normalizedUdid} as ${registerName}...`)
    await api.registerDevice(session, team, registerName, normalizedUdid)
    onLog(`Signing stage: device registered (${normalizedUdid}).`)
  } catch (error) {
    onLog(`Signing stage: register failed, skip and continue: ${formatError(error)}`)
    try {
      const latestDevices = await api.fetchDevices(session, team)
      const registered = findRegisteredDevice(latestDevices, normalizedUdid)
      if (registered) {
        onLog(`Signing stage: device confirmed in developer list (${registered.identifier}).`)
        return
      }
    } catch (verifyError) {
      onLog(`Signing stage: device verify after failure also failed: ${formatError(verifyError)}`)
    }
    onLog("Signing stage: continue without registration (may affect profile generation).")
    return
  }

  try {
    const latestDevices = await api.fetchDevices(session, team)
    const registered = findRegisteredDevice(latestDevices, normalizedUdid)
    if (registered) {
      onLog(`Signing stage: device confirmed in developer list (${registered.identifier}).`)
    }
  } catch (error) {
    onLog(`Signing stage: device verification skipped: ${formatError(error)}`)
  }
}

async function ensureAppId(
  api: AppleAPI,
  session: { anisetteData: AnisetteData; dsid: string; authToken: string },
  team: Team,
  bundleId: string,
  onLog: (message: string) => void,
): Promise<AppID> {
  const appIds = await api.fetchAppIDs(session, team)
  const matched = appIds.find((item) => item.bundleIdentifier === bundleId)
  if (matched) {
    onLog(`Signing stage: reuse App ID ${bundleId}.`)
    return matched
  }
  onLog(`Signing stage: creating App ID ${bundleId}...`)
  return api.addAppID(session, team, "WebMuxD Signed App", bundleId)
}

function readIpaInfo(ipaBytes: Uint8Array): ParsedIpaInfo {
  const files = unzipSync(ipaBytes, {
    filter: (file) => PRIMARY_APP_INFO_PLIST_RE.test(file.name),
  })
  const infoName = Object.keys(files).find((name) => PRIMARY_APP_INFO_PLIST_RE.test(name))
  if (!infoName) {
    return {}
  }
  const plistData = parseInfoPlist(files[infoName])
  if (!plistData || typeof plistData !== "object" || Array.isArray(plistData)) {
    return {}
  }
  const data = plistData as Record<string, unknown>
  const bundleId =
    typeof data.CFBundleIdentifier === "string" ? (data.CFBundleIdentifier as string) : undefined
  const displayName =
    typeof data.CFBundleDisplayName === "string"
      ? (data.CFBundleDisplayName as string)
      : typeof data.CFBundleName === "string"
        ? (data.CFBundleName as string)
        : undefined
  return { bundleId, displayName }
}

function parseInfoPlist(infoPlistBytes: Uint8Array): unknown {
  if (strFromU8(infoPlistBytes.subarray(0, 8)) === "bplist00") {
    return parseBinaryPlist(infoPlistBytes)
  }
  const xml = strFromU8(infoPlistBytes)
  return parseXmlPlist(xml)
}

function parseXmlPlist(xml: string): unknown {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  const parserError = doc.querySelector("parsererror")
  if (parserError) {
    return {}
  }
  const root = doc.querySelector("plist > *")
  if (!root) {
    return {}
  }
  return parseXmlNode(root)
}

function parseXmlNode(node: Element): unknown {
  switch (node.tagName) {
    case "dict": {
      const map: Record<string, unknown> = {}
      const children = Array.from(node.children)
      for (let i = 0; i < children.length - 1; i += 2) {
        const keyNode = children[i]
        const valueNode = children[i + 1]
        if (keyNode.tagName !== "key") {
          continue
        }
        map[keyNode.textContent ?? ""] = parseXmlNode(valueNode)
      }
      return map
    }
    case "array":
      return Array.from(node.children).map((child) => parseXmlNode(child))
    case "string":
    case "date":
      return node.textContent ?? ""
    case "integer":
      return Number.parseInt(node.textContent ?? "0", 10)
    case "real":
      return Number.parseFloat(node.textContent ?? "0")
    case "true":
      return true
    case "false":
      return false
    case "data":
      return base64ToBytes((node.textContent ?? "").trim())
    default:
      return node.textContent ?? ""
  }
}

function parseBinaryPlist(bytes: Uint8Array): unknown {
  if (bytes.length < 40 || strFromU8(bytes.subarray(0, 8)) !== "bplist00") {
    throw new Error("Invalid binary plist")
  }

  const trailerOffset = bytes.length - 32
  const offsetSize = bytes[trailerOffset + 6]
  const objectRefSize = bytes[trailerOffset + 7]
  const objectCount = readUInt(bytes, trailerOffset + 8, 8)
  const topObject = readUInt(bytes, trailerOffset + 16, 8)
  const offsetTableStart = readUInt(bytes, trailerOffset + 24, 8)

  const objectOffsets = new Array<number>(objectCount)
  for (let i = 0; i < objectCount; i += 1) {
    const entryOffset = offsetTableStart + i * offsetSize
    objectOffsets[i] = readUInt(bytes, entryOffset, offsetSize)
  }

  const memo = new Map<number, unknown>()

  const readLength = (offset: number, objectInfo: number): { length: number; nextOffset: number } => {
    if (objectInfo < 0x0f) {
      return { length: objectInfo, nextOffset: offset + 1 }
    }
    const marker = bytes[offset + 1]
    const markerType = marker >> 4
    const markerInfo = marker & 0x0f
    if (markerType !== 0x1) {
      throw new Error("Invalid binary plist length marker")
    }
    const intSize = 1 << markerInfo
    const intOffset = offset + 2
    return {
      length: readUInt(bytes, intOffset, intSize),
      nextOffset: intOffset + intSize,
    }
  }

  const parseObject = (index: number): unknown => {
    if (memo.has(index)) {
      return memo.get(index)
    }
    const offset = objectOffsets[index]
    const marker = bytes[offset]
    const objectType = marker >> 4
    const objectInfo = marker & 0x0f

    let value: unknown
    if (objectType === 0x0) {
      value = objectInfo === 0x8 ? false : objectInfo === 0x9
    } else if (objectType === 0x1) {
      value = readUInt(bytes, offset + 1, 1 << objectInfo)
    } else if (objectType === 0x2) {
      const realSize = 1 << objectInfo
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, realSize)
      value = realSize === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false)
    } else if (objectType === 0x5) {
      const { length, nextOffset } = readLength(offset, objectInfo)
      value = strFromU8(bytes.subarray(nextOffset, nextOffset + length))
    } else if (objectType === 0x6) {
      const { length, nextOffset } = readLength(offset, objectInfo)
      value = decodeUtf16Be(bytes.subarray(nextOffset, nextOffset + length * 2))
    } else if (objectType === 0xa) {
      const { length, nextOffset } = readLength(offset, objectInfo)
      const items: unknown[] = []
      for (let i = 0; i < length; i += 1) {
        const ref = readUInt(bytes, nextOffset + i * objectRefSize, objectRefSize)
        items.push(parseObject(ref))
      }
      value = items
    } else if (objectType === 0xd) {
      const { length, nextOffset } = readLength(offset, objectInfo)
      const map: Record<string, unknown> = {}
      const valuesOffset = nextOffset + length * objectRefSize
      for (let i = 0; i < length; i += 1) {
        const keyRef = readUInt(bytes, nextOffset + i * objectRefSize, objectRefSize)
        const valueRef = readUInt(bytes, valuesOffset + i * objectRefSize, objectRefSize)
        const key = parseObject(keyRef)
        if (typeof key === "string") {
          map[key] = parseObject(valueRef)
        }
      }
      value = map
    } else {
      value = null
    }

    memo.set(index, value)
    return value
  }

  return parseObject(topObject)
}

function readUInt(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0
  for (let i = 0; i < length; i += 1) {
    value = value * 256 + bytes[offset + i]
  }
  return value
}

function decodeUtf16Be(bytes: Uint8Array): string {
  let text = ""
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
  }
  return text
}

function buildTeamScopedBundleId(baseBundleId: string, teamId: string): string {
  const trimmedBase = baseBundleId.trim()
  const trimmedTeam = teamId.trim()
  if (!trimmedBase || !trimmedTeam) {
    return trimmedBase
  }
  const lowerBase = trimmedBase.toLowerCase()
  const lowerTeam = trimmedTeam.toLowerCase()
  if (lowerBase.endsWith(`.${lowerTeam}`)) {
    return trimmedBase
  }
  return `${trimmedBase}.${trimmedTeam}`
}

function toSignedFileName(name: string): string {
  if (!name.toLowerCase().endsWith(".ipa")) {
    return `${name}-signed.ipa`
  }
  return `${name.slice(0, -4)}-signed.ipa`
}

function loadCachedSigningIdentity(
  appleId: string,
  teamId: string,
): CachedSigningIdentityPayload | null {
  const map = loadSigningIdentityMap()
  const key = signingIdentityKey(appleId, teamId)
  const value = map[key]
  if (!value || !value.certId || !value.certPublicKeyBase64 || !value.privateKeyBase64) {
    return null
  }
  return value
}

function saveCachedSigningIdentity(
  appleId: string,
  teamId: string,
  payload: CachedSigningIdentityPayload,
): void {
  const map = loadSigningIdentityMap()
  map[signingIdentityKey(appleId, teamId)] = payload
  window.localStorage.setItem(SIGNING_IDENTITY_STORAGE_KEY, JSON.stringify(map))
}

function loadSigningIdentityMap(): StoredSigningIdentityMap {
  const raw = window.localStorage.getItem(SIGNING_IDENTITY_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }
    return parsed as StoredSigningIdentityMap
  } catch {
    return {}
  }
}

function signingIdentityKey(appleId: string, teamId: string): string {
  return `${appleId.trim().toLowerCase()}::${teamId.trim().toUpperCase()}`
}

function bytesToBase64(value: Uint8Array): string {
  let binary = ""
  for (const byte of value) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s+/g, "")
  const binary = atob(normalized)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function maskEmail(value: string): string {
  const trimmed = value.trim()
  const at = trimmed.indexOf("@")
  if (at <= 1) {
    return "***"
  }
  return `${trimmed.slice(0, 2)}***${trimmed.slice(at)}`
}

function findRegisteredDevice(devices: readonly Device[], normalizedUdid: string): Device | null {
  return (
    devices.find((item) => normalizeUdid(item.identifier) === normalizedUdid) ?? null
  )
}

function normalizeUdid(value: string): string {
  return value.trim().toUpperCase()
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
