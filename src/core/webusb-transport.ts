import { CONSOLE_LOGGER, Logger, NULL_LOGGER } from "../webmuxd"
import { DataHandler, DisconnectHandler, UsbMuxTransport } from "./transport"

const USBMUX_CLASS = 255
const USBMUX_SUBCLASS = 254
const USBMUX_PROTOCOL = 2

export interface WebUsbTransportOptions {
  logger?: Logger
  transferSize?: number
}

export class WebUsbTransport implements UsbMuxTransport {
  private readonly usbDevice: USBDevice
  private readonly transferSize: number
  private readonly logger: Logger
  private usbInterface: USBInterface | null = null
  private usbConfigurationValue: number | null = null
  private inputEndpoint: USBEndpoint | null = null
  private outputEndpoint: USBEndpoint | null = null
  private reading = false
  private closing = false
  private dataHandler: DataHandler | null = null
  private disconnectHandler: DisconnectHandler | null = null

  constructor(device: USBDevice, options?: WebUsbTransportOptions) {
    this.usbDevice = device
    this.transferSize = options?.transferSize ?? 16384
    this.logger = options?.logger ?? NULL_LOGGER
  }

  get isOpen(): boolean {
    return this.usbDevice.opened
  }

  static supported(): boolean {
    return "usb" in window.navigator
  }

  static async requestAppleDevice(
    logger: Logger = CONSOLE_LOGGER,
  ): Promise<WebUsbTransport> {
    const device = await navigator.usb.requestDevice({
      filters: [{ vendorId: 0x05ac }],
    })
    logger.log("info", `Selected device ${device.productName ?? "unknown"}`)
    return new WebUsbTransport(device, { logger })
  }

  setDataHandler(handler: DataHandler | null): void {
    this.dataHandler = handler
  }

  setDisconnectHandler(handler: DisconnectHandler | null): void {
    this.disconnectHandler = handler
  }

  async open(): Promise<void> {
    this.resolveInterface()
    if (!this.usbInterface) {
      throw new Error("No usbmux interface found")
    }

    if (!this.usbDevice.opened) {
      await this.usbDevice.open()
    }

    const selectedConfig = this.usbDevice.configuration?.configurationValue ?? null
    if (
      this.usbConfigurationValue !== null &&
      this.usbConfigurationValue !== selectedConfig
    ) {
      await this.usbDevice.selectConfiguration(this.usbConfigurationValue)
    }

    if (!this.usbInterface.claimed) {
      await this.usbDevice.claimInterface(this.usbInterface.interfaceNumber)
    }

    this.resolveEndpoints()
    if (!this.inputEndpoint || !this.outputEndpoint) {
      throw new Error("Failed to resolve usbmux endpoints")
    }

    this.reading = true
    this.closing = false
    this.readLoop()
  }

  async close(): Promise<void> {
    if (this.closing) {
      return
    }
    this.closing = true
    this.reading = false

    if (this.usbInterface?.claimed && this.usbDevice.opened) {
      await this.usbDevice.releaseInterface(this.usbInterface.interfaceNumber)
    }
    if (this.usbDevice.opened) {
      await this.usbDevice.close()
    }
  }

  async send(data: ArrayBuffer): Promise<void> {
    if (!this.outputEndpoint) {
      throw new Error("Output endpoint is not ready")
    }
    const result = await this.usbDevice.transferOut(
      this.outputEndpoint.endpointNumber,
      data,
    )
    if (result.status !== "ok") {
      throw new Error(`USB transferOut failed with status ${result.status}`)
    }
  }

  private resolveInterface(): void {
    for (const configuration of this.usbDevice.configurations) {
      for (const usbInterface of configuration.interfaces) {
        for (const alternate of usbInterface.alternates) {
          if (
            alternate.interfaceClass === USBMUX_CLASS &&
            alternate.interfaceSubclass === USBMUX_SUBCLASS &&
            alternate.interfaceProtocol === USBMUX_PROTOCOL
          ) {
            this.usbInterface = usbInterface
            this.usbConfigurationValue = configuration.configurationValue
            return
          }
        }
      }
    }
  }

  private resolveEndpoints(): void {
    if (!this.usbInterface) {
      return
    }
    for (const endpoint of this.usbInterface.alternates[0].endpoints) {
      if (endpoint.direction === "in") {
        this.inputEndpoint = endpoint
      } else if (endpoint.direction === "out") {
        this.outputEndpoint = endpoint
      }
    }
  }

  private readLoop(): void {
    if (!this.reading || this.closing || !this.inputEndpoint) {
      return
    }

    this.usbDevice
      .transferIn(this.inputEndpoint.endpointNumber, this.transferSize)
      .then((result) => {
        if (this.closing) {
          return
        }
        if (result.status === "ok" && result.data) {
          const bytes = new Uint8Array(
            result.data.buffer,
            result.data.byteOffset,
            result.data.byteLength,
          )
          this.dataHandler?.(bytes.slice().buffer)
        }
        this.readLoop()
      })
      .catch((error) => {
        this.logger.log("error", `USB read loop stopped: ${String(error)}`)
        this.disconnectHandler?.(error)
      })
  }
}
