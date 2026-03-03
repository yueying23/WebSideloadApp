# backend (Cloudflare Workers demo)

This demo shows how to run the Wisp proxy path (`/wisp/`) on Cloudflare Workers by combining:

- Wisp protocol handling from `@mercuryworkshop/wisp-js`
- Outbound TCP from `cloudflare:sockets`

It is a minimal proof-of-concept based on:

- `../../AssppWeb/backend/src/services/wsProxy.ts`
- `../wisp-js`

The Worker also serves static files from `../frontend/dist` via Wrangler `assets`.

## What this demo supports

- `GET /healthz` health check
- `WS /wisp/` Wisp v2 server path
- Apple host allowlist + port `443` only
- Optional token auth (`?token=...`)

## What this demo does not support

- UDP streams (disabled)
- Legacy wsproxy path (for example `/wisp/example.com:443`)
- Asspp backend HTTP APIs (`/api/*`)

## Setup

```bash
cd backend
bun install
bun run types
bun run check
```

`bun run check` will build frontend first, then run Worker dry-run deploy.

## Local dev

```bash
cd backend
bun run dev
```

Default local URL: `http://127.0.0.1:8787`

## Deploy

```bash
cd backend
bun run deploy
```

## Optional auth

Set one of these as Worker secrets:

1. `ACCESS_TOKEN_HASH` (preferred): expected token value directly
2. `ACCESS_PASSWORD`: plaintext password, Worker computes SHA-256 hex and compares with `?token=`

```bash
cd backend
bunx wrangler secret put ACCESS_TOKEN_HASH
# or
bunx wrangler secret put ACCESS_PASSWORD
```
