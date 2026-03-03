import { BrowserUsbMuxClient } from "../core/browser-usbmux-client"
import {
  decodeHeader,
  encodeHeader,
  USBMUX_HEADER_SIZE,
  UsbMuxMessageType,
} from "../core/usbmux-protocol"
import { UsbMuxSession } from "../core/usbmux-session"
import { DataHandler, DisconnectHandler, UsbMuxTransport } from "../core/transport"

class MockTransport implements UsbMuxTransport {
  isOpen = false
  dataHandler: DataHandler | null = null
  disconnectHandler: DisconnectHandler | null = null
  sent: ArrayBuffer[] = []

  async open(): Promise<void> {
    this.isOpen = true
  }

  async close(): Promise<void> {
    this.isOpen = false
  }

  async send(data: ArrayBuffer): Promise<void> {
    this.sent.push(new Uint8Array(data).slice().buffer)
  }

  setDataHandler(handler: DataHandler | null): void {
    this.dataHandler = handler
  }

  setDisconnectHandler(handler: DisconnectHandler | null): void {
    this.disconnectHandler = handler
  }

  emit(data: Uint8Array): void {
    this.dataHandler?.(data.slice().buffer)
  }
}

const buildPacket = (tag: number, payloadText: string): Uint8Array => {
  const payload = new Uint8Array(Buffer.from(payloadText, "utf8"))
  const header = encodeHeader({
    length: USBMUX_HEADER_SIZE + payload.byteLength,
    version: 1,
    message: UsbMuxMessageType.plist,
    tag,
  })
  const packet = new Uint8Array(USBMUX_HEADER_SIZE + payload.byteLength)
  packet.set(new Uint8Array(header), 0)
  packet.set(payload, USBMUX_HEADER_SIZE)
  return packet
}

test("UsbMuxSession handles fragmented packet", async () => {
  const transport = new MockTransport()
  const session = new UsbMuxSession(transport)
  const packets: Array<{ tag: number; payload: string }> = []
  session.onPacket((packet) => {
    packets.push({
      tag: packet.header.tag,
      payload: Buffer.from(packet.payload).toString("utf8"),
    })
  })

  await session.start()
  const packet = buildPacket(7, "first")
  transport.emit(packet.slice(0, 9))
  expect(packets).toHaveLength(0)

  transport.emit(packet.slice(9))
  expect(packets).toEqual([{ tag: 7, payload: "first" }])
})

test("UsbMuxSession handles multiple packets in one read", async () => {
  const transport = new MockTransport()
  const session = new UsbMuxSession(transport)
  const tags: number[] = []
  session.onPacket((packet) => tags.push(packet.header.tag))

  await session.start()
  const first = buildPacket(1, "a")
  const second = buildPacket(2, "b")
  const merged = new Uint8Array(first.byteLength + second.byteLength)
  merged.set(first, 0)
  merged.set(second, first.byteLength)

  transport.emit(merged)
  expect(tags).toEqual([1, 2])
})

test("UsbMuxSession drops invalid header length and continues on next read", async () => {
  const transport = new MockTransport()
  const session = new UsbMuxSession(transport)
  const tags: number[] = []
  session.onPacket((packet) => tags.push(packet.header.tag))

  await session.start()
  const invalid = new Uint8Array(
    encodeHeader({
      length: 8,
      version: 1,
      message: UsbMuxMessageType.plist,
      tag: 99,
    }),
  )
  transport.emit(invalid)
  expect(tags).toEqual([])

  transport.emit(buildPacket(3, "ok"))
  expect(tags).toEqual([3])
})

test("BrowserUsbMuxClient connect sends network-byte-order port", async () => {
  const transport = new MockTransport()
  const client = new BrowserUsbMuxClient(transport)

  await client.start()
  await client.connect(42, 62078)

  expect(transport.sent).toHaveLength(1)
  const sent = transport.sent[0]
  const header = decodeHeader(sent.slice(0, USBMUX_HEADER_SIZE))
  expect(header.message).toBe(UsbMuxMessageType.plist)

  const payload = Buffer.from(sent.slice(USBMUX_HEADER_SIZE)).toString("utf8")
  expect(payload).toContain("<key>DeviceID</key><integer>42</integer>")
  expect(payload).toContain("<key>PortNumber</key><integer>32498</integer>")
  expect(payload).toContain("<key>MessageType</key><string>Connect</string>")
})
