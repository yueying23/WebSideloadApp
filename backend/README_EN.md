# Web Sideload App - Cloudflare Workers Backend

Production-ready Cloudflare Workers backend for browser-based iOS IPA signing and installation.

## 🌐 Language / 语言

- [English](README_EN.md)
- [简体中文](README.md)

---

## Overview

This Worker provides two critical services:

1. **WISP Proxy** (`/wisp/`) - WebSocket-to-TCP proxy that enables browser-side libcurl to communicate with Apple's APIs
2. **Static Asset Hosting** - Serves the React frontend directly from Cloudflare's edge network

## Architecture

```
┌─────────────────────────────────────────────┐
│         Cloudflare Workers Edge             │
│                                             │
│  ┌──────────────┐      ┌────────────────┐  │
│  │ WISP Proxy   │      │ Static Assets  │  │
│  │ /wisp/       │◄────►│ /frontend/dist │  │
│  │ (WebSocket)  │      │ (SPA)          │  │
│  └──────┬───────┘      └───────┬────────┘  │
│         │                      │            │
│    TCP to Apple API      Serve to Browser   │
└─────────┼────────────────────┼──────────────┘
          │                    │
     apple.com:443        User's Browser
```

## Features

### ✅ Supported
- **WISP v2 Protocol** - Full WebSocket proxy implementation
- **Apple API Whitelist** - Only allows connections to verified Apple domains
- **Port Restriction** - Enforces HTTPS-only (port 443)
- **Token Authentication** - Optional access control via query parameter
- **SPA Routing** - Automatic fallback to index.html for client-side routing
- **Edge Caching** - Static assets served from Cloudflare's global CDN
- **Security Headers** - Configured via nginx.conf in frontend build

### ❌ Not Supported
- UDP streams (disabled for security)
- Legacy wsproxy paths (e.g., `/wisp/example.com:443`)
- Direct HTTP API endpoints

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.3.11+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account

### Installation

```bash
# Install dependencies
bun install

# Generate TypeScript types
bun run types
```

### Local Development

```bash
cd backend
bun run dev
```

Access the app at `http://127.0.0.1:8787`

The dev server will:
1. Build the frontend automatically
2. Start Wrangler in local mode
3. Watch for file changes

### Production Deployment

#### Option 1: One-Click Deploy (Recommended)

```bash
cd backend
bun run deploy
```

This command:
- Builds the frontend (`../frontend/dist`)
- Uploads Worker code to Cloudflare
- Deploys static assets via Wrangler assets binding
- Activates the new version

**Output:**
```
Uploaded web-sideload-app (x.xx sec)
Deployed web-sideload-app triggers (x.xx sec)
  https://web-sideload-app.<your-subdomain>.workers.dev
```

⚠️ **Important Security Notice**:
- By default, **anyone can access your Worker** (no token required)
- This may lead to **high costs** and **security risks**
- **Strongly recommended** to configure token authentication immediately after deployment (see "Security Configuration" section below)

#### Option 2: Step-by-Step Deploy

```bash
# Step 1: Build frontend manually
cd frontend
bun run build

# Step 2: Preview deployment (dry-run)
cd ../backend
bun run check

# Step 3: Deploy
bun run deploy
```

Use this approach when:
- Debugging build issues
- Testing configuration changes
- Separating frontend/backend updates

## Security Configuration

### 🔐 Enable Token Authentication (Highly Recommended)

Prevent unauthorized access and control costs by requiring a token.

#### Method 1: ACCESS_TOKEN_HASH (Recommended)

```bash
# Generate SHA-256 hash
echo -n "your_secure_password" | sha256sum

# Set as Worker secret
wrangler secret put ACCESS_TOKEN_HASH
# Paste the hash value
```

#### Method 2: ACCESS_PASSWORD (Simpler)

```bash
wrangler secret put ACCESS_PASSWORD
# Enter your password directly
```

### Frontend Configuration

After setting up authentication, configure the frontend to include the token:

#### Step 1: Get Your Actual Worker URL

After deployment, you'll see a URL like:
```
https://web-sideload-app-abc123.workers.dev
```

#### Step 2: Create `.env.production` File

```bash
cd frontend
```

Create `frontend/.env.production` (**replace with your actual values**):

```env
# ⚠️ You MUST replace both placeholders:
# 1. web-sideload-app-abc123.workers.dev → Your actual Worker URL
# 2. YOUR_PASSWORD → The ACCESS_PASSWORD value you set

VITE_WISP_URL=wss://web-sideload-app-abc123.workers.dev/wisp/?token=YOUR_PASSWORD
```

**Example:**
```env
# If your Worker URL is: https://my-app-test.workers.dev
# If your password is: MySecretPass123

VITE_WISP_URL=wss://my-app-test.workers.dev/wisp/?token=MySecretPass123
```

#### Step 3: Rebuild and Redeploy

```bash
cd frontend
bun run build  # ← This embeds VITE_WISP_URL into the build output
cd ../backend
bun run deploy  # ← Deploy the frontend with new configuration
```

### 💡 Important Notes

**What `.env.production` does:**
1. **Read at build time**: Vite reads this file during `bun run build`
2. **Code replacement**: Replaces `import.meta.env.VITE_WISP_URL` with actual value
3. **Permanently embedded**: Token is hardcoded into the built JS files
4. **No runtime config**: Cannot be changed after deployment without rebuilding

**Why is this necessary?**
- 🔐 Token must be sent when establishing WebSocket connection
- 📦 Frontend runs in browser, cannot access server environment variables
- 🏗️ Token can only be embedded during build time

### Security Best Practices

1. **Use strong passwords**: `openssl rand -base64 32`
2. **Rotate tokens monthly**: Delete and recreate secrets
3. **Monitor logs**: `wrangler tail web-sideload-app`
4. **Set sampling rate**: Already configured to 10% in wrangler.jsonc

## Monitoring & Debugging

### Real-time Logs

```bash
wrangler tail web-sideload-app
```

Shows console.log output and errors from the Worker.

### Version History

```bash
# List all versions
wrangler versions list

# View specific version details
wrangler versions view <version-id>

# Rollback to previous version
wrangler versions rollback <version-id>
```

### Health Check

```bash
curl https://web-sideload-app.your-subdomain.workers.dev/healthz
```

Expected response:
```json
{
  "ok": true,
  "service": "web-sideload-app",
  "now": "2026-04-22T01:30:00.000Z"
}
```

### Analytics Dashboard

Visit [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → web-sideload-app → Analytics

Monitor:
- Request count
- Error rate
- CPU usage
- Bandwidth consumption

## Configuration Reference

### wrangler.jsonc

```jsonc
{
  "name": "web-sideload-app",           // Worker name
  "main": "src/index.ts",                // Entry point
  "compatibility_date": "2026-03-03",    // Runtime compatibility
  
  "assets": {
    "directory": "../frontend/dist",     // Frontend build output
    "binding": "ASSETS",                 // Accessible as env.ASSETS
    "not_found_handling": "single-page-application"  // SPA support
  },
  
  "observability": {
    "enabled": true,                     // Enable logging
    "head_sampling_rate": 0.1            // 10% sampling (cost optimization)
  }
}
```

### Environment Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `ACCESS_TOKEN_HASH` | Secret | Pre-computed SHA-256 hash for auth |
| `ACCESS_PASSWORD` | Secret | Plain password (auto-hashed at runtime) |

**Priority**: `ACCESS_TOKEN_HASH` > `ACCESS_PASSWORD` > No auth

## Troubleshooting

### Issue: 401 Unauthorized

**Cause**: Token mismatch or missing secret

**Solution**:
```bash
# Verify secrets are set
wrangler secret list

# Check frontend URL includes correct token
# Open browser DevTools → Network → WS
# Verify WebSocket URL has ?token=xxx
```

### Issue: Frontend 404 Errors

**Cause**: Missing or outdated `frontend/dist` directory

**Solution**:
```bash
cd frontend
bun run build
ls dist/  # Verify index.html exists
cd ../backend
bun run deploy
```

### Issue: WebSocket Connection Fails

**Possible causes**:
1. Token authentication misconfigured
2. CORS issues
3. Firewall blocking WebSocket

**Debug steps**:
```bash
# Test WebSocket connection
npm install -g wscat
wscat -c "wss://web-sideload-app.your-subdomain.workers.dev/wisp/?token=YOUR_TOKEN"

# Check Worker logs
wrangler tail web-sideload-app
```

### Issue: High Costs

**Cause**: Excessive requests or logging

**Solution**:
1. Verify `head_sampling_rate: 0.1` in wrangler.jsonc
2. Enable token authentication to prevent abuse
3. Monitor analytics dashboard for unusual traffic

## Cost Optimization

### Free Tier Limits
- ✅ 100,000 requests/day
- ✅ 100,000 WebSocket minutes/month
- ✅ 100ms CPU time/request

### For Personal Use
- Typically stays within free tier
- Enable token auth to prevent abuse

### Cost-Saving Tips
1. **Reduce logging**: Already set to 10% sampling
2. **Enable caching**: Static assets cached at edge
3. **Monitor usage**: Check Cloudflare Analytics weekly

## Advanced Configuration

### Custom Domain

```bash
# Add custom domain route
wrangler routes add web-sideload-app sideload.yourdomain.com/*

# Configure DNS
# Add CNAME record pointing to:
# web-sideload-app.your-subdomain.workers.dev
```

### Environment-Specific Config

Add to wrangler.jsonc:
```json
{
  "vars": {
    "ENVIRONMENT": "production",
    "LOG_LEVEL": "info"
  }
}
```

Access in code:
```typescript
const env = process.env.ENVIRONMENT;
```

### Regional Deployment

Specify jurisdiction in wrangler.jsonc:
```json
{
  "durable_objects": {
    "bindings": [{
      "name": "MY_DO",
      "class_name": "MyDO",
      "jurisdiction": "eu"
    }]
  }
}
```

## CI/CD Integration

### GitHub Actions Example

```
name: Deploy Worker
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.3.11
      
      - name: Install dependencies
        run: bun install
      
      - name: Deploy to Cloudflare
        run: cd backend && bun run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
```

## Migration Guide

### From webmuxd-wisp-demo

If you have an existing deployment:

```bash
# 1. Update wrangler.jsonc name field (already done)
# 2. Deploy new version
cd backend
bun run deploy

# 3. Old deployment remains active until deleted
# 4. Update frontend VITE_WISP_URL to new domain
# 5. Rebuild and redeploy
```

### Deleting Old Worker

```bash
wrangler delete webmuxd-wisp-demo
```

## Support & Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/commands/)
- [WISP Protocol Spec](https://github.com/MercuryWorkshop/wisp-protocol)
- [Project Issues](https://github.com/your-org/sideimpactor/issues)

## License

Same as main project license.
