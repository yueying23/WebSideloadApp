import type { HttpClient } from "@lbr77/anisette-js"
import { initLibcurl } from "./anisette-libcurl-init"
import { requireLibcurl } from "./wasm/libcurl"

export class LibcurlHttpClient implements HttpClient {
  async get(url: string, headers: Record<string, string>): Promise<Uint8Array> {
    await initLibcurl()
    const libcurl = requireLibcurl()

    const response = await libcurl.fetch(url, {
      method: "GET",
      headers,
      insecure: true,
      _libcurl_http_version: 1.1,
    })

    if (!response.ok) {
      throw new Error(`HTTP GET ${url} failed: ${response.status} ${response.statusText}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  }

  async post(url: string, body: string, headers: Record<string, string>): Promise<Uint8Array> {
    await initLibcurl()
    const libcurl = requireLibcurl()

    const response = await libcurl.fetch(url, {
      method: "POST",
      body,
      headers,
      insecure: true,
      _libcurl_http_version: 1.1,
    })

    if (!response.ok) {
      throw new Error(`HTTP POST ${url} failed: ${response.status} ${response.statusText}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  }
}
