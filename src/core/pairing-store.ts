export interface PairRecordEntry {
  udid: string
  data: string
}

export interface PairingStore {
  getSystemBuid(): Promise<string>
  getPairRecord(udid: string): Promise<PairRecordEntry | null>
  savePairRecord(record: PairRecordEntry): Promise<void>
  deletePairRecord(udid: string): Promise<void>
}

const BUID_KEY = "webmuxd:buid"
const PAIR_PREFIX = "webmuxd:pair:"

export class BrowserPairingStore implements PairingStore {
  private readonly inMemory = new Map<string, string>()

  getSystemBuid(): Promise<string> {
    const existing = this.get(BUID_KEY)
    if (existing) {
      return Promise.resolve(existing)
    }
    const created = this.generateBuid()
    this.set(BUID_KEY, created)
    return Promise.resolve(created)
  }

  getPairRecord(udid: string): Promise<PairRecordEntry | null> {
    const value = this.get(this.toPairKey(udid))
    if (!value) {
      return Promise.resolve(null)
    }
    return Promise.resolve({ udid, data: value })
  }

  savePairRecord(record: PairRecordEntry): Promise<void> {
    this.set(this.toPairKey(record.udid), record.data)
    return Promise.resolve()
  }

  deletePairRecord(udid: string): Promise<void> {
    this.remove(this.toPairKey(udid))
    return Promise.resolve()
  }

  private toPairKey(udid: string): string {
    return `${PAIR_PREFIX}${udid}`
  }

  private get(key: string): string | null {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key)
    }
    return this.inMemory.get(key) ?? null
  }

  private set(key: string, value: string): void {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value)
      return
    }
    this.inMemory.set(key, value)
  }

  private remove(key: string): void {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key)
      return
    }
    this.inMemory.delete(key)
  }

  private generateBuid(): string {
    const bytes = new Uint8Array(16)
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes)
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256)
      }
    }
    let out = ""
    for (const byte of bytes) {
      out += byte.toString(16).padStart(2, "0")
    }
    return out.toUpperCase()
  }
}
