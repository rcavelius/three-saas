# Deployment guide

Nothing is deployed. Every step below that creates an account, spends money, registers a domain or makes a site public needs the owner's explicit authorization (see OWNER-ACTIONS.md).

## Topology (per app)

```
            ┌──────────── Fly.io app (always-on, 1+ machines) ───────────┐
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
| `Dockerfile` | Multi-stage build of any app as a Next.js standalone server (`--build-arg APP=changekite|datapolish|webhooktrail`). |
| `.dockerignore` | Keeps node_modules, local databases, env files and git history out of images. |
| `deploy/fly/<app>.toml` | Fly.io app config: health check on `/api/health`, always-on machine, `TRUSTED_PROXY=fly`. |
| `.github/workflows/ci.yml` | Typecheck, tests and builds on every push/PR. |

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

## Staging (live): DataPolish on Netlify

- Project `datapolish-staging` on the owner's free Netlify team: https://datapolish-staging.netlify.app
- Protected by HTTP Basic auth on every page and API (`STAGING_PASSWORD`; any username), `X-Robots-Tag: noindex`, robots.txt disallow-all. Exempt: `/api/cron/`, `/api/health`, `/api/billing/webhook` (each authenticates itself).
- Database: Netlify Database (Postgres), provisioned because `@netlify/database` is a dependency; the app reads `NETLIFY_DB_URL` and runs its own migrations on first request (advisory-locked).
- Scheduler: `apps/datapolish/netlify/functions/cron-tick.mts` runs every 5 minutes and POSTs `/api/cron/tick` with `CRON_SECRET` (`CRON_TICK_BUDGET_MS=7000` to stay inside Netlify's function time limit).
- Client IP: `TRUSTED_PROXY=netlify` (`X-Nf-Client-Connection-Ip`).
- Deploys: from a clean `git archive` of `main` via the Netlify connector (uploads committed files only). Root `netlify.toml` selects `apps/datapolish`.
- Secrets live only in Netlify env vars and in the git-ignored `.secrets/datapolish-staging.json` on the owner's PC.

## Rollback

`fly releases` → `fly deploy --image <previous image>`. Migrations are forward-only and additive; never drop columns in the same release that stops using them.

## Backups

Neon keeps point-in-time history (retention depends on plan). The ops scheduler records a `backup.verify` heartbeat after confirming a recent restore point via the Neon API (requires `NEON_API_KEY`; NOT configured until the owner creates the account).
