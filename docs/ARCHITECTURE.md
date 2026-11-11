# Architecture

Three independently deployable SaaS products in one npm-workspaces monorepo.

```
apps/
  siteproof/    Website monitoring and health audits       (Next.js, Node runtime, port 3001)
  datapolish/   Spreadsheet cleanup, in-browser processing (Next.js, port 3002)
  webhooktrail/    Webhook capture and inspection             (Next.js, Node runtime, port 3003)
packages/
  config/       Env validation (zod), integration detection, dev ports
  database/     Postgres client (pg or PGlite), core schema, migrations, job queue, rate limiter
  monitoring/   Structured JSON logging with secret redaction
  security/     SSRF-safe outbound fetch (DNS pinning, private-IP blocking, redirect re-validation)
  auth/         (Phase 3) sessions, password + magic link, account deletion
  billing/      (Phase 3) Stripe checkout, portal, webhook handling, entitlements
  ui/           (Phase 3+) shared accessibility primitives only; each app keeps its own brand
docs/
```

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Language / framework | TypeScript, Next.js 16 App Router, React 19 | One stack for marketing pages, app UI and API routes. |
| Styling | Tailwind CSS v4, per-app design tokens | Shared tooling, three separate visual identities. |
| Package manager | npm workspaces | Already installed; no extra tooling to maintain. |
| Database | PostgreSQL in production; PGlite (Postgres in WASM) for local dev and tests | Same SQL everywhere, no Docker needed on the dev PC, tests run against real Postgres semantics. |
| ORM / migrations | Drizzle query builder + a small forward-only SQL migration runner | Explicit SQL, works on both drivers, no drizzle-kit state to sync. |
| One DB per app | Yes | Each product can be deployed, sold or shut down independently. Core tables (users, sessions, subscriptions, jobs, incidents, analytics, rate limits, costs) are created in each. |
| Background jobs | Postgres queue (`FOR UPDATE SKIP LOCKED`), exponential backoff, stale-lock reclaim | No Redis to run or pay for; jobs survive restarts; failures are queryable for the owner dashboard. |
| Rate limiting | Fixed-window counters in Postgres | Works across instances; adequate at early scale. |
| Analytics | First-party `analytics_events` table, cookie-less | No third-party tracker, no consent banner needed for analytics, owner dashboard reads real data. |
| Tests | Vitest (unit + integration with PGlite and local HTTP fixtures); Playwright planned for E2E in Phase 6 | Fast, runs headless. |

## Security boundaries

- **SiteProof outbound requests** all go through `@repo/security` safe fetch: http/https only, ports 80/443, every DNS answer must be public unicast, the socket is pinned to the validated IP (defeats DNS rebinding), redirects are followed manually and re-validated per hop, body size and time are capped, no cookies or credentials are sent. The crawler respects robots.txt and never submits forms.
- **WebhookTrail** never makes outbound requests from captured data. Capture responses are served as `text/plain`/`application/json` with `nosniff` and `CSP: sandbox` so users cannot host HTML/JS on our domain. Endpoint slugs carry at least 128 bits of randomness; owner tokens are stored as SHA-256 hashes. Replay (later) will only target verified destinations through the same safe fetch.
- **DataPolish** processes files in the browser; file contents are never uploaded on the free tier. Cloud processing (paid batch, later) will use size limits, encrypted object storage and automatic deletion.
- Secrets live only in environment variables; logs pass through `redact()`.

## Hosting plan (recommended, not yet provisioned)

| App | Runtime need | Recommended host |
|---|---|---|
| SiteProof | Long-running outbound crawls, raw TLS checks, scheduled scan worker | Container platform (Fly.io or Render): web process + worker process from one image |
| WebhookTrail | Always-on capture endpoint, streamed body limits, predictable cost under abusive traffic | Container platform (Fly.io or Render), small always-on machine |
| DataPolish | Mostly static + client-side processing | Same container platform for consistency, or Netlify / Cloudflare Pages (both available as connectors here) |
| Databases | Postgres x3 | Neon (serverless Postgres, branches for previews) or the platform's managed Postgres |
| Email | Transactional | Resend (or Postmark) with verified sending domain per brand |
| Payments | Subscriptions | Stripe (test mode until the owner completes account verification) |

Serverless platforms are possible for DataPolish, but SiteProof's crawler and TLS checks and WebhookTrail's always-on capture are cheaper and simpler on small containers.

See [COSTS.md](COSTS.md) for operating cost estimates and [OWNER-ACTIONS.md](OWNER-ACTIONS.md) for what needs a human.
