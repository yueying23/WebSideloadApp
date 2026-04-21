# WebMuxD

`webmuxd` 是 Apple `usbmuxd` 协议的 WebUSB 实现，与 [libimobiledevice/usbmuxd](https://github.com/libimobiledevice/usbmuxd) 兼容。

## 🌐 语言 / Language

- [简体中文](README.md)
- [English](README_EN.md)

---

## 使用方法

```ts
import { DirectUsbMuxClient, installIpaViaInstProxy } from "webmuxd"
```

此包包含：

- `DirectUsbMuxClient`：usbmux + lockdownd + AFC + installation_proxy 生命周期管理
- `installIpaViaInstProxy`：通过 AFC 和 InstProxy 暂存并安装 IPA
- 配对辅助函数：`createHostId`、`createSystemBuid`、配对记录编码/解码辅助函数
- OpenSSL WASM 辅助函数：`createOpenSslWasmTlsFactory`、`generatePairRecordWithOpenSslWasm`

## 构建

从工作区根目录：

```bash
bun run build
```

从此包目录：

```bash
bun run build
```
