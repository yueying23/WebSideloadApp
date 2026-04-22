# GitHub Actions Scripts

此目录包含用于 GitHub Actions 工作流的辅助脚本。

## 📁 脚本列表

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

## 🔧 本地测试

您可以在本地测试这些脚本：

```bash
# 设置环境变量
export RELEASE_NOTES="Test release"
export ENABLE_AUTH="true"
export WISP_URL="wss://test.workers.dev/wisp/"
export GITHUB_REPOSITORY="yueying23/sideimpactor"
export GITHUB_SHA="abc123"

# 运行脚本
bash .github/scripts/generate-release-body.sh
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