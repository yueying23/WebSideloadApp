#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

resolve_openssl_precompiled_dir() {
  local candidate

  for candidate in \
    "${OPENSSL_WASM:-}" \
    "${OPENSSL_ROOT:-}" \
    "${OPENSSL_PRECOMPILED_DIR:-}" \
    "$REPO_ROOT/openssl-wasm/precompiled" \
    "$REPO_ROOT/wasm/openssl/precompiled" \
    "$REPO_ROOT/wasm/vendor/openssl-wasm/precompiled" \
    "$REPO_ROOT/wasm/openssl-wasm/precompiled"
  do
    if [[ -n "$candidate" && -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

activate_emscripten() {
  if [[ -n "${EMSDK_ENV:-}" ]]; then
    if [[ ! -f "${EMSDK_ENV}" ]]; then
      echo "EMSDK_ENV does not exist: ${EMSDK_ENV}" >&2
      return 1
    fi

    # shellcheck disable=SC1090
    . "${EMSDK_ENV}"
  fi

  if ! command -v emcc >/dev/null 2>&1 || ! command -v em++ >/dev/null 2>&1; then
    echo "Emscripten is not available. Install it or set EMSDK_ENV to emsdk_env.sh." >&2
    return 1
  fi
}
