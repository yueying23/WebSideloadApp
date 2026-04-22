# GitHub Actions 部署包生成流程说明

## 📁 文件组织结构

### 源码中的模板和脚本位置

```
.github/
├── workflows/
│   └── release-build.yml          # ⭐ 主工作流文件
├── scripts/
│   ├── generate-deployment-docs.sh  # ⭐ 生成 DEPLOYMENT.md 的脚本
│   ├── generate-release-body.sh     # ⭐ 生成 Release Body 的脚本
│   └── README.md                    # 脚本使用说明
└── templates/
    ├── DEPLOYMENT.md.template           # ⭐ DEPLOYMENT.md 模板
    ├── DEPLOYMENT_OPTIONS.md.template   # ⭐ 部署选项文档模板
    ├── README_DEPLOYMENT.md.template    # ⭐ 快速参考模板
    └── STRUCTURE_OPTIMIZATION.md.template  # ⭐ 优化说明模板
```

### 生成的部署包结构

```
deploy-package/ (由 GitHub Actions 自动生成)
├── backend/
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.jsonc          # 从源码直接复制
├── frontend/
│   └── dist/                   # 前端构建产物
├── DEPLOYMENT.md               # 从模板生成
├── DEPLOYMENT_OPTIONS.md       # 从模板复制
├── README_DEPLOYMENT.md        # 从模板复制
├── STRUCTURE_OPTIMIZATION.md   # 从模板复制
├── Dockerfile
└── nginx.conf
```

---

## 🔄 生成流程

### 1. 工作流触发

```yaml
on:
  workflow_dispatch:
    inputs:
      version: 'v1.0.0'
      enable_auth: true/false
      wisp_url: 'wss://...'
      auth_token: 'xxx'
```

### 2. 构建阶段

```yaml
steps:
  # 1. 检出代码
  - uses: actions/checkout@v4
  
  # 2. 构建 WASM
  - run: bun run build:wasm:dist
  
  # 3. 配置前端环境变量（如果启用认证）
  - if: enable_auth == 'true'
    run: |
      cat > frontend/.env.production << EOF
      VITE_WISP_URL=${{ inputs.wisp_url }}?token=${{ inputs.auth_token }}
      EOF
  
  # 4. 构建前端
  - run: cd frontend && bun run build
```

### 5. 准备部署包

```yaml
- name: Prepare deployment package
  run: |
    # 创建目录结构（与源码一致）
    mkdir -p deploy-package/frontend
    cp -r frontend/dist deploy-package/frontend/dist
    
    mkdir -p deploy-package/backend
    cp -r backend/src deploy-package/backend/
    cp backend/wrangler.jsonc deploy-package/backend/  # ⭐ 直接复制
    
    # 复制其他文件
    cp Dockerfile deploy-package/
    cp nginx.conf deploy-package/
```

### 6. 生成文档

```yaml
- name: Generate deployment documentation
  run: bash .github/scripts/generate-deployment-docs.sh
  env:
    VERSION: ${{ inputs.version }}
    ENABLE_AUTH: ${{ inputs.enable_auth }}
    WISP_URL: ${{ inputs.wisp_url }}
    OUTPUT_DIR: deploy-package
```

**脚本执行流程**:
1. 复制 `.github/templates/DEPLOYMENT.md.template` → `deploy-package/DEPLOYMENT.md`
2. 替换占位符：`{{VERSION}}`, `{{AUTH_STATUS}}`, `{{BUILD_TIME}}`, `{{COMMIT_SHA}}`
3. 根据 `ENABLE_AUTH` 生成不同的 `{{AUTH_NOTE}}` 内容
4. 输出最终的 DEPLOYMENT.md

### 7. 复制其他文档

```yaml
- run: |
    cp .github/templates/DEPLOYMENT_OPTIONS.md.template deploy-package/DEPLOYMENT_OPTIONS.md
    cp .github/templates/README_DEPLOYMENT.md.template deploy-package/README_DEPLOYMENT.md
    cp .github/templates/STRUCTURE_OPTIMIZATION.md.template deploy-package/STRUCTURE_OPTIMIZATION.md
```

### 8. 压缩和发布

```yaml
- name: Archive deployment package
  run: |
    tar -czf "web-sideload-app-${VERSION}.tar.gz" deploy-package/
    zip -r "web-sideload-app-${VERSION}.zip" deploy-package/

- name: Create GitHub Release
  uses: softprops/action-gh-release@v1
  with:
    body_path: release_body.md  # 由 generate-release-body.sh 生成
    files: |
      *.tar.gz
      *.zip
```

---

## 🎯 关键设计原则

### 1. 目录结构一致性

**原则**: 部署包的目录结构与源码保持一致

**实现**:
```yaml
# 源码结构
frontend/dist/
backend/wrangler.jsonc  # 指向 ../frontend/dist

# 部署包结构（完全一致）
frontend/dist/
backend/wrangler.jsonc  # 依然指向 ../frontend/dist ✅
```

**优势**:
- ✅ wrangler.jsonc 无需修改
- ✅ 零配置迁移
- ✅ 降低学习成本

### 2. 模板化文档

**原则**: 所有文档都使用模板，通过脚本动态生成

**模板位置**: `.github/templates/*.template`

**生成脚本**: `.github/scripts/generate-deployment-docs.sh`

**优势**:
- ✅ 集中管理文档内容
- ✅ 支持动态内容（版本号、认证状态等）
- ✅ 易于维护和更新

### 3. 单一数据源

**原则**: wrangler.jsonc 只有一份，位于 `backend/`

**实现**:
```yaml
# 工作流中直接复制，不重新生成
cp backend/wrangler.jsonc deploy-package/backend/
```

**优势**:
- ✅ 避免配置不同步
- ✅ 减少维护工作量
- ✅ 降低出错概率

---

## 📝 修改指南

### 如果要修改部署包内容

#### 修改 DEPLOYMENT.md 模板
1. 编辑 `.github/templates/DEPLOYMENT.md.template`
2. 提交更改
3. 下次 Release 时自动生效

#### 修改其他文档
1. 编辑对应的 `.github/templates/*.template` 文件
2. 提交更改
3. 下次 Release 时自动生效

#### 修改目录结构
1. 编辑 `.github/workflows/release-build.yml` 中的 "Prepare deployment package" 步骤
2. 调整 `cp` 命令和目录创建逻辑
3. 提交更改

#### 修改文档生成逻辑
1. 编辑 `.github/scripts/generate-deployment-docs.sh`
2. 测试脚本（可本地运行）
3. 提交更改

---

## ❌ 常见错误

### 错误 1: 直接修改 deploy-package/ 目录

```bash
# ❌ 错误做法
cd deploy-package
vim DEPLOYMENT.md  # 这个目录是从 Release 下载的，修改无意义

# ✅ 正确做法
cd .github/templates
vim DEPLOYMENT.md.template  # 修改模板
```

### 错误 2: 在部署包中生成专用的 wrangler.jsonc

```yaml
# ❌ 错误做法
cat > deploy-package/backend/wrangler.jsonc << EOF
{
  "assets": {
    "directory": "../frontend-dist",  # 不同的路径
    ...
  }
}
EOF

# ✅ 正确做法
cp backend/wrangler.jsonc deploy-package/backend/  # 直接复制
```

### 错误 3: 调整配置文件来适配目录结构

```bash
# ❌ 错误思路
# 因为部署包用 frontend-dist，所以修改 wrangler.jsonc 指向它

# ✅ 正确思路
# 调整部署包结构为 frontend/dist，保持 wrangler.jsonc 不变
```

---

## 🧪 本地测试

### 测试文档生成脚本

```bash
# 设置环境变量
export VERSION="v1.0.0-test"
export ENABLE_AUTH="true"
export WISP_URL="wss://test.workers.dev/wisp/"
export OUTPUT_DIR="./test-output"

# 运行脚本
bash .github/scripts/generate-deployment-docs.sh

# 查看结果
cat ./test-output/DEPLOYMENT.md
```

### 测试完整流程

```bash
# 1. 构建前端
cd frontend
bun run build

# 2. 模拟工作流
cd ..
mkdir -p test-package/frontend
cp -r frontend/dist test-package/frontend/dist

mkdir -p test-package/backend
cp backend/wrangler.jsonc test-package/backend/

# 3. 生成文档
export VERSION="test"
export ENABLE_AUTH="false"
export OUTPUT_DIR="test-package"
bash .github/scripts/generate-deployment-docs.sh

# 4. 查看结果
ls -la test-package/
```

---

## 📚 相关文件

- [release-build.yml](../workflows/release-build.yml) - 主工作流
- [generate-deployment-docs.sh](../scripts/generate-deployment-docs.sh) - 文档生成脚本
- [DEPLOYMENT.md.template](../templates/DEPLOYMENT.md.template) - DEPLOYMENT.md 模板
- [DEPLOYMENT_OPTIONS.md.template](../templates/DEPLOYMENT_OPTIONS.md.template) - 部署选项模板
- [README_DEPLOYMENT.md.template](../templates/README_DEPLOYMENT.md.template) - 快速参考模板
- [STRUCTURE_OPTIMIZATION.md.template](../templates/STRUCTURE_OPTIMIZATION.md.template) - 优化说明模板

---

**最后更新**: 2026-04-23  
**维护者**: @yueying23