export type DataHandler = (data: ArrayBuffer) => void
export type DisconnectHandler = (reason?: unknown) => void

export interface UsbMuxTransport {
  open(): Promise<void>
  close(): Promise<void>
  send(data: ArrayBuffer): Promise<void>
  setDataHandler(handler: DataHandler | null): void
  setDisconnectHandler(handler: DisconnectHandler | null): void
  readonly isOpen: boolean
}
