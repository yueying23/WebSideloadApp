#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./wasm-common.sh
source "$SCRIPT_DIR/wasm-common.sh"

activate_emscripten

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "libcurl-wasm upstream only supports Linux builds." >&2
  echo "Run this script on Linux, or use orb to enter a Linux environment first." >&2
  exit 1
fi

cd "$REPO_ROOT/wasm/libcurl-wasm"
bun run build
