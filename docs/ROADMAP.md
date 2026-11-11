# Roadmap and status

Status reflects verified work only. "Done" means implemented and covered by passing tests.

## Phase 1: Foundation — done
- npm workspaces monorepo, shared TS config, git.
- `@repo/database`: pg/PGlite client, core schema, migration runner, Postgres job queue with backoff and stale-lock reclaim, rate limiter (8 tests).
- `@repo/config`: env validation and integration detection (3 tests).
- `@repo/monitoring`: JSON logger with secret redaction (2 tests).
- Architecture, cost and owner-action docs.

## Phase 2: Core free tools — done (2026-11-11)
- `@repo/security`: SSRF-safe fetch (public-IP only, DNS pinning, per-hop redirect checks, size/time caps, TLS inspection) — 142 tests.
- SiteProof: polite crawler (robots.txt, page/depth/time caps), status, broken links, title/meta, canonical, alt text, sitemap, robots, HTTPS/cert/HSTS, mixed content; free scan UI with streamed progress, shareable report — 60 tests, smoke-tested on real sites.
- DataPolish: in-browser CSV/XLSX engine (trim, blanks, dedupe, headers, dates with ambiguity flagging, numbers, find/replace, column mapping, merge), Web Worker, before/after preview, CSV/XLSX download, saved workflows, batch — 96 tests, driven in a browser.
- WebhookTrail: anonymous endpoints, capture of all methods with body/rate/history limits, live inspector with masked secrets, test payloads, API docs, expiry cleanup cron — 48 tests, smoke-tested end to end.
- All three pass `next build`.

Known follow-ups from Phase 2: trusted client-IP header config per host; nonce-based CSP (currently `'unsafe-inline'` scripts); schedule SiteProof expired-report cleanup; zip downloads for DataPolish batch (needs `fflate`); SiteProof PDF export; WebhookTrail replay to verified targets.

## Phase 3: Commercial systems — done (2026-11-11), Stripe test mode via FakeStripe
- `@repo/auth` (Better Auth): email/password, verification, reset, sessions, organizations/teams, seat limits, account deletion with data purge, trusted-IP rate limits.
- `@repo/billing`: Stripe Checkout, Customer Portal, plan changes, dunning grace period, verified idempotent out-of-order-safe webhooks, reconciliation, server-side entitlements, atomic usage; runs "not configured" without keys; refuses live keys unless the owner authorizes.
- Integrated in all three apps with account, team, billing and admin pages.

## Phase 4: Autonomous operations — done
- `@repo/ops`: Postgres scheduler (retry, dead letters, escalation), incidents with dedup/acknowledgement, owner alerts (critical immediately, daily warning digest), health/uptime, budgets and usage ceilings, billing health, owner metrics from real rows, first-party analytics, nonce CSP.
- Not built: AI support assistant and ticket system (help pages + FAQ exist); provider cost import APIs (costs are entered in /admin).

## Phase 5: SEO and deployment — done (pending owner accounts)
- Sitemaps, robots, canonical URLs, JSON-LD, FAQ, original guides per app; Search Console steps in each app's docs/SEO.md.
- Dockerfile, Fly configs, deployment guide, cost model at 0/100/1,000 customers.

## Phase 6: QA — release gates run; see RELEASE-REPORT.md
- Remaining NOT TESTED gates need owner accounts: real Stripe test mode, real email, real Postgres, Docker image, external uptime, backups.
