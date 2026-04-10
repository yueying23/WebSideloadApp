export const libcurl: {
  fetch(input: string | URL, init?: Record<string, unknown>): Promise<Response>
  load_wasm(url?: string): Promise<void>
  set_websocket(url: string): void
  readonly ready?: boolean
}
