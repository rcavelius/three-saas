# HookPilot

Webhook endpoint generation, capture and live inspection. Next.js 16 app in the `3sites` monorepo (port 3003).

## What works

- **One-click anonymous endpoints** (`POST /api/endpoints`): random 144-bit slug, 24 h expiry, owner identified by a random
  256-bit `hp_owner` cookie (HttpOnly, SameSite=Lax, Secure in production, `Path=/api`); only its SHA-256 is stored.
  Max 3 active endpoints per owner, 10 creations per IP per hour.
- **Capture** at `/h/<slug>[/any/path][?query]` for GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. Body read as a stream:
  first 256 KB stored (flagged `truncated` beyond), > 1 MB rejected with 413 (Content-Length checked first, stream aborted
  otherwise). Rate limits per IP (240/min) and per endpoint (120/min) → 429 + Retry-After. Unknown → 404, expired → 410,
  deleted → 404. Nothing from captured requests is ever fetched or forwarded.
- **History limit**: newest 100 requests per endpoint are kept; older ones are pruned on insert (never rejected).
- **Custom responses**: status 200–599, `application/json` or `text/plain` only, ≤ 4 KB; capture responses always carry
  `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`.
- **Inspection API** (owner-checked, 404 for anything not yours, Origin check + JSON-only on mutations, zod-validated):
  list/get/update/delete endpoints; list requests with cursor pagination (`before`), live polling (`after`), filters
  (`method`, `q` search over path/query/headers/body, `from`/`to`); get/delete one request; clear all.
- **Inspector UI** (`/e/<id>`): live list (2 s polling, paused when the tab is hidden or by the user), method badges, arrow-key
  / j/k navigation, aria-live announcements; detail pane with query table, headers table (secrets masked until revealed),
  body as JSON tree / form fields / raw / hex, copy as cURL (masked unless revealed), copy body; search and filters; test
  payload generator (sent from the browser to your own capture URL); settings (rename, custom response, expiry, delete).
- **Expiry cleanup**: `cleanupExpired()` hard-deletes expired and soft-deleted endpoints (requests cascade) in batches;
  `GET|POST /api/cron/cleanup` with `Authorization: Bearer $CRON_SECRET` (constant-time compare; 503 if unset).
- Pages: `/` (create endpoint hero), `/pricing` (paid plans marked not on sale; buttons go to `/signup` placeholder),
  `/docs`, `/privacy` and `/terms` (drafts, marked as requiring legal review).
- App-wide security headers in `next.config.ts` (CSP, nosniff, Referrer-Policy no-referrer, frame-ancestors 'none', HSTS in prod).

## Run

```bash
# from the repo root (dependencies are installed at the root)
cp apps/hookpilot/.env.example apps/hookpilot/.env.local   # optional; defaults work
npm run dev -w @apps/hookpilot                              # http://localhost:3003
```

Data lives in `apps/hookpilot/.data/hookpilot` (PGlite, real Postgres in WASM). Set `DATABASE_URL=postgres://…` for a
real server; migrations run automatically on first use.

Schedule cleanup (e.g. every 15 minutes):

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/cleanup
```

## Test

```bash
cd apps/hookpilot
npx vitest run                       # PGlite in memory; route handlers called with Request objects
npx tsc -p tsconfig.json --noEmit
```

## Notes and known limits

- Client IP comes from `X-Forwarded-For` / `X-Real-IP`; deploy behind a proxy that overwrites them, or IP rate limits can
  be dodged.
- Header order: the Fetch `Headers` API lower-cases names and iterates alphabetically, so original order and casing are lost.
- Body search is case-insensitive for ASCII; non-ASCII text matches exact bytes.
- Accounts, paid plans and request replay (outbound, via `@repo/security`) are not implemented yet; `owner_user_id` exists
  in the schema for accounts.
- CSP uses `'unsafe-inline'` for scripts because Next injects inline bootstrap scripts; a nonce-based policy is a later step.
