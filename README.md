# Web Sideload App - iOS 应用侧载工具

> **基于浏览器的 iOS IPA 签名和安装工具** — 通过网页即可完成设备配对、Apple Developer 账户签名和应用安装，无需安装任何桌面软件。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/bun-v1.3.11-black)](https://bun.sh/)
[![React](https://img.shields.io/badge/react-19.1.0-61dafb)](https://react.dev/)
[![Cloudflare Workers](https://img.shields.io/badge/cloudflare-workers-f38020)](https://workers.cloudflare.com/)

---

## 🌐 语言 / Language

- [简体中文](README.md)
- [English](README_EN.md)

---

## 📢 项目说明

### 项目来源

本项目是基于 **[Lakr233](https://github.com/Lakr233)** 的开源项目 [SideImpactor](https://github.com/Lakr233/SideImpactor) 进行的个人修改版本。

**🙏 特别致谢：**
- 原作者 **[@Lakr233](https://github.com/Lakr233)** 提供了优秀的基础架构和技术实现
- 感谢所有为原项目做出贡献的开发者和社区成员

### 修改说明

本分支由 **[@yueying23](https://github.com/yueying23)** 进行个性化定制和优化，主要改动包括：

- ✨ 优化部署流程和文档
- 🔧 改进配置管理
- 📝 完善中文文档支持
- 🚀 性能调优和成本优化

**注意：** 本项目仅供个人学习和使用，请遵守相关法律法规和 Apple 开发者协议。

---

## 🌟 核心功能

- 🔐 **设备配对** - 通过 WebUSB 直接连接 iOS 设备（无需桌面应用）
- ✍️ **IPA 签名** - 在浏览器中使用 Apple Developer 证书对 IPA 文件进行重签名
- 📱 **应用安装** - 将签名后的应用直接安装到已配对的 iOS 设备
- 🔒 **隐私优先** - 所有签名操作均在客户端完成，凭证永不离开浏览器
- 🌍 **跨平台** - 支持任何具备 WebUSB 功能的浏览器（Chrome/Edge）
- ⚡ **零安装** - 单个网页即可完成全部流程，无需复杂环境配置

## 🚀 快速开始

### 前置要求

- [Bun](https://bun.sh/) v1.3.11+
- 支持 WebUSB 的现代浏览器（推荐 Chrome/Edge）
- iOS 设备和 USB 数据线
- Apple Developer 账户（免费或付费均可）

### 本地开发

```bash
# 克隆并初始化
git clone https://github.com/yueying23/sideimpactor.git
cd sideimpactor
bun install --ignore-scripts

# 启动开发服务器
bun run dev
```

在浏览器中打开 [http://localhost:5173](http://localhost:5173)

## 📦 部署方案

根据你的需求选择合适的部署方式：

### 方案一：Cloudflare Workers（生产环境推荐）

**适用场景**：公开托管、团队共享、零运维成本

```bash
# 部署后端 + 前端到 Cloudflare 边缘网络
cd backend
bun run deploy
```

**优势**：
- ✅ 全球 CDN 自动缓存
- ✅ 免费额度：每天 10 万次请求
- ✅ 自动 HTTPS
- ✅ 无需服务器管理

**详细指南**：查看 backend 文档获取完整说明，包括：
- [简体中文](backend/README.md)
- [English](backend/README_EN.md)

包括：
- Token 认证配置
- 自定义域名设置
- 监控和分析

---

### 方案二：Docker 容器

**适用场景**：自托管、完全控制、隔离环境

```bash
# 先构建 WASM 模块
bun run build:wasm:dist

# 构建并运行 Docker 容器
docker build -t web-sideload-app .
docker run -d -p 3000:3000 --name sideload web-sideload-app
```

访问 [http://localhost:3000](http://localhost:3000)

**优势**：
- ✅ 完全数据自主权
- ✅ 初次加载后可离线使用
- ✅ 易于备份和迁移

---

### 方案三：静态托管 + 独立后端

**适用场景**：已有基础设施、混合部署

```bash
# 仅构建前端
cd frontend
bun run build

# 将 dist/ 部署到你选择的静态托管服务：
# - Vercel, Netlify, GitHub Pages
# - AWS S3 + CloudFront
# - 任意 nginx/Apache 服务器
```

**注意**：需要通过 `VITE_WISP_URL` 环境变量配置 WISP 代理 URL。

## 🏗️ 系统架构

```
┌──────────────────────────────────────────────────────┐
│                   用户浏览器                          │
│                                                       │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │   React UI  │  │  WebUSB  │  │  WASM 模块       │ │
│  │  (Vite SPA) │◄─┤ 客户端   │◄─┤ • zsign         │ │
│  └─────────────┘  └──────────┘  │ • openssl       │ │
│                                  │ • libcurl       │ │
│                                  └────────┬────────┘ │
└───────────────────────────────────────────┼──────────┘
                                            │
                                    WebSocket (WISP)
                                            │
┌───────────────────────────────────────────┼──────────┐
│            Cloudflare Workers             │          │
│                                           ▼          │
│                              ┌─────────────────────┐ │
│                              │   WISP 代理         │ │
│                              │  /wisp/ 端点        │ │
│                              └──────────┬──────────┘ │
└─────────────────────────────────────────┼────────────┘
                                          │ TCP
                                          ▼
                              ┌─────────────────────┐
                              │   Apple API         │
                              │ • auth.itunes...    │
                              │ • developerservices │
                              └─────────────────────┘
```

### 核心组件

| 组件 | 技术栈 | 用途 |
|------|--------|------|
| **前端** | React 19 + Vite + Tailwind | 用户界面和业务流程编排 |
| **WebUSB 层** | webmuxd 库 | iOS 设备通信（usbmux/lockdown 协议） |
| **签名引擎** | zsign-wasm | 浏览器内 IPA 重签名 |
| **加密模块** | openssl-wasm | 证书生成和 TLS 加密 |
| **HTTP 客户端** | libcurl-wasm | 通过 WISP 与 Apple API 通信 |
| **后端代理** | Cloudflare Workers | WebSocket 到 TCP 的桥梁 |
| **Anisette** | anisette-js | Apple 设备伪装头信息 |

## 📁 项目结构

```
sideimpactor/
├── frontend/                 # React 单页应用
│   ├── src/
│   │   ├── components/      # UI 组件
│   │   ├── flows/           # 业务流程（登录、签名、安装）
│   │   ├── wasm/            # WASM 模块绑定
│   │   └── lib/             # 工具函数和辅助库
│   └── public/              # 静态资源
│
├── backend/                  # Cloudflare Workers
│   ├── src/index.ts         # Worker 入口文件
│   └── wrangler.jsonc       # Worker 配置文件
│
├── dependencies/
│   └── webmuxd/             # WebUSB usbmux 协议实现
│
├── wasm/                     # WebAssembly 模块
│   ├── openssl/             # OpenSSL 加密操作
│   ├── libcurl-wasm/        # Apple API HTTP 客户端
│   └── zsign-wasm/          # IPA 签名引擎
│
├── scripts/                  # 构建自动化脚本
│   └── build-wasm-*.sh      # WASM 编译脚本
│
└── Dockerfile               # 容器构建配置
```

## 🔧 构建命令

### WASM 模块

```bash
# 复制预构建的 WASM 分发版（快速，无需编译器）
bun run build:wasm:dist

# 从源码完整重新编译（需要 Rust + Emscripten）
bun run build:wasm
```

### 前端

```bash
# 开发模式（热重载）
bun run dev

# 生产构建
bun run build:frontend
```

### 后端

```bash
# 本地测试
cd backend && bun run dev

# 部署到 Cloudflare
cd backend && bun run deploy
```

### 测试

```bash
# 运行所有测试
bun run test

# 仅前端测试
bun run test:frontend

# 监听模式
bun run test:watch
```

## 🔐 安全性

### 我们保护什么

✅ **Apple ID 凭证** - 仅存储在浏览器内存中，从不传输到我们的服务器  
✅ **签名证书** - 通过 openssl-wasm 在本地生成  
✅ **私钥** - 永不离开浏览器  
✅ **IPA 文件** - 完全在客户端处理  

### 安全特性

- **Token 认证** - Cloudflare Worker 的可选访问控制
- **强制 HTTPS** - WebUSB 和 Crypto API 要求安全上下文
- **CORS 隔离** - 跨源头信息防止嵌入攻击
- **内容安全** - 严格的 MIME 类型和安全头
- **无分析追踪** - 零跟踪或遥测

### 最佳实践

1. **生产环境始终使用 HTTPS**
2. **在 Cloudflare Worker 上启用 token 认证**（`ACCESS_TOKEN_HASH`）
3. **定期轮换**认证令牌
4. **监控 Worker 日志**以发现可疑活动
5. **保持依赖更新**（`bun update`）

## 🌐 浏览器兼容性

| 浏览器 | 版本 | WebUSB | 状态 |
|--------|------|--------|------|
| Chrome | 61+ | ✅ | 完全支持 |
| Edge | 79+ | ✅ | 完全支持 |
| Firefox | - | ❌ | 不支持 |
| Safari | - | ❌ | 不支持 |

**注意**：设备配对需要 WebUSB 支持。建议使用 Chrome 或 Edge 以获得最佳体验。

## 🐛 故障排除

### 设备未被检测到

1. 确保 USB 线支持数据传输（非仅充电线）
2. 解锁 iOS 设备并点击"信任此电脑"
3. 尝试不同的 USB 端口/线缆
4. 重启浏览器并在 `chrome://flags/#enable-experimental-web-platform-features` 中启用实验性功能

### 签名失败

1. 验证 Apple Developer 账户是否有效
2. 如提示，检查双重验证码
3. 确保设备 UDID 已在开发者门户注册
4. 查看浏览器控制台的错误信息

### 安装失败

1. 确认设备已正确配对
2. 检查 iOS 设备的可用存储空间
3. 验证 IPA 文件是否有效（尝试其他 IPA）
4. 确保描述文件包含设备 UDID

### Cloudflare 部署问题

查看 backend 文档获取详细解决方案：
- [简体中文](backend/README.md#故障排除)
- [English](backend/README_EN.md#troubleshooting)

## 📊 性能指标

- **首次加载**：约 2-3 MB（WASM 模块首次访问后会被缓存）
- **签名速度**：约 5-15 秒（取决于 IPA 大小）
- **安装时间**：约 30-60 秒（因应用大小和网络而异）

## 🤝 贡献指南

欢迎贡献！请遵循以下流程：

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feature/amazing-feature`）
3. 提交更改（`git commit -m '添加精彩功能'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 发起 Pull Request

### 开发工作流

```bash
# 安装依赖
bun install

# 提交前运行测试
bun run test

# 类型检查
cd frontend && bun run typecheck
cd backend && bun run types
```

## 📝 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

### 核心技术

- [libimobiledevice](https://github.com/libimobiledevice/libimobiledevice) - iOS 通信协议
- [webmuxd](https://github.com/hack-different/webmuxd) - WebUSB usbmux 实现
- [zsign](https://github.com/nicehash/zsign) - IPA 签名引擎
- [AltSign](https://github.com/rileytestut/AltSign/) - Apple API 客户端库
- [AltStore](https://github.com/altstoreio/AltStore) - 灵感和参考实现
- [openssl-wasm](https://github.com/nicehash/openssl-wasm) - WebAssembly OpenSSL
- [anisette-js](https://github.com/lbr77/anisette-js) - Apple 设备伪装
- [libcurl-wasm](https://github.com/lbr77/libcurl-wasm) - WebAssembly HTTP 客户端

### 特别感谢

- **[@Lakr233](https://github.com/Lakr233)** - 原项目作者，提供卓越的技术实现和架构设计
- 所有为原项目和生态做出贡献的开发者和测试者
- iOS 越狱和侧载社区的每一位成员

## 📞 支持与联系

- 📖 **文档**：
  - [简体中文](backend/README.md)
  - [English](backend/README_EN.md)
- 🐛 **问题反馈**：[GitHub Issues](https://github.com/yueying23/sideimpactor/issues)
- 💬 **讨论**：[GitHub Discussions](https://github.com/yueying23/sideimpactor/discussions)
- 👤 **作者**：[@yueying23](https://github.com/yueying23)

---