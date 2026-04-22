# GitHub Actions Scripts

此目录包含用于 GitHub Actions 工作流的辅助脚本。

## 📁 脚本列表

### generate-deployment-docs.sh

**用途**: 生成部署包中的 DEPLOYMENT.md 文档

**调用方式**:
```bash
bash .github/scripts/generate-deployment-docs.sh
```

**环境变量**:
- `VERSION` (必需): 版本号（如 v1.0.0）
- `ENABLE_AUTH` (必需): 是否启用认证 (`true`/`false`)
- `WISP_URL` (条件必需): 当 `ENABLE_AUTH=true` 时必须提供 WISP 后端 URL
- `COMMIT_SHA` (可选): Git commit SHA
- `BUILD_TIME` (可选): 构建时间，默认为当前 UTC 时间
- `OUTPUT_DIR` (可选): 输出目录，默认为当前目录

**功能**:
- 从模板生成 DEPLOYMENT.md
- 根据认证状态动态插入不同的安全警告或配置说明
- 正确处理 Markdown 代码块等特殊字符

**示例**:
```yaml
- name: Generate deployment documentation
  run: bash .github/scripts/generate-deployment-docs.sh
  env:
    VERSION: ${{ github.event.inputs.version }}
    ENABLE_AUTH: ${{ github.event.inputs.enable_auth }}
    WISP_URL: ${{ github.event.inputs.wisp_url }}
    COMMIT_SHA: ${{ github.sha }}
    OUTPUT_DIR: deploy-package
```

### generate-release-body.sh

**用途**: 生成 GitHub Release 的 Markdown 描述文档

**调用方式**:
```bash
bash .github/scripts/generate-release-body.sh
```

**环境变量**:
- `RELEASE_NOTES` (必需): 发布说明文本
- `ENABLE_AUTH` (必需): 是否启用认证 (`true`/`false`)
- `WISP_URL` (条件必需): 当 `ENABLE_AUTH=true` 时必须提供 WISP 后端 URL
- `GITHUB_REPOSITORY` (可选): GitHub 仓库名称，默认为 `yueying23/sideimpactor`
- `GITHUB_SHA` (可选): Git commit SHA

**输出**: 
- 标准输出: 生成的 Markdown 内容
- 退出码: 0 表示成功，非 0 表示失败

**示例**:
```yaml
- name: Generate Release Body
  run: bash .github/scripts/generate-release-body.sh > release_body.md
  env:
    RELEASE_NOTES: ${{ github.event.inputs.release_notes }}
    ENABLE_AUTH: ${{ github.event.inputs.enable_auth }}
    WISP_URL: ${{ github.event.inputs.wisp_url }}
    GITHUB_REPOSITORY: ${{ github.repository }}
    GITHUB_SHA: ${{ github.sha }}
```

### test-generate-release-body.sh

**用途**: 本地测试 generate-release-body.sh 脚本

**调用方式**:
```bash
bash .github/scripts/test-generate-release-body.sh
```

**测试场景**:
1. 启用认证的情况
2. 未启用认证的情况
3. 缺少必需参数的错误处理

## 🔧 本地测试

您可以在本地测试这些脚本：

```bash
# 测试 DEPLOYMENT.md 生成
export VERSION="v1.0.0"
export ENABLE_AUTH="true"
export WISP_URL="wss://test-worker.workers.dev/wisp/"
export COMMIT_SHA="abc123"
export OUTPUT_DIR="./test-output"
bash .github/scripts/generate-deployment-docs.sh

# 测试 Release Body 生成
export RELEASE_NOTES="Test release"
export ENABLE_AUTH="true"
export WISP_URL="wss://test.workers.dev/wisp/"
export GITHUB_REPOSITORY="yueying23/sideimpactor"
export GITHUB_SHA="abc123"
bash .github/scripts/generate-release-body.sh

# 运行自动化测试
bash .github/scripts/test-generate-release-body.sh
```

## 📝 维护指南

1. **添加新脚本**: 
   - 在 `.github/scripts/` 目录下创建新的 `.sh` 文件
   - 添加适当的错误处理和文档注释
   - 在此 README 中更新脚本列表

2. **修改现有脚本**:
   - 保持向后兼容性
   - 更新本文档中的说明
   - 在本地测试更改

3. **最佳实践**:
   - 使用 `set -e` 确保错误时立即退出
   - 验证所有必需的环境变量
   - 提供清晰的错误消息（使用 `::error::` 格式）
   - 避免硬编码值，使用环境变量或参数
   - **重要**: 如果脚本需要生成包含 Markdown 代码块（\`\`\`）的内容，必须在外部脚本中处理，避免在 YAML 中直接使用反引号

## ⚠️ 常见问题

### YAML 解析错误

如果在 YAML 文件中遇到解析错误，特别是涉及特殊字符（如反引号、美元符号等）时：

1. **不要**在 YAML 的多行字符串中直接编写包含 Markdown 代码块的内容
2. **应该**将复杂逻辑提取到外部 Shell 脚本中
3. 使用环境变量传递参数给脚本
4. 通过重定向将脚本输出保存到文件

**错误示例**:
```yaml
run: |
  NOTE='Content with ```code blocks```'  # ❌ 会导致 YAML 解析错误
```

**正确示例**:
```yaml
run: bash .github/scripts/generate-docs.sh  # ✅ 在外部脚本中处理
```