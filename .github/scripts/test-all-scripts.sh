#!/bin/bash
# test-all-scripts.sh - 测试所有 GitHub Actions 脚本

set -e

echo "🧪 Testing all GitHub Actions scripts..."
echo ""

# 创建测试输出目录
TEST_OUTPUT_DIR="./test-output-$$"
mkdir -p "$TEST_OUTPUT_DIR"

cleanup() {
  echo ""
  echo "Cleaning up test directory..."
  rm -rf "$TEST_OUTPUT_DIR"
}
trap cleanup EXIT

# 测试 1: generate-deployment-docs.sh - 启用认证
echo "=== Test 1: generate-deployment-docs.sh (Auth Enabled) ==="
export VERSION="v1.0.0-test"
export ENABLE_AUTH="true"
export WISP_URL="wss://test-worker.workers.dev/wisp/"
export COMMIT_SHA="test123abc"
export OUTPUT_DIR="$TEST_OUTPUT_DIR/auth-enabled"

bash .github/scripts/generate-deployment-docs.sh
echo ""
echo "Generated DEPLOYMENT.md preview:"
head -20 "$OUTPUT_DIR/DEPLOYMENT.md"
echo ""
echo "--- End of Test 1 ---"
echo ""

# 测试 2: generate-deployment-docs.sh - 未启用认证
echo "=== Test 2: generate-deployment-docs.sh (Auth Disabled) ==="
export ENABLE_AUTH="false"
unset WISP_URL
export OUTPUT_DIR="$TEST_OUTPUT_DIR/auth-disabled"

bash .github/scripts/generate-deployment-docs.sh
echo ""
echo "Generated DEPLOYMENT.md preview:"
head -20 "$OUTPUT_DIR/DEPLOYMENT.md"
echo ""
echo "--- End of Test 2 ---"
echo ""

# 测试 3: generate-release-body.sh - 启用认证
echo "=== Test 3: generate-release-body.sh (Auth Enabled) ==="
export RELEASE_NOTES="Test release with auth"
export ENABLE_AUTH="true"
export WISP_URL="wss://test-worker.workers.dev/wisp/"
export GITHUB_REPOSITORY="yueying23/sideimpactor"
export GITHUB_SHA="test123abc"

bash .github/scripts/generate-release-body.sh | head -30
echo ""
echo "--- End of Test 3 ---"
echo ""

# 测试 4: generate-release-body.sh - 未启用认证
echo "=== Test 4: generate-release-body.sh (Auth Disabled) ==="
export ENABLE_AUTH="false"
unset WISP_URL

bash .github/scripts/generate-release-body.sh | head -30
echo ""
echo "--- End of Test 4 ---"
echo ""

# 测试 5: 缺少必需参数（应该失败）
echo "=== Test 5: Missing Required Parameters (should fail) ==="
unset RELEASE_NOTES

if bash .github/scripts/generate-release-body.sh 2>&1; then
  echo "❌ Test 5 failed: Should have exited with error"
  exit 1
else
  echo "✅ Test 5 passed: Correctly detected missing parameters"
fi
echo ""

echo "✅ All tests completed successfully!"