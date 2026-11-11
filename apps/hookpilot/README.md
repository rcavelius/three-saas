# HookPilot

Webhook endpoint generation, capture, live inspection and secure replay. Next.js 16 app in the `3sites` monorepo,
composed from the shared packages (`@repo/auth`, `@repo/billing`, `@repo/ops`, `@repo/security`, `@repo/database`).

## Architecture

- `src/lib/platform.ts` — composition root (server only): one DB handle (singleton on `globalThis`), migrations
  `[CORE, AUTH, BILLING, OPS, HOOKPILOT]`, Better Auth (`cookiePrefix: "hp"`, branded emails, seats from billing),
  billing (`HOOKPILOT_CATALOG`, Stripe from env or an "unconfigured" gateway), outbox mailer, scheduler + jobs.
- `src/proxy.ts` — nonce CSP for pages (`@repo/ops/next` `cspProxy`); `/api` and `/h` set their own headers in `next.config.ts`.
- `src/instrumentation.ts` — 60 s scheduler tick when `RUN_SCHEDULER=1`; `/api/cron/tick` for external cron.

## What works

- **Capture** `/h/<slug>[/path][?query]` (144-bit random slug, no auth, never reveals data). Order of checks: per-IP rate
  limit (client IP only from `TRUSTED_PROXY`'s header) → endpoint state (404/410/423) → per-endpoint rate limit → payload
  caps from the plan (413) → monthly quota via atomic `billing.consumeUsage` (429 `quota_exceeded` JSON, one 80% email per
  period) → store, prune to the plan's `requestsStored`. HookPilot's own cookies are stripped from stored headers.
- **Accounts**: sign-up with email verification, login, reset, sessions, delete account (purges the org's endpoints,
  requests, destinations, replay logs; cancels Stripe). Endpoints belong to the session's active organization
  (`endpoints.org_id`, migration `hookpilot_0002`); anonymous endpoints keep working with the `hp_owner` cookie and can be
  claimed into the workspace (only those matching the cookie) up to the plan limit. Endpoint count = gauge under
  `withOrgLock`.
- **Plans** from the catalog (Free / Developer $9 / Pro $29): endpoints, monthly requests, payload/stored size, history,
  seats, replay. Paid endpoints never expire; free 24 h (extendable to 7 days). Downgrade pauses (locks) excess endpoints,
  upgrade unlocks them (hook + hourly job).
- **Retention job** (`hookpilot.retention`, 15 min): expired/deleted endpoints, requests older than each owner's
  `historyDays`, in batches; `usage:captured_requests` incident when total rows pass `HP_STORED_ROWS_CEILING`.
- **Replay** (Developer/Pro): destinations with challenge verification (`{"type":"hookpilot.verify","challenge"}` → echo),
  replay only by destination id via `@repo/security` `safeDeliver` (public IPs, 80/443, no redirects, 1 MB / 64 KB caps),
  sensitive headers opt-in per replay, signature-staleness warning, per-org (30/min) and per-destination (10/min) limits,
  audit rows, "with retries" through the job queue (max 5, backoff 10/20/40/80 s, stops at first 2xx).
- **Masking** of sensitive headers, query params, JSON/form secret fields and card numbers in the inspector, cURL export
  and replay preview; reveal per view.
- **Live inspector**: `?after=` cursor + ETag/If-None-Match (304), gapless catch-up (`hasMore`), dedupe, exponential
  backoff with a visible "reconnecting" state, pause when hidden, manual refresh (`src/lib/live-poller.ts`).
- **Teams**: Pro seats via invitations (seat limit also checked when inviting); members see all org endpoints; only
  owner/admin delete endpoints or manage destinations; only the owner manages billing.
- Pages: `/`, `/pricing` (catalog + FAQ + JSON-LD), `/docs`, `/guides/*`, auth pages, `/app`, `/account`,
  `/account/team`, `/account/billing`, `/account/destinations`, `/admin`, `/e/<id>` inspector, sitemap, robots.

## Granting the ops dashboard

`/admin` is visible only to `auth_user.role` `operator` or `owner` (404 for everyone else). There is no self-service
elevation; the owner runs, against the production database:

```sql
UPDATE auth_user SET role = 'operator' WHERE email = 'you@example.com';
```

## Run

```bash
cp apps/hookpilot/.env.example apps/hookpilot/.env.local   # optional; defaults work locally
npm run dev -w @apps/hookpilot                              # http://localhost:3003
```

Local data lives in `apps/hookpilot/.data/hookpilot` (PGlite). Emails land in the `ops_email_outbox` table when
`RESEND_API_KEY` is unset (read the verification link from there in development).

## Test

```bash
cd apps/hookpilot
npx vitest run                       # PGlite in memory, FakeStripe with signed webhooks, loopback HTTP fixture for replay
npx tsc -p tsconfig.json --noEmit
```

Replay tests use `@repo/security/testing`'s loopback policy against a local `node:http` server only; the adversarial cases
run under the production public-only policy, where nothing is ever connected to.

## Notes and known limits

- With `TRUSTED_PROXY=none` (default) every client shares one rate-limit bucket: set it to match the deployment.
- Header order: the Fetch `Headers` API lower-cases names and iterates alphabetically, so original order and casing are lost.
- Replay sends to the destination URL exactly; the captured sub-path and query are not appended.
- The quota race test runs on PGlite (one connection, async interleaving); production atomicity comes from the single
  `INSERT … ON CONFLICT … WHERE` statement in `@repo/billing`.
