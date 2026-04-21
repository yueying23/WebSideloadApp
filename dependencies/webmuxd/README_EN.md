# WebMuxD

`webmuxd` is a WebUSB implementation of Apple's `usbmuxd` protocol, compatible with [libimobiledevice/usbmuxd](https://github.com/libimobiledevice/usbmuxd).

## 🌐 Language / 语言

- [English](README_EN.md)
- [简体中文](README.md)

---

## Usage

```ts
import { DirectUsbMuxClient, installIpaViaInstProxy } from "webmuxd"
```

This package includes:

- `DirectUsbMuxClient`: usbmux + lockdownd + AFC + installation_proxy lifecycle
- `installIpaViaInstProxy`: stage and install an IPA via AFC and InstProxy
- Pairing helpers: `createHostId`, `createSystemBuid`, pair record encode/decode helpers
- OpenSSL WASM helpers: `createOpenSslWasmTlsFactory`, `generatePairRecordWithOpenSslWasm`

## Build

From the workspace root:

```bash
bun run build
```

From this package directory:

```bash
bun run build
```
