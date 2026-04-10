#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./wasm-common.sh
source "$SCRIPT_DIR/wasm-common.sh"

activate_emscripten

OPENSSL_PRECOMPILED="$(resolve_openssl_precompiled_dir || true)"
if [[ -z "${OPENSSL_PRECOMPILED}" ]]; then
  echo "OpenSSL precompiled directory not found." >&2
  echo "Set OPENSSL_PRECOMPILED_DIR or OPENSSL_WASM to a directory containing include/ and lib/." >&2
  exit 1
fi

cd "$REPO_ROOT/wasm/zsign-wasm"
OPENSSL_WASM="$OPENSSL_PRECOMPILED" bun run build
