#!/bin/bash
# generate-deployment-docs.sh - 生成部署文档和 Release Body
# 用法: bash .github/scripts/generate-deployment-docs.sh
# 环境变量:
#   VERSION - 版本号
#   ENABLE_AUTH - 是否启用认证 (true/false)
#   WISP_URL - WISP 后端 URL
#   BUILD_TIME - 构建时间
#   COMMIT_SHA - Git commit SHA
#   AUTH_STATUS - 认证状态文本
#   OUTPUT_DIR - 输出目录

set -e

# 验证必需的环境变量
if [ -z "$VERSION" ]; then
  echo "::error::VERSION environment variable is required"
  exit 1
fi

if [ -z "$ENABLE_AUTH" ]; then
  echo "::error::ENABLE_AUTH environment variable is required"
  exit 1
fi

if [ -z "$BUILD_TIME" ]; then
  BUILD_TIME=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
fi

if [ -z "$COMMIT_SHA" ]; then
  echo "::warning::COMMIT_SHA not set"
  COMMIT_SHA="unknown"
fi

if [ -z "$OUTPUT_DIR" ]; then
  OUTPUT_DIR="."
fi

echo "Generating deployment documentation..."
echo "  Version: $VERSION"
echo "  Auth Enabled: $ENABLE_AUTH"
echo "  Output Dir: $OUTPUT_DIR"

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 复制模板
cp .github/templates/DEPLOYMENT.md.template "$OUTPUT_DIR/DEPLOYMENT.md"

# 设置认证状态
if [ "$ENABLE_AUTH" == "true" ]; then
  if [ -z "$WISP_URL" ]; then
    echo "::error::WISP_URL is required when authentication is enabled"
    exit 1
  fi
  AUTH_STATUS="✅ 已配置认证保护"
else
  AUTH_STATUS="⚠️ 未配置认证保护"
fi

# 替换简单占位符
sed -i "s|{{VERSION}}|${VERSION}|g" "$OUTPUT_DIR/DEPLOYMENT.md"
sed -i "s|{{AUTH_STATUS}}|${AUTH_STATUS}|g" "$OUTPUT_DIR/DEPLOYMENT.md"
sed -i "s|{{BUILD_TIME}}|${BUILD_TIME}|g" "$OUTPUT_DIR/DEPLOYMENT.md"
sed -i "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" "$OUTPUT_DIR/DEPLOYMENT.md"

# 生成 AUTH_NOTE 内容到临时文件
AUTH_NOTE_FILE=$(mktemp)

if [ "$ENABLE_AUTH" == "true" ]; then
  cat > "$AUTH_NOTE_FILE" << 'EOF'
### 🔐 认证配置(已启用)

此构建版本已配置 WISP 后端认证。前端将使用以下 URL 连接后端:
EOF
  # 添加 WISP URL（需要转义特殊字符）
  echo "\`\`\`" >> "$AUTH_NOTE_FILE"
  echo "${WISP_URL}?token=***" >> "$AUTH_NOTE_FILE"
  echo "\`\`\`" >> "$AUTH_NOTE_FILE"
  cat >> "$AUTH_NOTE_FILE" << 'EOF'

**重要提示:**
- 确保您的 Cloudflare Workers 已配置相同的 token
- 使用 `wrangler secret put ACCESS_PASSWORD` 或 `ACCESS_TOKEN_HASH` 设置后端认证
- Token 不匹配将导致 401 Unauthorized 错误
EOF
else
  cat > "$AUTH_NOTE_FILE" << 'EOF'
### ⚠️ 安全警告:未启用认证

此构建版本**未配置认证保护**,任何人都可以访问您的 WISP 后端!

**生产环境强烈建议启用认证:**
1. 在 Cloudflare Workers 中设置 Secret:
   ```bash
   wrangler secret put ACCESS_PASSWORD
   # 或
   echo -n "your_password" | sha256sum
   wrangler secret put ACCESS_TOKEN_HASH
   ```
2. 重新构建前端并配置 VITE_WISP_URL:
   ```env
   VITE_WISP_URL=wss://your-worker.workers.dev/wisp/?token=your_password
   ```
3. 运行 `bun run build` 重新构建

**风险提示:** 不配置认证可能导致:
- ❌ 未经授权的访问和使用
- ❌ Cloudflare Workers 费用滥用
- ❌ 潜在的安全风险
EOF
fi

# 读取 AUTH_NOTE 内容并进行转义，以便用于 awk
AUTH_NOTE_CONTENT=$(cat "$AUTH_NOTE_FILE")

# 使用 awk 替换多行 AUTH_NOTE
awk -v note="$AUTH_NOTE_CONTENT" '{
  if ($0 ~ /{{AUTH_NOTE}}/) {
    print note
  } else {
    print $0
  }
}' "$OUTPUT_DIR/DEPLOYMENT.md" > "$OUTPUT_DIR/DEPLOYMENT.md.tmp"
mv "$OUTPUT_DIR/DEPLOYMENT.md.tmp" "$OUTPUT_DIR/DEPLOYMENT.md"

# 清理临时文件
rm -f "$AUTH_NOTE_FILE"

echo "✅ Deployment documentation generated successfully"
ls -la "$OUTPUT_DIR/DEPLOYMENT.md"