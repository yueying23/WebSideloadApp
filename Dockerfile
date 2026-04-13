# Multi-stage Docker build for the sideload.js frontend.

# --- Stage 1: build ---
FROM oven/bun:1.3-alpine AS build
WORKDIR /app

# Copy manifests first for dependency layer caching.
COPY package.json bun.lock ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY dependencies/webmuxd/package.json dependencies/webmuxd/
COPY wasm/openssl/package.json wasm/openssl/
COPY wasm/libcurl-wasm/package.json wasm/libcurl-wasm/
COPY wasm/zsign-wasm/package.json wasm/zsign-wasm/
COPY wasm/zsign-wasm/js/package.json wasm/zsign-wasm/js/

RUN bun install --frozen-lockfile --ignore-scripts

# Copy all sources (filtered by .dockerignore).
COPY . .

# Build WASM dist bundles (src→dist copies) then frontend.
RUN bun run build:wasm:dist && cd frontend && bun run build

# --- Stage 2: serve ---
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 3000
