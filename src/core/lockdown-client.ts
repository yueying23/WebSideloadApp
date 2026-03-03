import { UsbMuxSession } from "./usbmux-session"
import { PairingStore } from "./pairing-store"

export interface LockdownStartSessionResult {
  sessionId: string
}

export class LockdownClient {
  private readonly session: UsbMuxSession
  private readonly pairingStore: PairingStore

  constructor(session: UsbMuxSession, pairingStore: PairingStore) {
    this.session = session
    this.pairingStore = pairingStore
  }

  readBuid(): Promise<string> {
    return this.pairingStore.getSystemBuid()
  }

  startSession(_udid: string): Promise<LockdownStartSessionResult> {
    return Promise.reject(new Error("Lockdown startSession is not implemented yet"))
  }

  startService(_serviceName: string): Promise<number> {
    return Promise.reject(new Error("Lockdown startService is not implemented yet"))
  }
}
