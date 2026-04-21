# Web Sideload App - 快速参考卡

## 🚀 一键部署（3 步完成）

```bash
# 1. 登录 Cloudflare
wrangler login

# 2. （可选）设置访问令牌
echo -n "your_password" | sha256sum  # 生成哈希
wrangler secret put ACCESS_TOKEN_HASH  # 粘贴哈希值

# 3. 部署
cd backend && bun run deploy
```

**完成！** 访问 `https://web-sideload-app.your-subdomain.workers.dev`

---

## 🔑 常用命令速查

### 开发
```bash
bun run dev              # 本地开发服务器
wrangler dev             # 仅测试 Worker
wrangler tail            # 实时日志
```

### 部署
```bash
bun run deploy           # 生产部署
bun run check            # 预检（dry-run）
wrangler versions list   # 查看版本历史
```

### 监控
```bash
wrangler tail web-sideload-app          # 实时日志
curl https://.../healthz                # 健康检查
wrangler versions view <id>             # 版本详情
wrangler versions rollback <id>         # 回滚
```

---

## 🔐 安全配置

### 方法 1：ACCESS_TOKEN_HASH（推荐）
```bash
# Linux/Mac
echo -n "password" | sha256sum | wrangler secret put ACCESS_TOKEN_HASH

# Windows PowerShell
$hash = [BitConverter]::ToString([SHA256]::Create().ComputeHash(
  [Text.Encoding]::UTF8.GetBytes("password"))).Replace("-","").ToLower()
wrangler secret put ACCESS_TOKEN_HASH  # 粘贴 $hash
```

### 方法 2：ACCESS_PASSWORD（简单）
```bash
wrangler secret put ACCESS_PASSWORD
# 直接输入密码
```

### 前端配置
```env
# frontend/.env.production
VITE_WISP_URL=wss://web-sideload-app.xxx.workers.dev/wisp/?token=YOUR_PASSWORD
```

---

## 🐛 故障排除

| 问题 | 快速解决 |
|------|---------|
| 401 Unauthorized | 检查 token 是否正确 |
| 前端 404 | `cd frontend && bun run build && cd ../backend && bun run deploy` |
| WebSocket 失败 | `wrangler tail` 查看日志 |
| 部署失败 | `wrangler logout && wrangler login` |
| 费用过高 | 检查采样率应为 0.1 |

---

## 📊 关键配置

### wrangler.jsonc
```jsonc
{
  "name": "web-sideload-app",
  "compatibility_date": "2026-03-03",
  "observability": {
    "head_sampling_rate": 0.1  // 10% 采样，节省成本
  }
}
```

### 免费额度
- ✅ 100,000 请求/天
- ✅ 100,000 WebSocket 分钟/月
- ✅ 100ms CPU/请求

---

## 📁 重要文件

| 文件 | 用途 |
|------|------|
| `backend/wrangler.jsonc` | Worker 配置 |
| `backend/src/index.ts` | Worker 代码 |
| `frontend/.env.production` | 前端环境变量 |
| `DEPLOYMENT_CHECKLIST.md` | 详细部署指南 |
| `backend/README.md` | Backend 完整文档 |

---

## 🔗 有用链接

- Cloudflare Dashboard: https://dash.cloudflare.com/
- Wrangler 文档: https://developers.cloudflare.com/workers/wrangler/
- 项目 Issues: https://github.com/your-org/sideimpactor/issues

---

**提示：** 详细信息请查看 `DEPLOYMENT_CHECKLIST.md` 和 `backend/README.md`
