#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

OPENSSL_ROOT="/Users/libr/Desktop/Life/browser-apple/openssl-wasm/precompiled"
LLVM_BIN="/opt/homebrew/opt/llvm/bin"

export OPENSSL_NO_VENDOR=1
export OPENSSL_STATIC=1
export OPENSSL_DIR="$OPENSSL_ROOT"
export OPENSSL_LIB_DIR="$OPENSSL_ROOT/lib"
export OPENSSL_INCLUDE_DIR="$OPENSSL_ROOT/include"
export OPENSSL_LIBS="ssl:crypto"

export CC_wasm32_unknown_unknown="$LLVM_BIN/clang --target=wasm32-unknown-unknown"
export AR_wasm32_unknown_unknown="$LLVM_BIN/llvm-ar"
export RANLIB_wasm32_unknown_unknown="$LLVM_BIN/llvm-ranlib"

echo "[1/2] Building wasm32-unknown-unknown with openssl-rs..."
cargo build --release --target wasm32-unknown-unknown

if command -v wasm-bindgen >/dev/null 2>&1; then
  echo "[2/2] Generating JS bindings with wasm-bindgen..."
  mkdir -p pkg
  wasm-bindgen \
    target/wasm32-unknown-unknown/release/openssl_wasm.wasm \
    --out-dir pkg \
    --target web
  echo "Done: pkg/ generated."
else
  echo "[2/2] wasm-bindgen CLI not found; skipped JS binding generation."
  echo "Install via: cargo install wasm-bindgen-cli"
fi
