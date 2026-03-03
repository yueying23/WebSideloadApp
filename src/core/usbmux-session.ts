import {
  decodeHeader,
  encodeHeader,
  USBMUX_HEADER_SIZE,
  UsbMuxHeader,
  UsbMuxMessageType,
  UsbMuxPacket,
} from "./usbmux-protocol"
import { encodePlistXml, PlistValue } from "./plist"
import { UsbMuxTransport } from "./transport"

export interface UsbMuxPlistRequest {
  messageType: string
  payload?: Record<string, PlistValue>
}

const plistMessageTypeKey = "MessageType"
const USBMUX_MAX_PACKET_SIZE = 0x10000

export class UsbMuxSession {
  private readonly transport: UsbMuxTransport
  private tagCounter = 1
  private onPacketHandler: ((packet: UsbMuxPacket) => void) | null = null
  private started = false
  private readBuffer = new Uint8Array(0)

  constructor(transport: UsbMuxTransport) {
    this.transport = transport
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }
    this.transport.setDataHandler((data) => this.onRawData(data))
    await this.transport.open()
    this.started = true
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }
    await this.transport.close()
    this.started = false
    this.readBuffer = new Uint8Array(0)
  }

  onPacket(handler: ((packet: UsbMuxPacket) => void) | null): void {
    this.onPacketHandler = handler
  }

  async sendPlistRequest(request: UsbMuxPlistRequest): Promise<number> {
    const body = encodePlistXml({
      ...(request.payload ?? {}),
      [plistMessageTypeKey]: request.messageType,
    })
    const tag = this.nextTag()
    const header: UsbMuxHeader = {
      length: USBMUX_HEADER_SIZE + body.byteLength,
      version: 1,
      message: UsbMuxMessageType.plist,
      tag,
    }
    const headerBytes = new Uint8Array(encodeHeader(header))
    const packet = new Uint8Array(header.length)
    packet.set(headerBytes, 0)
    packet.set(body, USBMUX_HEADER_SIZE)
    await this.transport.send(packet.buffer)
    return tag
  }

  private onRawData(data: ArrayBuffer): void {
    const incoming = new Uint8Array(data)
    if (incoming.byteLength === 0) {
      return
    }
    this.readBuffer = appendBytes(this.readBuffer, incoming)
    this.drainReadBuffer()
  }

  private nextTag(): number {
    const current = this.tagCounter
    this.tagCounter += 1
    return current
  }

  private drainReadBuffer(): void {
    let offset = 0
    while (this.readBuffer.byteLength - offset >= USBMUX_HEADER_SIZE) {
      const headerChunk = this.readBuffer.subarray(
        offset,
        offset + USBMUX_HEADER_SIZE,
      )
      const headerBytes = headerChunk.buffer.slice(
        headerChunk.byteOffset,
        headerChunk.byteOffset + USBMUX_HEADER_SIZE,
      )
      const header = decodeHeader(headerBytes)
      if (
        header.length < USBMUX_HEADER_SIZE ||
        header.length > USBMUX_MAX_PACKET_SIZE
      ) {
        this.readBuffer = new Uint8Array(0)
        return
      }
      if (this.readBuffer.byteLength - offset < header.length) {
        break
      }
      const payloadStart = offset + USBMUX_HEADER_SIZE
      const payloadEnd = offset + header.length
      const payload = this.readBuffer.slice(payloadStart, payloadEnd)
      this.onPacketHandler?.({ header, payload: payload.buffer })
      offset = payloadEnd
    }
    if (offset === 0) {
      return
    }
    if (offset >= this.readBuffer.byteLength) {
      this.readBuffer = new Uint8Array(0)
      return
    }
    this.readBuffer = this.readBuffer.slice(offset)
  }
}

const appendBytes = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  if (left.byteLength === 0) {
    return right.slice()
  }
  const merged = new Uint8Array(left.byteLength + right.byteLength)
  merged.set(left, 0)
  merged.set(right, left.byteLength)
  return merged
}
