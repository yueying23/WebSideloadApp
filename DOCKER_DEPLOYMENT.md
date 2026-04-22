# Docker 部署指南

## 📋 概述

本项目提供两种 Docker 部署模式：

| 模式 | 说明 | 认证支持 | 适用场景 |
|------|------|---------|---------|
| **仅前端** | 使用 Nginx 托管静态资源 | ❌ 不支持 | 配合外部 WISP 后端 |
| **完整栈** | 前端 + WISP 代理（Bun 运行时） | ✅ 支持 | 独立部署，推荐 |

---

## 🚀 快速开始

### 方式一：仅前端部署（无认证）

适用于已有独立的 WISP 后端服务。

```bash
# 构建并启动
docker compose --profile frontend up -d

# 访问
open http://localhost:3000
```

**特点**:
- ✅ 轻量级（仅 Nginx）
- ❌ 无 WISP 代理功能
- ❌ 无法进行设备配对和签名

---

### 方式二：完整栈部署（推荐）✨

包含前端和 WISP 代理，支持可选的认证功能。

#### 2.1 无认证部署（仅用于开发测试）

```bash
# 启动完整栈（无认证）
docker compose --profile full up -d

# 查看日志
docker compose logs -f full-stack
```

⚠️ **警告**: 此模式任何人都可以访问您的 WISP 后端，**不推荐用于生产环境**！

#### 2.2 密码认证部署（简单）

```bash
# 方法 A: 通过环境变量
ACCESS_PASSWORD=mysecretpassword docker compose --profile full up -d

# 方法 B: 使用 .env 文件
cp .env.example .env
# 编辑 .env，设置 ACCESS_PASSWORD=your_password
docker compose --profile full up -d
```

**前端配置**:
```env
# frontend/.env.production
VITE_WISP_URL=wss://your-domain.com/wisp/?token=mysecretpassword
```

#### 2.3 哈希令牌认证（生产环境推荐）🔐

```bash
# 步骤 1: 生成 SHA-256 哈希
# Linux/Mac:
echo -n "mysecretpassword" | sha256sum

# Windows PowerShell:
$bytes = [System.Text.Encoding]::UTF8.GetBytes("mysecretpassword")
$hash = [Convert]::ToHexString((New-Object System.Security.Cryptography.SHA256Managed).ComputeHash($bytes))
Write-Output $hash.ToLower()

# 步骤 2: 使用哈希启动
ACCESS_TOKEN_HASH=a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3 \
  docker compose --profile full up -d
```

**优势**:
- ✅ 更高安全性（不在内存中存储明文密码）
- ✅ 防止日志泄露密码
- ✅ 符合安全最佳实践

---

## ⚙️ 配置选项

### 环境变量

| 变量名 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `ACCESS_PASSWORD` | 明文密码（与 HASH 二选一） | - | 否 |
| `ACCESS_TOKEN_HASH` | SHA-256 哈希（与 PASSWORD 二选一） | - | 否 |
| `TOKEN_PARAM_NAME` | Token 参数名 | `token` | 否 |
| `PORT` | 服务器端口 | `3000` | 否 |

### 优先级规则

如果同时设置了 `ACCESS_PASSWORD` 和 `ACCESS_TOKEN_HASH`，**哈希优先**。

---

## 📖 使用示例

### 示例 1: 本地开发（无认证）

```bash
docker compose --profile full up -d
# 访问 http://localhost:3000
```

### 示例 2: 生产部署（带认证）

```bash
# 1. 创建 .env 文件
cat > .env << EOF
ACCESS_TOKEN_HASH=$(echo -n "MySecurePassword123" | sha256sum | awk '{print $1}')
PORT=3000
EOF

# 2. 启动服务
docker compose --profile full up -d

# 3. 配置前端
# 在 frontend/.env.production 中设置:
# VITE_WISP_URL=wss://your-domain.com/wisp/?token=MySecurePassword123

# 4. 重新构建前端
cd frontend && bun run build

# 5. 重启容器以加载新前端
docker compose --profile full down
docker compose --profile full up -d --build
```

### 示例 3: 自定义端口

```bash
PORT=8080 docker compose --profile full up -d
# 访问 http://localhost:8080
```

### 示例 4: 使用反向代理（Nginx/Traefik）

```yaml
# docker-compose.override.yml
services:
  full-stack:
    labels:
      - "traefik.http.routers.websideload.rule=Host(`sideload.example.com`)"
      - "traefik.http.routers.websideload.tls=true"
      - "traefik.http.routers.websideload.tls.certresolver=letsencrypt"
```

---

## 🔍 故障排查

### 问题 1: 认证失败（401 Unauthorized）

**症状**: 前端显示 "Unauthorized" 或 "Token mismatch"

**解决**:
```bash
# 1. 检查后端日志
docker compose logs full-stack | grep -i auth

# 2. 验证 Token 是否正确
curl -v "http://localhost:3000/wisp/?token=wrong_token"
# 应该返回 401

curl -v "http://localhost:3000/wisp/?token=correct_token"
# 应该建立 WebSocket 连接

# 3. 确认前端 URL 中的 token 参数
grep VITE_WISP_URL frontend/.env.production
```

### 问题 2: 容器启动失败

**症状**: `docker compose up` 报错

**解决**:
```bash
# 查看详细日志
docker compose logs full-stack

# 常见原因:
# - 端口被占用: 更改 PORT 环境变量
# - 权限问题: 确保 .env 文件可读
# - 构建失败: 清理缓存后重试
docker compose down
docker system prune -f
docker compose --profile full up -d --build
```

### 问题 3: WebSocket 连接失败

**症状**: 前端无法连接到 `/wisp/`

**解决**:
```bash
# 1. 检查容器是否运行
docker compose ps

# 2. 测试 WISP 端点
curl -i -H "Upgrade: websocket" -H "Connection: Upgrade" \
  "http://localhost:3000/wisp/?token=your_token"

# 3. 如果使用 HTTPS，确保使用 wss:// 而非 ws://
```

---

## 🛡️ 安全建议

### 生产环境清单

- ✅ **必须启用认证**（使用 `ACCESS_TOKEN_HASH`）
- ✅ **使用强密码**（至少 16 字符，包含大小写、数字、符号）
- ✅ **启用 HTTPS**（使用 Let's Encrypt 或其他证书）
- ✅ **定期轮换 Token**（建议每 90 天）
- ✅ **限制访问 IP**（通过防火墙或反向代理）
- ✅ **监控日志**（检测异常访问）
- ❌ **不要**将 `.env` 文件提交到版本控制
- ❌ **不要**使用默认密码或简单密码
- ❌ **不要**在日志中输出敏感信息

### 生成强密码

```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

---

## 🔄 更新流程

```bash
# 1. 拉取最新代码
git pull

# 2. 停止当前容器
docker compose --profile full down

# 3. 重新构建并启动
docker compose --profile full up -d --build

# 4. 验证服务
curl http://localhost:3000/healthz
```

---

## 📊 性能优化

### 资源限制

```yaml
# docker-compose.override.yml
services:
  full-stack:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
```

### 健康检查

```yaml
# docker-compose.override.yml
services:
  full-stack:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

---

## 📚 相关文档

- [主 README](../README.md) - 项目概述和其他部署方式
- [DEPLOYMENT.md](DEPLOYMENT.md) - Cloudflare Workers 部署指南
- [backend/README.md](../backend/README.md) - 后端详细说明

---

**最后更新**: 2026-04-23  
**维护者**: @yueying23
