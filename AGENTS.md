# AGENTS Guide

## Communication
- Reply to user in Chinese.
- Keep source code, identifiers, and comments in English.

## Package Manager
- Use `bun` for all Node.js dependency and script operations.

## Project Layout
- Core npm package source: `src/`
- High-level iMobileDevice interactions: `src/core/imobiledevice-client.ts`
- Browser demo app: `frontend/`

## Key Rule: Avoid Logic Duplication
- Do not re-implement usbmux/lockdown/AFC/InstProxy protocol logic in `frontend`.
- `frontend/src/main.ts` must consume root package exports from `webmuxd`.
- If behavior changes are needed, modify root package logic first, then wire it in frontend.

## Build & Validate
- Root build: `bun run build`
- Root lint: `bun run lint`
- Root test: `bun run test`
- Frontend build: `cd frontend && bun run build`

## Change Style
- Keep changes minimal, focused, and consistent with existing style.
- Prefer removing dead code over keeping legacy paths.
