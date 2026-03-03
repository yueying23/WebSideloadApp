import { AfcClient } from "./afc-client"
import { LockdownClient } from "./lockdown-client"
import { BrowserPairingStore, PairingStore } from "./pairing-store"
import { UsbMuxSession } from "./usbmux-session"
import { UsbMuxTransport } from "./transport"

export interface BrowserUsbMuxClientOptions {
  pairingStore?: PairingStore
}

export class BrowserUsbMuxClient {
  readonly session: UsbMuxSession
  readonly lockdown: LockdownClient
  readonly afc: AfcClient
  readonly pairingStore: PairingStore

  constructor(
    transport: UsbMuxTransport,
    options: BrowserUsbMuxClientOptions = {},
  ) {
    this.pairingStore = options.pairingStore ?? new BrowserPairingStore()
    this.session = new UsbMuxSession(transport)
    this.lockdown = new LockdownClient(this.session, this.pairingStore)
    this.afc = new AfcClient(this.lockdown)
  }

  async start(): Promise<void> {
    await this.session.start()
  }

  async stop(): Promise<void> {
    await this.session.stop()
  }

  async listDevices(): Promise<number> {
    return await this.session.sendPlistRequest({ messageType: "ListDevices" })
  }

  async connect(deviceId: number, port: number): Promise<number> {
    const deviceIdKey = "DeviceID"
    const portNumberKey = "PortNumber"
    return await this.session.sendPlistRequest({
      messageType: "Connect",
      payload: {
        [deviceIdKey]: deviceId,
        [portNumberKey]: toNetworkByteOrderPort(port),
      },
    })
  }
}

const toNetworkByteOrderPort = (port: number): number => {
  if (!Number.isInteger(port) || port < 0 || port > 0xffff) {
    throw new RangeError(`Invalid port number: ${String(port)}`)
  }
  const buffer = new ArrayBuffer(2)
  const view = new DataView(buffer)
  view.setUint16(0, port, true)
  return view.getUint16(0, false)
}
