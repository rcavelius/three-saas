# Deployment guide

## Production (live since 2026-11-12): Cloudflare Workers + Containers

All three apps run on Cloudflare (Workers Paid plan), each on its own domain, **behind a site password until the owner approves a public launch**:
https://gridrinse.com, https://changekite.com, https://webhooktrail.com (`www.` redirects to the apex).

```
browser / Stripe ──► Cloudflare edge ──► Worker  (deploy/cloudflare/src/index.ts, one per app)
                                           │  www → apex redirect; Basic-auth gate while STAGING_PASSWORD is set
                                           │  /__edge/email: mail relay → Cloudflare Email Sending (send_email binding)
                                           │  Cron Trigger */30 → POST /api/cron/tick inside the container
                                           ▼
                                  Container (Durable Object "main", instance basic: 1 GiB, ¼ vCPU)
                                           │  our Docker image (Dockerfile, APP=<name>), port 8080, RUN_SCHEDULER=1
                                           │  sleeps after 10 min without requests (max_instances 1)
                                           ▼
                                  Neon Postgres (project quiet-forest-89133369, one database per app, pooled endpoint)
```

- **Gate exemptions** (they authenticate themselves): `/api/billing/webhook` (Stripe signature), `/api/health`, `/api/cron/` (bearer), and WebhookTrail's capture URLs `/h/…`.
- **Secrets**: one GitHub Actions secret per app, `WORKER_SECRETS_<APP>` (JSON: DATABASE_URL, SESSION_SECRET, CRON_SECRET, HEALTH_DETAILS_SECRET, EMAIL_RELAY_SECRET, STAGING_PASSWORD, OWNER_ALERT_EMAIL, and for GridRinse the Stripe test key + webhook secret), uploaded with `wrangler secret bulk` on every deploy. Copies live only in the git-ignored `.secrets/cloudflare-<app>.json` on the owner's PC. The site password is in `.secrets/SITE-PASSWORD.txt` (any username). When a secret changes, the Worker restarts the container on the next request so it picks up the new values.
- **Non-secret settings** are `vars` in `deploy/cloudflare/wrangler.<app>.jsonc` (APP_URL, EMAIL_FROM, TRUSTED_PROXY=cloudflare, IDLE_MINUTES, …).
- **Deploys**: `.github/workflows/deploy-cloudflare.yml` runs automatically after CI passes on `main` (all three, one at a time) or manually from the Actions tab (one app). It builds the image, deploys Worker + Container, uploads secrets, then smoke-tests the live domain. The deploy token (`CLOUDFLARE_API_TOKEN`) is limited to Workers, Containers, R2/KV and to DNS/Workers routes on the three zones.
- **Email**: apps send through their own Worker (`EMAIL_RELAY_URL`/`EMAIL_RELAY_SECRET`) → Cloudflare Email Sending, 3,000 emails/month included in Workers Paid, then $0.35 per 1,000. Each domain must be onboarded once in the dashboard (Email Service → Email Sending → Onboard Domain), which adds SPF/DKIM/DMARC records on `cf-bounce.<domain>`.
- **Scheduled work**: the in-process scheduler ticks every 60 s while the container is awake; the Cron Trigger wakes it every 30 min.
- **Spending**: budget alerts at $10, $15, $30 and $60 (Billing → Billable usage), emailed to the owner. Compute is capped by `max_instances: 1` and the `basic` instance type per app.
- **Backups**: `.github/workflows/backup.yml` nightly (03:17 UTC): `pg_dump` of each database, restored into a throwaway PostgreSQL 18 as a check, encrypted with `BACKUP_PASSPHRASE` (copy in `.secrets/BACKUP-PASSPHRASE.txt`) and kept 14 days as a private workflow artifact. Plus Neon's own point-in-time history.
- **Uptime**: `.github/workflows/uptime.yml` checks `/api/health` on all three domains hourly; GitHub emails the owner when a run fails. The apps' own health checks raise incidents and email `OWNER_ALERT_EMAIL`.
- **Rollback**: re-run the deploy workflow for an older commit (Actions → Deploy to Cloudflare → pick the run → Re-run), or `npx wrangler rollback -c wrangler.<app>.jsonc` from `deploy/cloudflare`.
- **Go public** (owner decision): remove `STAGING_PASSWORD` from that app's `WORKER_SECRETS_<APP>` and run `npx wrangler secret delete STAGING_PASSWORD -c wrangler.<app>.jsonc`.

The sections below describe the earlier generic container setup and the Netlify staging site, kept for reference.

## Topology (generic container host)

```
            ┌──────────── container host (always-on, 1+ machines) ───────┐
browser ──► │ Next.js standalone server (Dockerfile, APP=<name>)          │
Stripe  ──► │   /api/billing/webhook   /api/health   /api/cron/tick       │
            │   in-process scheduler (RUN_SCHEDULER=1) → Postgres jobs    │
            └──────────────┬──────────────────────────────────────────────┘
                           ▼
                Neon Postgres (one database per app)      Resend (email)
```

Scheduled work (scans, cleanup, reconciliation, budgets, digests) runs from the Postgres job queue. Each running instance ticks every 60 s; schedule claims are atomic, so multiple instances never double-run a schedule. `/api/cron/tick` (Bearer `CRON_SECRET`) allows an external cron to drive ticks on platforms without long-running processes.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build of any app as a Next.js standalone server (`--build-arg APP=changekite|gridrinse|webhooktrail`). |
| `.dockerignore` | Keeps node_modules, local databases, env files, secrets, deploy tooling and git history out of images. |
| `deploy/cloudflare/` | Worker source, one wrangler config per app, pinned wrangler version. |
| `.github/workflows/ci.yml` | Typecheck, tests, builds, real-Postgres tests and Docker boot checks on every push/PR. |
| `.github/workflows/deploy-cloudflare.yml`, `backup.yml`, `uptime.yml` | Production deploy, nightly backups, hourly uptime check. |

## Environment variables (per app)

| Variable | Required | Notes |
|---|---|---|
| `APP_URL` | yes | `https://<domain>` — used for links, CSRF origin checks, Stripe return URLs |
| `DATABASE_URL` | yes | `postgres://…?sslmode=require` (Neon) |
| `SESSION_SECRET` | yes | ≥ 32 random chars (`openssl rand -base64 48`) |
| `CRON_SECRET` | yes | ≥ 32 random chars |
| `TRUSTED_PROXY` | yes | `fly` on Fly.io; `cloudflare` behind Cloudflare; `xff:1` behind one trusted proxy; `none` otherwise |
| `STRIPE_SECRET_KEY` | for billing | `sk_test_…` until live billing is authorized |
| `STRIPE_WEBHOOK_SECRET` | for billing | from the Stripe webhook endpoint |
| `STRIPE_LIVE_MODE_AUTHORIZED` | no | must be `true` for an `sk_live_` key to be accepted; set only by the owner |
| `RESEND_API_KEY`, `EMAIL_FROM` | for email | without them, emails go to the outbox table only |
| `OWNER_ALERT_EMAIL` | recommended | receives critical incident alerts and the daily digest |
| `RUN_SCHEDULER` | yes on Fly | `1` |

## First deployment checklist (owner-authorized)

1. Domains: buy three domains; create DNS records only after the hosting step.
2. Neon: create one project with three databases; copy each connection string.
3. Fly.io: `fly launch --no-deploy --config deploy/fly/<app>.toml` per app (rename `app`), `fly secrets set …`, `fly deploy --config deploy/fly/<app>.toml`.
4. Custom domain: `fly certs add <domain>`; add the A/AAAA (or CNAME) records Fly prints.
5. Email: add each domain in Resend; publish its SPF/DKIM (and DMARC) records; set `EMAIL_FROM`.
6. Stripe (test mode first): run `npx tsx packages/billing/scripts/setup-stripe-test.ts` with the test key to create products and prices; add a webhook endpoint `https://<domain>/api/billing/webhook` for the listed events; set the signing secret. Enable the Customer Portal (plan switching between the app's prices, cancellation at period end).
7. Smoke test on the live URL: sign up, verify email, test-mode checkout with card 4242 4242 4242 4242, portal downgrade, cancel; check `/api/health`.
8. Search Console: add a Domain property for each domain, publish the DNS TXT verification record, submit `https://<domain>/sitemap.xml`.
9. External uptime monitor (free tier): monitor `https://<domain>/api/health` every 5 min, alert to the owner email.
10. Go live with billing only after owner authorization: switch to `sk_live_` keys, set `STRIPE_LIVE_MODE_AUTHORIZED=true`, recreate prices in live mode, new webhook secret.

## Staging (live): GridRinse on Netlify

- Project `gridrinse-staging` on the owner's free Netlify team: https://gridrinse-staging.netlify.app. The staging site moves to this name when the Netlify project is renamed; until then it still answers on its pre-rename project URL.
- Protected by HTTP Basic auth on every page and API (`STAGING_PASSWORD`; any username), `X-Robots-Tag: noindex`, robots.txt disallow-all. Exempt: `/api/cron/`, `/api/health`, `/api/billing/webhook` (each authenticates itself).
- Database: Netlify Database (Postgres), provisioned because `@netlify/database` is a dependency; the app reads `NETLIFY_DB_URL` and runs its own migrations on first request (advisory-locked).
- Scheduler: `apps/gridrinse/netlify/functions/cron-tick.mts` runs every 5 minutes and POSTs `/api/cron/tick` with `CRON_SECRET` (`CRON_TICK_BUDGET_MS=7000` to stay inside Netlify's function time limit).
- Client IP: `TRUSTED_PROXY=netlify` (`X-Nf-Client-Connection-Ip`).
- Deploys: from a clean `git archive` of `main` via the Netlify connector (uploads committed files only). Root `netlify.toml` selects `apps/gridrinse`.
- Secrets live only in Netlify env vars and in the git-ignored `.secrets/gridrinse-staging.json` on the owner's PC (rename the existing pre-rename secrets file to this name; `scripts/stripe-lifecycle-drill.mts` reads it by default).
- After the rename, staging needs: the Stripe test prices re-created under the `gridrinse_*` lookup keys (`packages/billing/scripts/setup-stripe-test.ts`), because existing test customers and subscriptions carry the old app id; and a fresh sign-in, because the session cookie prefix changed to `gr`. The applied workflow migration keeps its original id, so the database needs no change.

## Rollback

`fly releases` → `fly deploy --image <previous image>`. Migrations are forward-only and additive; never drop columns in the same release that stops using them.

## Backups

Neon keeps point-in-time history (retention depends on plan). The ops scheduler records a `backup.verify` heartbeat after confirming a recent restore point via the Neon API (requires `NEON_API_KEY`; NOT configured until the owner creates the account).
