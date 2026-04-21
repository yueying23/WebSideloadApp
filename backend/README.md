# Web Sideload App - Cloudflare Workers 后端

基于浏览器的 iOS IPA 签名和安装工具的生产级 Cloudflare Workers 后端。

## 🌐 语言 / Language

- [简体中文](README.md)
- [English](README_EN.md)

---

## 概述

此 Worker 提供两个关键服务：

1. **WISP 代理** (`/wisp/`) - WebSocket 到 TCP 的代理，使浏览器端的 libcurl 能够与 Apple 的 API 通信
2. **静态资源托管** - 直接从 Cloudflare 边缘网络提供 React 前端

## 架构

```
┌─────────────────────────────────────────────┐
│         Cloudflare Workers 边缘节点          │
│                                             │
│  ┌──────────────┐      ┌────────────────┐  │
│  │ WISP 代理    │      │ 静态资源       │  │
│  │ /wisp/       │◄────►│ /frontend/dist │  │
│  │ (WebSocket)  │      │ (SPA)          │  │
│  └──────┬───────┘      └───────┬────────┘  │
│         │                      │            │
│    TCP 连接 Apple API     提供给浏览器       │
└─────────┼────────────────────┼──────────────┘
          │                    │
     apple.com:443        用户浏览器
```

## 功能特性

### ✅ 已支持
- **WISP v2 协议** - 完整的 WebSocket 代理实现
- **Apple API 白名单** - 仅允许连接到经过验证的 Apple 域名
- **端口限制** - 强制仅使用 HTTPS（443 端口）
- **Token 认证** - 通过查询参数进行可选的访问控制
- **SPA 路由** - 自动回退到 index.html 以支持客户端路由
- **边缘缓存** - 静态资源从 Cloudflare 全球 CDN 提供
- **安全头** - 通过前端构建中的 nginx.conf 配置

### ❌ 不支持
- UDP 流（出于安全考虑已禁用）
- 旧版 wsproxy 路径（例如 `/wisp/example.com:443`）
- 直接 HTTP API 端点

## 快速开始

### 前置要求

- [Bun](https://bun.sh/) v1.3.11+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare 账户

### 安装

```bash
# 安装依赖
bun install

# 生成 TypeScript 类型
bun run types
```

### 本地开发

```bash
cd backend
bun run dev
```

在 `http://127.0.0.1:8787` 访问应用

开发服务器将：
1. 自动构建前端
2. 以本地模式启动 Wrangler
3. 监听文件更改

### 生产部署

#### 方案一：一键部署（推荐）

```bash
cd backend
bun run deploy
```

此命令将：
- 构建前端（`../frontend/dist`）
- 上传 Worker 代码到 Cloudflare
- 通过 Wrangler assets 绑定部署静态资源
- 激活新版本

**输出示例：**
```
Uploaded web-sideload-app (x.xx sec)
Deployed web-sideload-app triggers (x.xx sec)
  https://web-sideload-app.<your-subdomain>.workers.dev
```

⚠️ **重要安全提示**：
- 默认部署后，**任何人都可以访问你的 Worker**（无需 Token）
- 这可能导致**高额费用**和**安全风险**
- **强烈建议**在部署后立即配置 Token 认证（见下方"安全配置"部分）

#### 方案二：分步部署

```bash
# 步骤 1：手动构建前端
cd frontend
bun run build

# 步骤 2：预览部署（试运行）
cd ../backend
bun run check

# 步骤 3：部署
bun run deploy
```

在以下情况使用此方法：
- 调试构建问题
- 测试配置更改
- 分离前端/后端更新

## 安全配置

### 🔐 启用 Token 认证（强烈推荐）

通过要求 token 来防止未经授权的访问并控制成本。

#### 方法一：ACCESS_TOKEN_HASH（推荐）

```bash
# 生成 SHA-256 哈希
echo -n "your_secure_password" | sha256sum

# 设置为 Worker 密钥
wrangler secret put ACCESS_TOKEN_HASH
# 粘贴哈希值
```

#### 方法二：ACCESS_PASSWORD（更简单）

```bash
wrangler secret put ACCESS_PASSWORD
# 直接输入密码
```

### 前端配置

设置认证后，配置前端以包含 token：

#### 步骤 1：获取你的实际 Worker URL

部署后会显示类似这样的 URL：
```
https://web-sideload-app-abc123.workers.dev
```

#### 步骤 2：创建 `.env.production` 文件

```bash
cd frontend
```

创建 `frontend/.env.production`（**替换为你的实际值**）：

```env
# ⚠️ 必须替换以下两个占位符：
# 1. web-sideload-app-abc123.workers.dev → 你的实际 Worker URL
# 2. YOUR_PASSWORD → 你设置的 ACCESS_PASSWORD 值

VITE_WISP_URL=wss://web-sideload-app-abc123.workers.dev/wisp/?token=YOUR_PASSWORD
```

**示例：**
```env
# 假设你的 Worker URL 是：https://my-app-test.workers.dev
# 假设你设置的密码是：MySecretPass123

VITE_WISP_URL=wss://my-app-test.workers.dev/wisp/?token=MySecretPass123
```

#### 步骤 3：重新构建并部署

```bash
cd frontend
bun run build  # ← 这一步会将 VITE_WISP_URL 嵌入到构建产物中
cd ../backend
bun run deploy  # ← 部署包含新配置的前端
```

### 💡 重要说明

**`.env.production` 的作用：**
1. **构建时读取**：Vite 在 `bun run build` 时读取此文件
2. **代码替换**：将 `import.meta.env.VITE_WISP_URL` 替换为实际值
3. **永久嵌入**：Token 会被硬编码到构建后的 JS 文件中
4. **无需运行时配置**：部署后无法修改，需要重新构建

**为什么需要这样做？**
- 🔐 Token 必须在 WebSocket 连接时发送
- 📦 前端代码在浏览器运行，无法访问服务器环境变量
- 🏗️ 只能在构建时将 Token 嵌入代码

### 安全最佳实践

1. **使用强密码**：`openssl rand -base64 32`
2. **每月轮换令牌**：删除并重新创建密钥
3. **监控日志**：`wrangler tail web-sideload-app`
4. **设置采样率**：已在 wrangler.jsonc 中配置为 10%

## 监控与调试

### 实时日志

```bash
wrangler tail web-sideload-app
```

显示来自 Worker 的 console.log 输出和错误。

### 版本历史

```bash
# 列出所有版本
wrangler versions list

# 查看特定版本详情
wrangler versions view <version-id>

# 回滚到之前的版本
wrangler versions rollback <version-id>
```

### 健康检查

```bash
curl https://web-sideload-app.your-subdomain.workers.dev/healthz
```

预期响应：
```json
{
  "ok": true,
  "service": "web-sideload-app",
  "now": "2026-04-22T01:30:00.000Z"
}
```

### 分析仪表板

访问 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → web-sideload-app → Analytics

监控：
- 请求数量
- 错误率
- CPU 使用率
- 带宽消耗

## 配置参考

### wrangler.jsonc

```jsonc
{
  "name": "web-sideload-app",           // Worker 名称
  "main": "src/index.ts",                // 入口点
  "compatibility_date": "2026-03-03",    // 运行时兼容性
  
  "assets": {
    "directory": "../frontend/dist",     // 前端构建输出
    "binding": "ASSETS",                 // 可作为 env.ASSETS 访问
    "not_found_handling": "single-page-application"  // SPA 支持
  },
  
  "observability": {
    "enabled": true,                     // 启用日志
    "head_sampling_rate": 0.1            // 10% 采样（成本优化）
  }
}
```

### 环境变量

| 变量 | 类型 | 用途 |
|------|------|------|
| `ACCESS_TOKEN_HASH` | Secret | 用于认证的预计算 SHA-256 哈希 |
| `ACCESS_PASSWORD` | Secret | 明文密码（运行时自动哈希） |

**优先级**：`ACCESS_TOKEN_HASH` > `ACCESS_PASSWORD` > 无认证

## 故障排除

### 问题：401 Unauthorized

**原因**：Token 不匹配或缺少密钥

**解决方案**：
```bash
# 验证密钥是否已设置
wrangler secret list

# 检查前端 URL 是否包含正确的 token
# 打开浏览器开发者工具 → Network → WS
# 验证 WebSocket URL 包含 ?token=xxx
```

### 问题：前端 404 错误

**原因**：缺少或过时的 `frontend/dist` 目录

**解决方案**：
```bash
cd frontend
bun run build
ls dist/  # 验证 index.html 是否存在
cd ../backend
bun run deploy
```

### 问题：WebSocket 连接失败

**可能原因**：
1. Token 认证配置错误
2. CORS 问题
3. 防火墙阻止 WebSocket

**调试步骤**：
```bash
# 测试 WebSocket 连接
npm install -g wscat
wscat -c "wss://web-sideload-app.your-subdomain.workers.dev/wisp/?token=YOUR_TOKEN"

# 检查 Worker 日志
wrangler tail web-sideload-app
```

### 问题：高额费用

**原因**：过多请求或日志记录

**解决方案**：
1. 验证 wrangler.jsonc 中的 `head_sampling_rate: 0.1`
2. 启用 token 认证以防止滥用
3. 每周检查 Cloudflare Analytics 监控异常流量

## 成本优化

### 免费套餐限制
- ✅ 每天 100,000 次请求
- ✅ 每月 100,000 WebSocket 分钟
- ✅ 每次请求 100ms CPU 时间

### 个人使用
- 通常保持在免费套餐内
- 启用 token 认证以防止滥用

### 节省成本技巧
1. **减少日志记录**：已设置为 10% 采样
2. **启用缓存**：静态资源在边缘缓存
3. **监控使用情况**：每周检查 Cloudflare Analytics

## 高级配置

### 自定义域名

```bash
# 添加自定义域名路由
wrangler routes add web-sideload-app sideload.yourdomain.com/*

# 配置 DNS
# 添加指向以下的 CNAME 记录：
# web-sideload-app.your-subdomain.workers.dev
```

### 环境特定配置

添加到 wrangler.jsonc：
```json
{
  "vars": {
    "ENVIRONMENT": "production",
    "LOG_LEVEL": "info"
  }
}
```

在代码中访问：
```typescript
const env = process.env.ENVIRONMENT;
```

### 区域部署

在 wrangler.jsonc 中指定管辖区域：
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

## CI/CD 集成

### GitHub Actions 示例

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

## 迁移指南

### 从 webmuxd-wisp-demo 迁移

如果你已有现有部署：

```bash
# 1. 更新 wrangler.jsonc 名称字段（已完成）
# 2. 部署新版本
cd backend
bun run deploy

# 3. 旧部署保持活动状态直到被删除
# 4. 更新前端 VITE_WISP_URL 到新域名
# 5. 重新构建并部署
```

### 删除旧 Worker

```bash
wrangler delete webmuxd-wisp-demo
```

## 支持与资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 参考](https://developers.cloudflare.com/workers/wrangler/commands/)
- [WISP 协议规范](https://github.com/MercuryWorkshop/wisp-protocol)
- [项目 Issues](https://github.com/yueying23/sideimpactor/issues)

## 许可证

与主项目许可证相同。
