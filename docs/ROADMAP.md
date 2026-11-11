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
- HookPilot: anonymous endpoints, capture of all methods with body/rate/history limits, live inspector with masked secrets, test payloads, API docs, expiry cleanup cron — 48 tests, smoke-tested end to end.
- All three pass `next build`.

Known follow-ups from Phase 2: trusted client-IP header config per host; nonce-based CSP (currently `'unsafe-inline'` scripts); schedule SiteProof expired-report cleanup; zip downloads for DataPolish batch (needs `fflate`); SiteProof PDF export; HookPilot replay to verified targets.

## Phase 3: Commercial systems — next
- `@repo/auth`: email + password and magic-link sign-in, sessions, email verification, account deletion.
- `@repo/billing`: Stripe Checkout, Customer Portal (upgrade/downgrade/cancel), idempotent webhook handler, entitlements per plan, failed-payment emails.
- Plan limits enforced server-side in each app; SiteProof scheduled scans and alert emails; HookPilot saved endpoints, teams, replay to verified targets; DataPolish account-synced workflows.

## Phase 4: Autonomous operations
- Worker process per app, job failure incidents, uptime heartbeat, budget alerts, backup verification.
- Help center + AI support assistant with strict scope (no refunds/legal commitments/private data), ticket categorisation, escalation queue.
- Owner dashboard (MRR, new subs, cancellations, churn, conversion, traffic, costs, failed jobs, incidents) from real data; operator console.

## Phase 5: SEO and deployment
- Sitemaps, structured data, guides, internal linking, Search Console instructions, deployment configs (Dockerfiles / platform configs), CI.

## Phase 6: QA
- Playwright E2E (signup → checkout in Stripe test mode → cancel), mobile and accessibility checks, security boundary tests, data deletion, job retries.
