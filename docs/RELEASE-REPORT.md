# Release report — 2026-11-11 (commit after `ebf5da1`)

Scope: Phase 3 (accounts, billing), security hardening, product features, operations automation, SEO, deployment preparation. All results below were produced on this machine from the `main` branch. **PASS** = executed and passed; **FAIL** = executed and failed; **NOT TESTED** = not executed, with the reason.

## Summary verdict

**Not ready for real customers yet.** The software passes every gate that can run without external accounts. Taking real money and sending real email requires owner actions (Stripe verification, domains, email DNS, hosting, legal review) and the gates marked NOT TESTED below, which need those accounts, must pass first. See [OWNER-ACTIONS.md](OWNER-ACTIONS.md).

| App | Ready for real customers? | Blocking items |
|---|---|---|
| ChangeKite | No — ready for a private beta once deployed | Stripe test-mode lifecycle against real Stripe, real email delivery, real-Postgres run, legal review |
| DataPolish | No — the free tool could launch as soon as it is deployed and legal pages are reviewed; paid plans need the same as above | Same as ChangeKite |
| WebhookTrail | No — same as ChangeKite, plus an abuse-handling process (public capture URLs) | Same as ChangeKite + operator abuse runbook |

## Gate results

### Automated tests (vitest; unit + integration on PGlite = real Postgres compiled to WASM)

| Workspace | Files | Tests | Result |
|---|---|---|---|
| packages/database | 1 | 9 | PASS |
| packages/config | 1 | 3 | PASS |
| packages/monitoring | 1 | 2 | PASS |
| packages/security | 5 | 177 | PASS |
| packages/auth | 5 | 55 | PASS |
| packages/billing | 4 (+1 skipped) | 34 (+2 skipped: need a Stripe test key) | PASS |
| packages/ops | 9 | 84 | PASS |
| apps/changekite | 10 | 102 | PASS |
| apps/datapolish | 16 | 143 | PASS |
| apps/webhooktrail | 13 | 105 | PASS |
| **Total** | | **714 passed, 0 failed, 2 skipped** | **PASS** |

Typecheck (`tsc --noEmit`) on all 10 workspaces: **PASS**.

### Production builds

`next build` for ChangeKite, DataPolish, WebhookTrail (sequential, BelowNormal priority): **PASS** (all three). Standalone server output smoke-tested for DataPolish: **PASS**. Docker image build: **NOT TESTED** (Docker is not installed on this machine; CI or the hosting platform will build it).

### End-to-end (headless Microsoft Edge against `next start` production servers)

| App | Suite | Result |
|---|---|---|
| ChangeKite | `e2e/run-smoke.sh`: 39 checks — public pages, nonce CSP, axe, 390 px, real anonymous scan of example.com, sign-up → email verification → dashboard → plan enforcement → billing without Stripe → /admin 404 → delete account → login refused | PASS |
| DataPolish | Playwright `e2e/*.spec.ts`: 3 tests — no-upload privacy proof (marker file through clean/merge/batch/ZIP, every request inspected), public pages a11y/CSP/390 px, account lifecycle | PASS |
| WebhookTrail | `e2e/smoke.mjs` two phases: 32 checks — anonymous capture with masking, sign-up/verify, claim endpoints, billing without Stripe, /admin 404, delete account, CSP, 390 px, axe | PASS (after fixing a bug it found: the claim confirmation message never showed) |

### Requirement-by-requirement

| Requirement | Result | Evidence / note |
|---|---|---|
| Authentication tests (sign-up, verification, login/logout, reset, sessions, deletion) | PASS | @repo/auth 55 tests via Better Auth handler; app-level tests in all three apps; e2e in all three |
| Cross-tenant data access | PASS | Per-app tests: user B gets 404 on every resource route (sites/reports/PDF; workflows; endpoints/requests/replay/destinations); `requireOrg` verifies membership in the DB |
| Stripe subscription lifecycle — FakeStripe with real signature verification | PASS | checkout → active, upgrade/downgrade, payment failure + 7-day grace, recovery, cancel at period end, deletion, duplicates, out-of-order events, reconcile of dropped events, bad signatures (billing 34 tests + app webhook-route tests) |
| Stripe subscription lifecycle — real Stripe test mode | NOT TESTED | No Stripe account/test key. Needs owner action 2; then run `packages/billing` real-mode tests and the checklist in DEPLOYMENT.md step 6–7 |
| Server-enforced entitlements / no client-side plan trust | PASS | Entitlements only from `billing.getEntitlements`; routes ignore plan/org fields in bodies (tested) |
| Atomic usage accounting | PASS (PGlite) / NOT TESTED (real Postgres) | 50-way concurrent consume never exceeds limit; WebhookTrail 40 concurrent captures at limit store exactly 5. PGlite serialises connections, so true multi-connection concurrency is untested |
| Rate-limit and abuse tests | PASS | Auth limits per trusted IP (spoofed X-Forwarded-For cannot dodge), scan limits per IP and per target host, capture per IP/endpoint, replay per org/destination, events endpoint |
| SSRF / replay safety | PASS | 177 security tests incl. 20 adversarial URL spellings, DNS rebinding, redirect-to-private, metadata, IPv6-mapped/NAT64; replay only to challenge-verified destinations, no redirects followed |
| CSRF / origin checks | PASS | Better Auth origin checks on; all mutating app routes reject cross-origin (tested); billing routes require Origin or `Sec-Fetch-Site: same-origin` |
| CSP without `unsafe-inline` scripts | PASS | Nonce CSP via `proxy.ts` in all three apps; zero CSP violations in e2e |
| Trusted proxy / real client IP | PASS | `TRUSTED_PROXY` modes with adversarial tests; Better Auth fed the resolved IP through an overwritten internal header |
| Distributed rate limiting | PASS (design) / NOT TESTED (multi-instance) | Counters live in the shared Postgres database; multi-instance behaviour not exercised locally |
| Payload / upload limits | PASS | WebhookTrail 413 by plan (streamed cap); ChangeKite page/body caps; DataPolish in-browser size, row and memory caps (value fences, documented as such) |
| Scheduled job tests (retry, dead letter, schedules) | PASS | ops scheduler tests; app jobs driven through `scheduler.tick` (scans, alerts, cleanup, retention, reconcile, replay retries) |
| Data deletion | PASS | Account deletion cancels the subscription and purges org data (tested in each app and e2e); retention jobs delete expired data in batches |
| Mobile usability (390 px, no horizontal scroll) | PASS | e2e in all three apps |
| Accessibility (axe WCAG 2.1 AA, serious/critical) | PASS | 0 serious/critical violations on all scanned pages in all three apps; manual screen-reader testing NOT TESTED |
| Vulnerability and dependency checks | PASS | `npm audit`: 0 vulnerabilities (all deps). SheetJS comes from its official CDN tarball (not covered by npm advisories); 0.20.3 includes the fixes for CVE-2023-30533 and CVE-2024-22363 |
| Real email delivery (Resend) | NOT TESTED | No account/key; emails verified through the outbox table and mocked Resend API tests |
| Real Postgres (node-postgres pool) | NOT TESTED | No Postgres on this machine; all DB tests use PGlite. First deployment step must run the test suite against the real database (or add a Postgres service job to CI) |
| Backup verification | NOT TESTED | Requires Neon account/API key |
| Uptime monitoring | PASS (internal) / NOT TESTED (external) | `/api/health` + uptime job tested; external monitor needs the deployed URL |
| Owner dashboard metrics from real data | PASS | `getOwnerMetrics` tested with exact fixture values against the real auth/billing schema; zero-data returns zeros/nulls |

## Defects found and fixed during this milestone

- `instanceof` error checks failed across Next.js server chunks (a 409 became 500) — switched to shape checks in auth, billing, ops.
- Ops metrics grace period disagreed with billing (14 vs 7 days) and counted other apps' ignored Stripe events.
- Better Auth seat limit was only enforced on acceptance — invitations now refused when seats are full.
- Better Auth rate limiting could read a client-forgeable IP — now fed the trusted-proxy IP.
- New schedules could miss their first tick; billing POSTs without Origin were accepted.
- WebhookTrail: session cookie captured in webhook headers (fixed by the integrator); claim confirmation never displayed (found by release smoke).
- ChangeKite `/account/team` overflowed at 390 px; DataPolish contrast tokens failed axe; `Math.max(...rows)` stack overflow on large files.

## Security posture notes (not defects, require attention)

- WebhookTrail hosts public capture URLs: abuse (phishing landing pages are prevented by text/plain + `CSP: sandbox`, but spam/volume abuse is possible) needs an operator runbook and a kill switch per endpoint (exists: delete/pause).
- ChangeKite crawls third-party sites on user request: polite crawling, robots.txt, per-host limits and a `/bot` page are in place; an opt-out contact address must be published before launch.
- Privacy policy and terms are drafts and must be reviewed by a lawyer.

## Update — real infrastructure (2026-11-11, later)

Executed against real services; nothing below was simulated.

| Check | Result | Evidence |
|---|---|---|
| Docker images (all three) build and boot against PostgreSQL 17 | PASS | GitHub Actions, run on commit 46e1902: pages 200, nonce CSP, cron auth 401/200, migrations applied, non-root user |
| Real PostgreSQL 17: multi-connection concurrency (job claims, rate limits, quotas, scheduler), Better Auth on node-postgres, all migration chains | PASS | GitHub Actions `postgres` job |
| Backup and restore (pg_dump/pg_restore, every table's row count + checksum identical) | PASS | GitHub Actions `postgres` job (backup drill) |
| Unit/integration suites, typecheck, production builds, npm audit (CI) | PASS | GitHub Actions `test` job |
| DataPolish staging online with real infrastructure | PASS | https://datapolish-staging.netlify.app (password-protected, noindex) on Netlify + Netlify Postgres |
| Staging protection (no password → 401 on pages and APIs, prefetch-header bypass refused) | PASS | curl against staging |
| Hosted scheduled jobs | PASS | Netlify scheduled function: 200 every 5 min in Netlify request logs; help-article sync and email jobs ran hosted |
| Real transactional email (Resend) | PASS | verification, plan-changed x3, canceled emails show "delivered" in Resend (sent to Resend's test inbox) |
| Email verification link end to end | PASS | link from the delivered email verified and signed in the test user on staging |
| Stripe test-mode Checkout session from the app | PASS | real `checkout.stripe.com` session created by staging |
| Stripe Customer Portal session | PASS | real `billing.stripe.com` session created by staging |
| Stripe webhooks: subscribe → upgrade → cancel at period end → cancel | PASS | real signed webhooks; staging entitlements Pro → Business (5 seats) → cancel scheduled → Free |
| No-upload privacy proof + public-page a11y/CSP/390 px on staging | PASS | Playwright (headless Edge) against the staging URL |
| AI support chat answering from docs | PASS (live) | staging chat answered a cancellation question in AI mode via Netlify AI Gateway (budget capped at $1/month on staging) |
| Completing Stripe Checkout with a test card in the browser | NOT TESTED | entering card data in a hosted page is not something the agent may do; subscription created through Stripe's API with a test payment method instead |
| Failed renewal → past_due → grace → free on real Stripe | NOT TESTED | needs Stripe test clocks; covered by FakeStripe tests |
| Owner incident emails on staging | NOT TESTED | OWNER_ALERT_EMAIL not set (owner's address not shared with external services without approval) |
| Restore of the hosted Netlify database snapshot | NOT TESTED | restores are destructive and need owner confirmation; Netlify takes a snapshot on every publish |
| ChangeKite and WebhookTrail hosted staging | NOT TESTED | not deployed yet (next step) |
