#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

OPENSSL_ROOT="${OPENSSL_ROOT:-${OPENSSL_PRECOMPILED_DIR:-$ROOT_DIR/precompiled}}"
LLVM_BIN="${LLVM_BIN:-}"

if [[ ! -d "$OPENSSL_ROOT" ]]; then
  echo "OpenSSL precompiled directory not found: $OPENSSL_ROOT" >&2
  echo "Set OPENSSL_ROOT or OPENSSL_PRECOMPILED_DIR to a directory containing include/ and lib/." >&2
  exit 1
fi

if [[ -z "$LLVM_BIN" ]] && command -v brew >/dev/null 2>&1; then
  BREW_LLVM_PREFIX="$(brew --prefix llvm 2>/dev/null || true)"
  if [[ -n "$BREW_LLVM_PREFIX" && -x "$BREW_LLVM_PREFIX/bin/clang" ]]; then
    LLVM_BIN="$BREW_LLVM_PREFIX/bin"
  fi
fi

if [[ -n "$LLVM_BIN" ]]; then
  CLANG_BIN="$LLVM_BIN/clang"
  LLVM_AR_BIN="$LLVM_BIN/llvm-ar"
  LLVM_RANLIB_BIN="$LLVM_BIN/llvm-ranlib"
else
  CLANG_BIN="${CLANG_BIN:-$(command -v clang || true)}"
  LLVM_AR_BIN="${LLVM_AR_BIN:-$(command -v llvm-ar || true)}"
  LLVM_RANLIB_BIN="${LLVM_RANLIB_BIN:-$(command -v llvm-ranlib || true)}"
fi

if [[ -z "$CLANG_BIN" || -z "$LLVM_AR_BIN" || -z "$LLVM_RANLIB_BIN" ]]; then
  echo "LLVM tools for wasm32-unknown-unknown are not available." >&2
  echo "Set LLVM_BIN or CLANG_BIN/LLVM_AR_BIN/LLVM_RANLIB_BIN." >&2
  exit 1
fi

if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo "Missing wasm-bindgen CLI. Install it with: cargo install wasm-bindgen-cli" >&2
  exit 1
fi

export OPENSSL_NO_VENDOR=1
export OPENSSL_STATIC=1
export OPENSSL_DIR="$OPENSSL_ROOT"
export OPENSSL_LIB_DIR="$OPENSSL_ROOT/lib"
export OPENSSL_INCLUDE_DIR="$OPENSSL_ROOT/include"
export OPENSSL_LIBS="ssl:crypto"

export CC_wasm32_unknown_unknown="$CLANG_BIN --target=wasm32-unknown-unknown"
export AR_wasm32_unknown_unknown="$LLVM_AR_BIN"
export RANLIB_wasm32_unknown_unknown="$LLVM_RANLIB_BIN"

echo "[1/2] Building wasm32-unknown-unknown with openssl-rs..."
cargo build --release --target wasm32-unknown-unknown

echo "[2/2] Generating JS bindings with wasm-bindgen..."
rm -rf binary
mkdir -p binary
wasm-bindgen \
  target/wasm32-unknown-unknown/release/openssl_wasm.wasm \
  --out-dir binary \
  --target web
echo "Done: binary/ generated."
