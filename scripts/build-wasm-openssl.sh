#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./wasm-common.sh
source "$SCRIPT_DIR/wasm-common.sh"

OPENSSL_PRECOMPILED="$(resolve_openssl_precompiled_dir || true)"
if [[ -z "${OPENSSL_PRECOMPILED}" ]]; then
  echo "OpenSSL precompiled directory not found." >&2
  echo "Set OPENSSL_PRECOMPILED_DIR or OPENSSL_ROOT to a directory containing include/ and lib/." >&2
  exit 1
fi

cd "$REPO_ROOT/wasm/openssl"
OPENSSL_ROOT="$OPENSSL_PRECOMPILED" bun run build
