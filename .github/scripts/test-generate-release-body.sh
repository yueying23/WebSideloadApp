#!/bin/bash
# test-generate-release-body.sh - 本地测试 generate-release-body.sh 脚本

set -e

echo "🧪 Testing generate-release-body.sh script..."
echo ""

# 测试场景 1: 启用认证
echo "=== Test 1: With Authentication Enabled ==="
export RELEASE_NOTES="Test release with auth"
export ENABLE_AUTH="true"
export WISP_URL="wss://test-worker.workers.dev/wisp/"
export GITHUB_REPOSITORY="yueying23/sideimpactor"
export GITHUB_SHA="test123abc"

bash .github/scripts/generate-release-body.sh
echo ""
echo "--- End of Test 1 ---"
echo ""

# 测试场景 2: 未启用认证
echo "=== Test 2: Without Authentication ==="
export ENABLE_AUTH="false"
unset WISP_URL

bash .github/scripts/generate-release-body.sh
echo ""
echo "--- End of Test 2 ---"
echo ""

# 测试场景 3: 缺少必需参数（应该失败）
echo "=== Test 3: Missing Required Parameters (should fail) ==="
unset RELEASE_NOTES

if bash .github/scripts/generate-release-body.sh 2>&1; then
  echo "❌ Test 3 failed: Should have exited with error"
  exit 1
else
  echo "✅ Test 3 passed: Correctly detected missing parameters"
fi
echo ""

echo "✅ All tests completed!"