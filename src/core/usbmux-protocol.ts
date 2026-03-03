/* eslint-disable no-shadow */
export enum UsbMuxMessageType {
  result = 1,
  connect = 2,
  listen = 3,
  deviceAdd = 4,
  deviceRemove = 5,
  devicePaired = 6,
  plist = 8,
}

export interface UsbMuxHeader {
  length: number
  version: number
  message: UsbMuxMessageType
  tag: number
}

export interface UsbMuxPacket {
  header: UsbMuxHeader
  payload: ArrayBuffer
}

export const USBMUX_HEADER_SIZE = 16

export const encodeHeader = (header: UsbMuxHeader): ArrayBuffer => {
  const buffer = new ArrayBuffer(USBMUX_HEADER_SIZE)
  const view = new DataView(buffer)
  view.setUint32(0, header.length, true)
  view.setUint32(4, header.version, true)
  view.setUint32(8, header.message, true)
  view.setUint32(12, header.tag, true)
  return buffer
}

export const decodeHeader = (data: ArrayBuffer): UsbMuxHeader => {
  const view = new DataView(data)
  return {
    length: view.getUint32(0, true),
    version: view.getUint32(4, true),
    message: view.getUint32(8, true) as UsbMuxMessageType,
    tag: view.getUint32(12, true),
  }
}
