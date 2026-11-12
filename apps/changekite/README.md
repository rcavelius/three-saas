# ChangeKite

Website inspection and monitoring. Anyone can run a free one-off scan (up to 25 pages: broken links, titles,
meta descriptions, canonicals, image alt text, sitemap, robots.txt, HTTPS/TLS/HSTS, mixed content) and get a
report under an unguessable link. Paid plans monitor sites on a schedule and email when something meaningful
changes.

## What works

| Area | Where |
| --- | --- |
| Free anonymous scan (streamed progress) | `/` → `POST /api/scan`; report at `/report/[id]`, JSON at `/api/report/[id]` |
| Accounts (Better Auth via `@repo/auth`, cookie prefix `sp`) | `/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`, `/accept-invitation/[id]`, `/account`, `/account/team`, `/account/billing` |
| Billing (`@repo/billing`, `CHANGEKITE_CATALOG`: Free / Solo $19 / Agency $79) | `/pricing`, `POST /api/billing/checkout`, `/api/billing/portal`, `/api/billing/webhook` |
| Monitored sites (plan `sites` gauge under `withOrgLock`) | `/dashboard`, `/dashboard/sites/[id]`, `/dashboard/sites/[id]/issues/[fingerprint]`, `/api/sites`, `/api/sites/[id]`, `POST /api/sites/[id]/scan` |
| Scheduled scans, alerts, retention | scheduler jobs in `src/lib/platform.ts` (see below) |
| PDF export (Agency, `pdfReports`) | `GET /api/reports/[id]/pdf` (pdfkit, org-scoped, 30/hour per org) |
| Ops | `/admin` (operators only), `/api/health`, `/api/cron/tick`, `/api/events` |
| SEO | `sitemap.xml`, `robots.txt`, JSON-LD (SoftwareApplication offers from the catalog, FAQPage, Article/HowTo), guides at `/guides` — see `docs/SEO.md` |

Without Stripe keys the app still runs: pricing shows the plans, checkout answers `503 billing_not_configured`,
everyone has free entitlements. Without `RESEND_API_KEY` every email is written to `ops_email_outbox` with status
`logged` and never leaves the server.

## Monitoring

- `sites.schedule` (every 60 s) enqueues `scan.site` jobs for due sites; next scan = now + plan `scanFrequencyHours`
  (Solo 24 h, Agency 6 h). Agency jobs are enqueued with an earlier `run_at` (priority queue).
- `scan.site` runs the existing scanner with plan `pagesPerScan`, saves the scan with `org_id`/`site_id`, and records
  issue *episodes* in `site_issues` (stable fingerprints: rule id + page + message with volatile numbers masked).
- Politeness across all orgs: at most `MONITOR_GLOBAL_CONCURRENCY` monitoring scans at once (DB leases in
  `scan_leases`, shared by every instance) and `MONITOR_HOST_SCANS_PER_HOUR` per target host. A job that cannot get a
  slot re-queues itself (not a failure).
- Failures retry through the queue (30 s, 60 s backoff). Three failures in a row → site status `unreachable` and one
  "Site unreachable" alert; the next successful scan sends "Site is back up". While a site is down, or robots.txt
  shuts ChangeKiteBot out, open issues are kept instead of being "resolved".
- Alerts only on meaningful change: down/up, home page status ok↔error, new critical issues, new broken internal
  links, certificate invalid/expired/expiring < 14 days, robots.txt blocking the whole site, score drop ≥ 10.
  The first scan is a silent baseline. One email per change set (`alerts` row, unique dedup key per site + change
  set); an issue that stays open is never re-alerted; a separate "resolved" email when criticals clear.
  Per-site mute and recipients (org members only, re-checked at send time; none chosen = all verified members).
- Downgrade/cancel: the oldest sites up to the new limit stay active, newer ones get `plan_locked` (paused, never
  deleted); upgrading unlocks them. Runs on `onPlanChanged`/`onSubscriptionCanceled` and hourly
  (`sites.enforce_limits`, also covers grace periods ending without a webhook).
- Retention: anonymous reports expire after `REPORT_RETENTION_DAYS`; account scans after the plan's `historyDays`
  (re-applied on plan change). `scans.cleanup` (hourly) deletes in batches of 500 and always keeps each site's latest
  scan.

## Access rules

- Every customer row has `org_id`; every query uses the org from `auth.requireOrg()` (never from the request).
  Another org's site, scan, report JSON or PDF answers 404. Mutating routes check `Origin`/`Sec-Fetch-Site`.
- Anonymous reports (`org_id IS NULL`) are capability links (128-bit ids). Account reports need org membership.
- Client IPs for every rate limit (scan, events, Better Auth) come from `TRUSTED_PROXY` via `@repo/ops getClientIp`;
  the auth route passes the resolved IP to Better Auth in a private header (any client copy is removed).
- `/admin` and `/api/admin/*` answer 404 unless `auth_user.role` is `operator` or `owner`.

### Granting the operator role (owner only, from a database shell)

```sql
UPDATE auth_user SET role = 'owner' WHERE email = 'you@example.com';   -- or 'operator'
```

There is no self-service elevation; the role is never read from client input.

## Environment

See `.env.example`. Required in production: `APP_URL`, `DATABASE_URL`, `SESSION_SECRET` (≥ 32 chars), `CRON_SECRET`,
`TRUSTED_PROXY`, `RUN_SCHEDULER=1` (or an external cron calling `POST /api/cron/tick` with
`Authorization: Bearer $CRON_SECRET`). Optional: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` +
`EMAIL_FROM`, `OWNER_ALERT_EMAIL`, `SUPPORT_EMAIL`, `HEALTH_DETAILS_SECRET`, `UPTIME_URLS`,
`MONITOR_GLOBAL_CONCURRENCY` (2), `MONITOR_HOST_SCANS_PER_HOUR` (4), `SCAN_RATE_LIMIT_PER_HOUR` (5),
`SCAN_TARGET_LIMIT_PER_HOUR` (10), `MAX_CONCURRENT_SCANS` (4), `REPORT_RETENTION_DAYS` (90).

## Run and test

```sh
cd apps/changekite
npx next dev --port 3001
npx vitest run                     # unit + integration (PGlite, FakeStripe with real signatures, virtual web)
npx tsc -p tsconfig.json --noEmit
npx next build && npx next start --port 3001
```

Migrations (`CORE → AUTH → BILLING → OPS → CHANGEKITE`, `src/lib/migrations.ts`) run on first database use.

## Layout

- `src/lib/platform.ts`: composition root (DB, auth, mailer, billing, scheduler, jobs); `getPlatform()` singleton
- `src/lib/monitoring/`: `sites.ts` (gauge, settings, downgrade, purge), `monitor.ts` (schedule, scan job, leases,
  issue episodes, alert rows), `diff.ts` (fingerprints, facts, change rules), `alerts.ts` (email delivery)
- `src/lib/scanner/`: crawler and pure checks (unchanged behaviour)
- `src/proxy.ts`: nonce CSP; `src/instrumentation.ts`: 60 s in-process scheduler tick when `RUN_SCHEDULER=1`
- `src/test/`: integration harness and tests through the real route handlers
