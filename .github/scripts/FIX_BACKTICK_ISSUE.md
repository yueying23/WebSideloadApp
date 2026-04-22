# YAML 反引号问题修复说明

## 🐛 问题描述

在 `.github/workflows/release-build.yml` 第 195 行出现 YAML 语法错误：

```
Invalid workflow file: .github/workflows/release-build.yml#L195
You have an error in your yaml syntax on line 195
```

### 根本原因

在 YAML 的多行字符串中，Shell 变量的单引号赋值里包含了 **Markdown 代码块标记（\`\`\`）**，导致 YAML 解析器无法正确解析。

**问题代码示例**（已删除）:
```yaml
run: |
  AUTH_NOTE='### 🔐 认证配置
  
此构建版本已配置 WISP 后端认证:
```                          # ❌ 这里的反引号导致 YAML 解析错误
${{ github.event.inputs.wisp_url }}?token=***
```                          # ❌ 这里的反引号也导致错误
'
```

即使使用单引号包裹，YAML 解析器仍然会被未转义的反引号干扰。

## ✅ 解决方案

将包含 Markdown 代码块的复杂文本生成逻辑**完全移到外部 Shell 脚本**中处理。

### 实施步骤

1. **创建新脚本**: `.github/scripts/generate-deployment-docs.sh`
   - 负责生成 `DEPLOYMENT.md` 文档
   - 正确处理所有 Markdown 特殊字符（包括 \`\`\`）
   - 根据认证状态动态插入不同内容

2. **简化工作流**: 
   ```yaml
   # 之前: 80+ 行复杂的内联 Shell 脚本（包含反引号）
   # 之后: 1 行干净的脚本调用
   - name: Generate deployment documentation
     run: bash .github/scripts/generate-deployment-docs.sh
     env:
       VERSION: ${{ github.event.inputs.version }}
       ENABLE_AUTH: ${{ github.event.inputs.enable_auth }}
       WISP_URL: ${{ github.event.inputs.wisp_url }}
       COMMIT_SHA: ${{ github.sha }}
       OUTPUT_DIR: deploy-package
   ```

3. **更新文档**: 
   - 添加新脚本的使用说明
   - 在 README 中添加常见问题解答
   - 创建综合测试脚本

## 📊 对比分析

| 方面 | 修复前 | 修复后 |
|------|--------|--------|
| YAML 行数 | ~350 | ~293 |
| 内联 Shell 代码 | 80+ 行 | 0 行 |
| 反引号问题 | ❌ 存在 | ✅ 已解决 |
| 可维护性 | 低 | 高 |
| 可测试性 | 需触发 CI | 可本地测试 |

## 🔍 技术细节

### 为什么反引号会导致问题？

1. **YAML 解析顺序**: YAML 解析器先于 Shell 执行
2. **特殊字符处理**: 即使在单引号字符串中，某些字符仍可能影响 YAML 结构
3. **多行字符串边界**: 反引号可能被误认为字符串结束标记

### 正确的处理方式

```bash
# ✅ 在外部脚本中使用 heredoc
cat > file.md << 'EOF'
Content with ```code blocks```
EOF

# ❌ 避免在 YAML 中直接写
run: |
  VAR='Content with ```code```'  # 会导致解析错误
```

## 🧪 测试验证

运行以下命令验证修复：

```bash
# 本地测试脚本
bash .github/scripts/test-all-scripts.sh

# 或单独测试
export VERSION="v1.0.0"
export ENABLE_AUTH="true"
export WISP_URL="wss://test.workers.dev/wisp/"
export OUTPUT_DIR="./test-output"
bash .github/scripts/generate-deployment-docs.sh
```

## 📚 相关规范

本次修复遵循以下项目规范：

1. **[GitHub Actions 构建脚本外部化规范](../scripts/README.md)**
   - 将复杂 Shell 逻辑提取到外部脚本
   - 通过环境变量传递参数
   - 避免在 YAML 中处理特殊字符

2. **[YAML 中 Shell 脚本与特殊字符处理规范](../../DEPLOYMENT_CHECKLIST.md)**
   - Heredoc 语法规范
   - 特殊字符处理规范
   - 优先使用单引号

3. **[GitHub Actions YAML 复杂表达式处理规范](../../DEPLOYMENT_CHECKLIST.md)**
   - 避免在多行字符串字段中编写复杂条件逻辑
   - 使用 `_path` 参数引用生成的文件

## ✨ 最佳实践总结

1. **分离关注点**: YAML 负责流程编排，Shell 脚本负责具体实现
2. **避免特殊字符**: 不在 YAML 中直接使用反引号、美元符号等特殊字符
3. **外部化处理**: 将复杂逻辑提取到独立脚本文件
4. **充分测试**: 确保脚本可以在本地独立测试
5. **完善文档**: 为每个脚本提供清晰的使用说明和示例

## 🔗 相关文件

- [generate-deployment-docs.sh](generate-deployment-docs.sh) - 部署文档生成脚本
- [generate-release-body.sh](generate-release-body.sh) - Release Body 生成脚本
- [README.md](README.md) - 脚本使用说明
- [release-build.yml](../workflows/release-build.yml) - 工作流文件

---

**修复日期**: 2026-04-23  
**修复者**: @yueying23  
**问题根源**: YAML 中的 Markdown 代码块标记（\`\`\`）导致解析错误  
**解决方案**: 将复杂文本生成逻辑移至外部 Shell 脚本