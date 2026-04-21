# Cloudflare Workers 部署检查清单

## 📋 部署前准备

### 1. 环境验证

```bash
# 确认 Bun 版本
bun --version
# 应输出: 1.3.11 或更高

# 确认 Wrangler 已安装
wrangler --version
# 如果未安装: bun install -g wrangler

# 登录 Cloudflare
wrangler login
# 浏览器会打开进行 OAuth 授权

# 验证当前账户
wrangler whoami
```

**预期输出示例：**
```
✅ Successfully logged in as your-email@example.com
Account ID: abc123def456...
```

---

### 2. 项目结构检查

```bash
# 确认关键文件存在
ls backend/src/index.ts
ls backend/wrangler.jsonc
ls frontend/package.json

# 确认依赖已安装
ls node_modules/@mercuryworkshop/wisp-js
```

---

## 🔐 安全配置（强烈推荐）

### 选项 A：使用 ACCESS_TOKEN_HASH（推荐）

#### 步骤 1：生成密码哈希

**Linux/Mac:**
```bash
echo -n "your_strong_password_here" | sha256sum
```

**Windows PowerShell:**
```powershell
$password = "your_strong_password_here"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($password)
$hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
$hexHash = -join ($hash | ForEach-Object { $_.ToString("x2") })
Write-Output $hexHash
```

**生成强密码（可选）:**
```bash
openssl rand -base64 32
# 输出类似: xK9mP2vL5nQ8wR3tY6uI0oA4sD7fG1hJ
```

#### 步骤 2：设置 Worker Secret

```bash
cd backend
wrangler secret put ACCESS_TOKEN_HASH
```

粘贴上一步生成的哈希值（64个字符的十六进制字符串）。

---

### 选项 B：使用 ACCESS_PASSWORD（简单）

```bash
cd backend
wrangler secret put ACCESS_PASSWORD
```

直接输入你想要的密码（会被自动哈希化）。

---

### 验证 Secret 设置

```bash
wrangler secret list
```

**预期输出：**
```
Secret               Type
ACCESS_TOKEN_HASH    secret
```

或

```
Secret               Type
ACCESS_PASSWORD      secret
```

---

## 🚀 部署执行

### 一键部署（推荐）

```bash
cd backend
bun run deploy
```

**这个命令会：**
1. ✅ 自动构建前端 (`cd ../frontend && bun run build`)
2. ✅ 上传 Worker 代码到 Cloudflare
3. ✅ 上传静态资源（`../frontend/dist`）
4. ✅ 激活新版本

**预期输出：**
```
Total Upload: xx.xx KiB / gzip: xx.xx KiB
Uploaded web-sideload-app (x.xx sec)
Deployed web-sideload-app triggers (x.xx sec)
  https://web-sideload-app.your-subdomain.workers.dev
```

**记录这个 URL！** 这是你的应用访问地址。

---

### 分步部署（调试用）

```bash
# 步骤 1：手动构建前端
cd frontend
bun run build

# 验证构建产物
ls dist/
# 应看到: index.html, assets/, anisette/

# 步骤 2：预检部署（不实际发布）
cd ../backend
bun run check

# 步骤 3：正式部署
bun run deploy
```

---

## ✅ 部署后验证

### 1. 健康检查

```bash
curl https://web-sideload-app.your-subdomain.workers.dev/healthz
```

**预期响应：**
```json
{
  "ok": true,
  "service": "web-sideload-app",
  "now": "2026-04-22T01:30:00.000Z"
}
```

---

### 2. 前端页面测试

在浏览器中访问：
```
https://web-sideload-app.your-subdomain.workers.dev
```

**应该看到：**
- ✅ SideImpactor 登录页面
- ✅ 无 404 错误
- ✅ 控制台无红色错误

**打开开发者工具检查：**
```
F12 → Console → 应无错误
F12 → Network → 所有资源加载成功（状态码 200）
```

---

### 3. WebSocket 连接测试

**无认证时：**
```bash
npm install -g wscat
wscat -c wss://web-sideload-app.your-subdomain.workers.dev/wisp/
```

**有认证时：**
```bash
wscat -c "wss://web-sideload-app.your-subdomain.workers.dev/wisp/?token=YOUR_PASSWORD"
```

**预期结果：**
- ✅ WebSocket 连接建立
- ✅ 显示 `Connected (press CTRL+C to quit)`

---

### 4. 查看实时日志

```bash
wrangler tail web-sideload-app
```

保持这个终端窗口打开，然后在浏览器中操作应用，观察日志输出。

**预期看到：**
```
GET /healthz - 200 OK
WS /wisp/ - Connection established
```

按 `Ctrl+C` 停止日志跟踪。

---

## 🔧 前端配置（如果使用认证）

### 创建环境变量文件

创建 `frontend/.env.production`：

```env
VITE_WISP_URL=wss://web-sideload-app.your-subdomain.workers.dev/wisp/?token=YOUR_PASSWORD
```

**注意：** 
- 替换 `your-subdomain` 为你的实际子域名
- 替换 `YOUR_PASSWORD` 为你设置的密码（不是哈希值）

### 重新构建并部署

```bash
cd frontend
bun run build

cd ../backend
bun run deploy
```

---

## 📊 监控与维护

### 查看分析数据

访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)：

1. 选择 **Workers & Pages**
2. 点击 **web-sideload-app**
3. 点击 **Analytics** 标签

**关键指标：**
- 📈 Requests（请求数）
- ⚠️ Errors（错误率）
- 💻 CPU Time（CPU 使用时间）
- 📡 Bandwidth（带宽使用）

---

### 版本管理

```bash
# 查看所有版本
wrangler versions list

# 查看特定版本详情
wrangler versions view <version-id>

# 回滚到之前的版本
wrangler versions rollback <version-id>
```

---

### 定期维护任务

**每周：**
- [ ] 检查 Analytics 面板，确认无异常流量
- [ ] 查看错误日志：`wrangler tail web-sideload-app`

**每月：**
- [ ] 轮换认证令牌（如果使用）
- [ ] 更新依赖：`bun update`
- [ ] 检查 Cloudflare 账单（确保在免费额度内）

---

## 🐛 常见问题解决

### 问题 1：部署失败 - "No account found"

**原因：** 未登录或登录过期

**解决：**
```bash
wrangler logout
wrangler login
wrangler whoami  # 确认登录成功
bun run deploy   # 重试部署
```

---

### 问题 2：前端资源 404

**症状：** 访问网站显示空白页或 404 错误

**原因：** `frontend/dist` 目录不存在或为空

**解决：**
```bash
cd frontend
bun run build
ls dist/  # 确认有 index.html

cd ../backend
bun run deploy  # 重新部署
```

---

### 问题 3：401 Unauthorized

**症状：** WebSocket 连接被拒绝

**原因：** Token 不匹配或未设置 Secret

**排查步骤：**

```bash
# 1. 检查 Secret 是否设置
wrangler secret list

# 2. 如果是 ACCESS_PASSWORD，确认密码正确
# 3. 如果是 ACCESS_TOKEN_HASH，确认哈希值正确

# 4. 检查前端 URL 中的 token 参数
# 打开浏览器 DevTools → Network → WS
# 查看 WebSocket URL 是否包含正确的 ?token=xxx
```

**快速修复（临时禁用认证测试）：**
```bash
wrangler secret delete ACCESS_TOKEN_HASH
wrangler secret delete ACCESS_PASSWORD
bun run deploy
```

---

### 问题 4：WebSocket 连接超时

**可能原因：**
1. 防火墙阻止 WebSocket
2. WISP 白名单配置问题
3. Apple API 不可达

**排查：**
```bash
# 1. 检查 Worker 日志
wrangler tail web-sideload-app

# 2. 测试网络连接
curl -I https://auth.itunes.apple.com

# 3. 验证 wrangler.jsonc 配置
cat backend/wrangler.jsonc
```

---

### 问题 5：费用超出预期

**原因：** 大量请求或日志采样率过高

**解决：**

1. **降低日志采样率**（已在 wrangler.jsonc 中设置为 0.1）
2. **启用 Token 认证**防止滥用
3. **检查 Analytics** 识别异常流量

```bash
# 查看当前配置
cat backend/wrangler.jsonc | grep head_sampling_rate
# 应显示: "head_sampling_rate": 0.1
```

---

## 🎯 部署成功标志

完成以下所有检查即表示部署成功：

- [ ] ✅ `wrangler whoami` 显示正确的账户
- [ ] ✅ `bun run deploy` 成功执行无错误
- [ ] ✅ 健康检查返回 JSON 响应
- [ ] ✅ 浏览器可以访问前端页面
- [ ] ✅ WebSocket 连接测试通过
- [ ] ✅ `wrangler tail` 显示正常日志
- [ ] ✅ Cloudflare Analytics 显示请求数据
- [ ] ✅ （可选）Token 认证正常工作

---

## 📞 获取帮助

如果遇到问题：

1. **查看完整文档：** [backend/README.md](backend/README.md)
2. **检查 GitHub Issues：** https://github.com/your-org/sideimpactor/issues
3. **查看 Cloudflare 文档：** https://developers.cloudflare.com/workers/

---

**最后更新：** 2026-04-22  
**适用版本：** web-sideload-app v1.0+
