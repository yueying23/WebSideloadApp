import { Anisette, loadWasmModule } from "@lbr77/anisette-js"
import { initLibcurl } from "./anisette-libcurl-init"
import { LibcurlHttpClient } from "./anisette-libcurl-http"

export interface AnisetteData {
  machineID: string
  oneTimePassword: string
  localUserID: string
  routingInfo: number
  deviceUniqueIdentifier: string
  deviceDescription: string
  deviceSerialNumber: string
  date: Date
  locale: string
  timeZone: string
}

let anisetteInstance: Anisette | null = null

export async function initAnisette(): Promise<Anisette> {
  if (anisetteInstance) {
    return anisetteInstance
  }

  await initLibcurl()
  const httpClient = new LibcurlHttpClient()

  const wasmModule = await loadWasmModule()
  const [storeservicescore, coreadi] = await Promise.all([
    fetch("/anisette/libstoreservicescore.so").then((response) => response.arrayBuffer()).then((arr) => new Uint8Array(arr)),
    fetch("/anisette/libCoreADI.so").then((response) => response.arrayBuffer()).then((arr) => new Uint8Array(arr)),
  ])

  anisetteInstance = await Anisette.fromSo(storeservicescore, coreadi, wasmModule, {
    httpClient,
    init: {
      libraryPath: "./anisette/",
    },
  })

  return anisetteInstance
}

export async function provisionAnisette(): Promise<void> {
  const anisette = await initAnisette()
  if (!anisette.isProvisioned) {
    await anisette.provision()
  }
}

export async function getAnisetteData(): Promise<AnisetteData> {
  const anisette = await initAnisette()

  if (!anisette.isProvisioned) {
    await anisette.provision()
  }

  const headers = await anisette.getData()

  return {
    machineID: headers["X-Apple-I-MD-M"],
    oneTimePassword: headers["X-Apple-I-MD"],
    localUserID: headers["X-Apple-I-MD-LU"],
    routingInfo: Number.parseInt(headers["X-Apple-I-MD-RINFO"], 10),
    deviceUniqueIdentifier: headers["X-Mme-Device-Id"],
    deviceDescription: headers["X-MMe-Client-Info"],
    deviceSerialNumber: headers["X-Apple-I-SRL-NO"] || "0",
    date: new Date(headers["X-Apple-I-Client-Time"]),
    locale: headers["X-Apple-Locale"],
    timeZone: headers["X-Apple-I-TimeZone"],
  }
}

export function clearAnisetteCache(): void {
  anisetteInstance = null
}
