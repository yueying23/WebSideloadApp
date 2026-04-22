# Web Sideload App

> **Browser-based iOS IPA signing and installation** — pair devices, sign with Apple Developer accounts, and install apps entirely from your web browser.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/bun-v1.3.11-black)](https://bun.sh/)
[![React](https://img.shields.io/badge/react-19.1.0-61dafb)](https://react.dev/)
[![Cloudflare Workers](https://img.shields.io/badge/cloudflare-workers-f38020)](https://workers.cloudflare.com/)

## 🌐 Language / 语言

- [English](README_EN.md)
- [简体中文](README.md)

---

## 📢 Project Notice

### Origin

This project is a personal fork and modification of **[Lakr233](https://github.com/Lakr233)**'s open-source project [SideImpactor](https://github.com/Lakr233/SideImpactor).

**🙏 Special Thanks:**
- Original author **[@Lakr233](https://github.com/Lakr233)** for providing the excellent foundation and technical implementation
- All contributors and community members who contributed to the original project

### Modifications

This branch is customized and optimized by **[@yueying23](https://github.com/yueying23)** with the following improvements:

- ✨ Optimized deployment process and documentation
- 🔧 Improved configuration management
- 📝 Enhanced Chinese documentation support
- 🚀 Performance tuning and cost optimization

**Note:** This project is for personal learning and use only. Please comply with relevant laws, regulations, and Apple's Developer Agreement.

---

## 🌟 Features

- 🔐 **Device Pairing** - Connect iOS devices via WebUSB (no desktop app needed)
- ✍️ **IPA Signing** - Re-sign IPA files with your Apple Developer certificate in-browser
- 📱 **App Installation** - Install signed apps directly to paired devices
- 🔒 **Privacy-First** - All signing happens client-side; credentials never leave your browser
- 🌍 **Cross-Platform** - Works on any OS with a WebUSB-capable browser (Chrome/Edge)
- ⚡ **Zero Installation** - Single web page, no complex setup required

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.3.11+
- Modern browser with WebUSB support (Chrome/Edge recommended)
- iOS device with USB cable
- Apple Developer account (free or paid)

### Clone Repository

```bash
# Clone repository with submodules
git clone --recursive https://github.com/yueying23/sideimpactor.git
cd sideimpactor

# If you've already cloned without --recursive, initialize submodules:
git submodule update --init --recursive
```

**Note**: This project uses Git Submodules for WASM dependencies (`zsign-wasm`, `libcurl-wasm`, `openssl-wasm`). Make sure to initialize them before building.

### Local Development

```bash
# Install dependencies
bun install --ignore-scripts

# Start development server
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📦 Deployment Options

Choose the deployment method that fits your needs:

### Option 1: Cloudflare Workers (Recommended for Production)

**Best for**: Public hosting, team sharing, zero maintenance

```bash
# Deploy backend + frontend to Cloudflare edge network
cd backend
bun run deploy
```

**Benefits**:
- ✅ Global CDN with automatic caching
- ✅ Free tier: 100K requests/day
- ✅ Automatic HTTPS
- ✅ No server management

⚠️ **Security Warning**:
- By default, the Worker is accessible **without any token**
- This may lead to **unauthorized access and high costs**
- **Strongly recommended** to configure token authentication immediately after deployment (see [backend/README_EN.md](backend/README_EN.md#-enable-token-authentication-highly-recommended))

**💡 Pro Tip: Use Custom Domain to Avoid Double Deployment**

By default, Workers get a `*.workers.dev` domain, which causes:
1. Need to deploy first to get the domain
2. Then configure frontend with that domain
3. Deploy again to update frontend

**Solution**: Use a custom domain (e.g., `sideload.yourdomain.com`) that you determine before deployment!

Detailed guide: See [`CUSTOM_DOMAIN_GUIDE.md`](deploy-package/CUSTOM_DOMAIN_GUIDE.md)

**Setup Guide**: See backend documentation for detailed instructions:
- [English](backend/README_EN.md)
- [简体中文](backend/README.md)

Including:
- Token authentication setup
- Custom domain configuration
- Monitoring and analytics

---

### Option 2: Docker Container

**Best for**: Self-hosted, full control, air-gapped environments

#### Option A: Frontend Only (Lightweight)

```bash
# Build WASM modules first
bun run build:wasm:dist

# Build and run Docker container
docker build -t web-sideload-app .
docker run -d -p 3000:3000 --name sideload web-sideload-app
```

Access at [http://localhost:3000](http://localhost:3000)

**Features**:
- ✅ Lightweight (Nginx only)
- ❌ **No WISP proxy**, requires external backend
- ❌ Cannot perform device pairing and signing

---

#### Option B: Full Stack (Recommended, with Auth Support) ✨

Deploy frontend + WISP proxy using Docker Compose, with optional authentication.

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env to configure authentication (recommended)
# ACCESS_TOKEN_HASH=your_sha256_hash_here

# 3. Start full stack
docker compose --profile full up -d

# 4. View logs
docker compose logs -f full-stack
```

Access at [http://localhost:3000](http://localhost:3000)

**Benefits**:
- ✅ Complete functionality (frontend + WISP proxy)
- ✅ **Authentication support** (required for production)
- ✅ Easy management and updates
- ✅ Complete data sovereignty

**Detailed Documentation**: See [`DOCKER_DEPLOYMENT.md`](DOCKER_DEPLOYMENT.md)

---

### Option 3: Static Hosting + Separate Backend

**Best for**: Existing infrastructure, hybrid deployments

```bash
# Build frontend only
cd frontend
bun run build

# Deploy dist/ to your preferred static host:
# - Vercel, Netlify, GitHub Pages
# - AWS S3 + CloudFront
# - Any nginx/Apache server
```

**Note**: You'll need to configure the WISP proxy URL via `VITE_WISP_URL` environment variable.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                   User's Browser                      │
│                                                       │
│  ┌─────────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │   React UI  │  │  WebUSB  │  │  WASM Modules   │ │
│  │  (Vite SPA) │◄─┤ Client   │◄─┤ • zsign         │ │
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
│                              │   WISP Proxy        │ │
│                              │  /wisp/ endpoint    │ │
│                              └──────────┬──────────┘ │
└─────────────────────────────────────────┼────────────┘
                                          │ TCP
                                          ▼
                              ┌─────────────────────┐
                              │   Apple APIs        │
                              │ • auth.itunes...    │
                              │ • developerservices │
                              └─────────────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | React 19 + Vite + Tailwind | User interface and orchestration |
| **WebUSB Layer** | webmuxd library | iOS device communication (usbmux/lockdown) |
| **Signing Engine** | zsign-wasm | IPA re-signing in browser |
| **Crypto** | openssl-wasm | Certificate generation and TLS |
| **HTTP Client** | libcurl-wasm | Apple API communication via WISP |
| **Backend Proxy** | Cloudflare Workers | WebSocket-to-TCP bridge for Apple APIs |
| **Anisette** | anisette-js | Apple device impersonation headers |

## 📁 Project Structure

```
sideimpactor/
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── flows/           # Business logic (login, sign, install)
│   │   ├── wasm/            # WASM module bindings
│   │   └── lib/             # Utilities and helpers
│   └── public/              # Static assets
│
├── backend/                  # Cloudflare Workers
│   ├── src/index.ts         # Worker entry point
│   └── wrangler.jsonc       # Worker configuration
│
├── dependencies/
│   └── webmuxd/             # WebUSB usbmux protocol implementation
│
├── wasm/                     # WebAssembly modules
│   ├── openssl/             # OpenSSL for crypto operations
│   ├── libcurl-wasm/        # HTTP client for Apple APIs
│   └── zsign-wasm/          # IPA signing engine
│
├── scripts/                  # Build automation
│   └── build-wasm-*.sh      # WASM compilation scripts
│
└── Dockerfile               # Container build configuration
```

## 🔧 Build Commands

### WASM Modules

```bash
# Copy pre-built WASM distributions (fast, no compilers needed)
bun run build:wasm:dist

# Full recompilation from source (requires Rust + Emscripten)
bun run build:wasm
```

### Frontend

```bash
# Development with hot reload
bun run dev

# Production build
bun run build:frontend
```

### Backend

```bash
# Local testing
cd backend && bun run dev

# Deploy to Cloudflare
cd backend && bun run deploy
```

### Testing

```bash
# Run all tests
bun run test

# Frontend tests only
bun run test:frontend

# Watch mode
bun run test:watch
```

## 🔐 Security

### What We Protect

✅ **Apple ID Credentials** - Stored only in browser memory, never transmitted to our servers  
✅ **Signing Certificates** - Generated locally via openssl-wasm  
✅ **Private Keys** - Never leave the browser  
✅ **IPA Files** - Processed entirely client-side  

### Security Features

- **Token Authentication** - Optional access control for Cloudflare Worker
- **HTTPS Required** - WebUSB and Crypto APIs enforce secure context
- **CORS Isolation** - Cross-Origin headers prevent embedding attacks
- **Content Security** - Strict MIME types and security headers
- **No Analytics** - Zero tracking or telemetry

### Best Practices

1. **Always use HTTPS** in production
2. **Enable token auth** on Cloudflare Worker (`ACCESS_TOKEN_HASH`)
3. **Regularly rotate** authentication tokens
4. **Monitor Worker logs** for suspicious activity
5. **Keep dependencies updated** (`bun update`)

## 🌐 Browser Compatibility

| Browser | Version | WebUSB | Status |
|---------|---------|--------|--------|
| Chrome | 61+ | ✅ | Fully Supported |
| Edge | 79+ | ✅ | Fully Supported |
| Firefox | - | ❌ | Not Supported |
| Safari | - | ❌ | Not Supported |

**Note**: WebUSB is required for device pairing. Use Chrome or Edge for best experience.

## 🐛 Troubleshooting

### Device Not Detected

1. Ensure USB cable supports data transfer (not charging-only)
2. Unlock iOS device and tap "Trust This Computer"
3. Try different USB port/cable
4. Restart browser with `chrome://flags/#enable-experimental-web-platform-features` enabled

### Signing Fails

1. Verify Apple Developer account is active
2. Check 2FA code if prompted
3. Ensure device UDID is registered in developer portal
4. Review browser console for error messages

### Installation Fails

1. Confirm device is properly paired
2. Check available storage on iOS device
3. Verify IPA file is valid (try different IPA)
4. Ensure provisioning profile includes device UDID

### Cloudflare Deployment Issues

See backend documentation for detailed solutions:
- [English](backend/README_EN.md#troubleshooting)
- [简体中文](backend/README.md#故障排除)

## 📊 Performance

- **Initial Load**: ~2-3 MB (WASM modules cached after first visit)
- **Signing Speed**: ~5-15 seconds (depends on IPA size)
- **Installation**: ~30-60 seconds (varies by app size and network)

### Development Workflow

```bash
# Install dependencies
bun install

# Run tests before committing
bun run test

# Type checking
cd frontend && bun run typecheck
cd backend && bun run types
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

### Core Technologies

- [libimobiledevice](https://github.com/libimobiledevice/libimobiledevice) - iOS communication protocol
- [webmuxd](https://github.com/hack-different/webmuxd) - WebUSB usbmux implementation
- [zsign](https://github.com/nicehash/zsign) - IPA signing engine
- [AltSign](https://github.com/rileytestut/AltSign/) - Apple API client library
- [AltStore](https://github.com/altstoreio/AltStore) - Inspiration and reference implementation
- [openssl-wasm](https://github.com/nicehash/openssl-wasm) - WebAssembly OpenSSL
- [anisette-js](https://github.com/lbr77/anisette-js) - Apple device impersonation
- [libcurl-wasm](https://github.com/lbr77/libcurl-wasm) - WebAssembly HTTP client

### Special Thanks

- **[@Lakr233](https://github.com/Lakr233)** - Original project author, for excellent technical implementation and architecture design
- All contributors and testers who contributed to the original project and ecosystem
- Every member of the iOS jailbreak and sideloading community

## 📞 Support & Contact

- 📖 **Documentation**:
  - [English](backend/README_EN.md)
  - [简体中文](backend/README.md)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/yueying23/sideimpactor/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/yueying23/sideimpactor/discussions)
- 👤 **Author**: [@yueying23](https://github.com/yueying23)

---

<div align="center">

**Forked from [Lakr233/SideImpactor](https://github.com/Lakr233/SideImpactor)**

Made with ❤️ by [@yueying23](https://github.com/yueying23) for the iOS sideloading community

</div>
