#!/bin/bash
# generate-release-body.sh - 生成 GitHub Release Body 文档
# 用法: bash .github/scripts/generate-release-body.sh
# 环境变量:
#   RELEASE_NOTES - 发布说明
#   ENABLE_AUTH - 是否启用认证 (true/false)
#   WISP_URL - WISP 后端 URL
#   GITHUB_REPOSITORY - GitHub 仓库名称
#   GITHUB_SHA - Git commit SHA

set -e

# 验证必需的环境变量
if [ -z "$RELEASE_NOTES" ]; then
  echo "::error::RELEASE_NOTES environment variable is required"
  exit 1
fi

if [ -z "$ENABLE_AUTH" ]; then
  echo "::error::ENABLE_AUTH environment variable is required"
  exit 1
fi

if [ -z "$GITHUB_REPOSITORY" ]; then
  echo "::warning::GITHUB_REPOSITORY not set, using default"
  GITHUB_REPOSITORY="yueying23/sideimpactor"
fi

if [ -z "$GITHUB_SHA" ]; then
  echo "::warning::GITHUB_SHA not set"
  GITHUB_SHA="unknown"
fi

echo "Generating release body..."
echo "  Release Notes: ${RELEASE_NOTES:0:50}..."
echo "  Auth Enabled: $ENABLE_AUTH"
echo "  Repository: $GITHUB_REPOSITORY"

# 创建临时文件
TEMP_FILE=$(mktemp)

# 写入头部信息
cat > "$TEMP_FILE" << EOF
## ${RELEASE_NOTES}

### 📦 包含内容
- ✅ 前端静态资源（可用于 Cloudflare Pages、Nginx 等）
- ✅ 后端 Cloudflare Workers 代码
- ✅ Docker 部署配置
- ✅ 详细的部署说明文档

### 🔐 认证配置
EOF

# 根据认证状态添加不同的内容
if [ "$ENABLE_AUTH" == "true" ]; then
  if [ -z "$WISP_URL" ]; then
    echo "::error::WISP_URL is required when authentication is enabled"
    rm -f "$TEMP_FILE"
    exit 1
  fi
  
  cat >> "$TEMP_FILE" << EOF
- ✅ **已启用认证保护**：前端已配置 WISP URL 和 Token
- **WISP URL**: \`${WISP_URL}/?token=***\`
EOF
else
  cat >> "$TEMP_FILE" << 'EOF'
- ⚠️ **未启用认证**：生产环境强烈建议配置 ACCESS_PASSWORD 或 ACCESS_TOKEN_HASH
EOF
fi

# 写入快速开始部分（静态内容）
cat >> "$TEMP_FILE" << 'EOF'

### 🚀 快速开始

#### 方式 1: Cloudflare 部署（推荐）
```bash
# 解压后
cd backend
bun install
npx wrangler deploy

# 前端部署到 Pages
cd ../frontend-dist
npx wrangler pages deploy .
```

#### 方式 2: Docker 部署
```bash
docker build -t web-sideload-app .
docker run -d -p 3000:3000 web-sideload-app
```

### 📋 文件说明
- `frontend-dist/`: 前端静态资源，可直接部署到任何静态托管服务
- `backend/`: Cloudflare Workers 后端代码
- `Dockerfile`: Docker 构建配置
- `nginx.conf`: Nginx 配置文件
- `DEPLOYMENT.md`: 详细部署指南（包含认证配置说明）

### ⚠️ 重要提示
EOF

# 根据认证状态添加不同的提示信息
if [ "$ENABLE_AUTH" == "true" ]; then
  cat >> "$TEMP_FILE" << 'EOF'
- ✅ 此版本已配置认证，确保后端设置相同的 token
EOF
else
  cat >> "$TEMP_FILE" << 'EOF'
- ⚠️ **生产环境必须配置认证**以防止未授权访问和费用滥用
EOF
fi

# 写入底部信息（包含动态变量）
BUILD_TIME=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

cat >> "$TEMP_FILE" << EOF
- 需要使用支持 WebUSB 的浏览器（Chrome/Edge）
- 必须在 HTTPS 环境下运行（localhost 除外）
- 查看 \`DEPLOYMENT.md\` 了解完整的认证配置步骤

### 🔗 相关链接
- [项目主页](https://github.com/${GITHUB_REPOSITORY})
- [问题反馈](https://github.com/${GITHUB_REPOSITORY}/issues)
- [Cloudflare Workers 认证文档](https://developers.cloudflare.com/workers/configuration/secrets/)

---
**Build Info:**
- Commit: ${GITHUB_SHA}
- Build Time: ${BUILD_TIME}
- Authentication: ${ENABLE_AUTH}
EOF

# 输出到标准输出（供工作流捕获）
cat "$TEMP_FILE"

# 清理临时文件
rm -f "$TEMP_FILE"

echo ""
echo "✅ Release body generated successfully"