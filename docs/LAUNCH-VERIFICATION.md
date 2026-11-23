# Launch verification — 2026-11-12

> **Update 2026-11-23: checkout proven end to end, now on a schedule.** `.github/workflows/checkout-e2e.yml` buys every
> one-time pass and one monthly plan per app in Stripe TEST mode with a real headless browser (production build, service
> Postgres, Stripe hosted Checkout with card 4242, webhooks via `stripe listen`, pass cookie + unlock link, paid limits):
> GridRinse 24-hour pass $5 and Pro $9, ChangeKite full-report pass $9 and Solo $19, WebhookTrail 7-day pass $5 and
> Developer $9 — all pass (weekly, Mondays). A daily live smoke opens a live Checkout for every pass and plan through the
> live sites, checks price and amount, and expires it unpaid. Latest result: `docs/growth/checkout-health.json`.
> Code: `scripts/checkout-e2e/`.

Every result below came from a test that actually ran on 2026-11-12. "Live" means the deployed site on its real domain; "local" means the same production build running on this PC (`next build` + `next start`), used wherever a step needs a customer account, because the automation is not allowed to create accounts on a production domain.

## Summary

| | GridRinse | ChangeKite | WebhookTrail |
|---|---|---|---|
| Public website | **FAIL (by design: site password on)**; everything else PASS | same | same |
| Email delivery | **PASS** | **PASS** | **PASS** |
| Signup (incl. email verification, deletion) | **PASS** (local) | **PASS** (automated suite) | **PASS** (automated suite) |
| Stripe test checkout | **PASS** (local, full 16-step lifecycle) + live webhooks PASS | **NOT VERIFIED** (configured today; live webhooks PASS) | **NOT VERIFIED** (configured today; live webhooks PASS) |
| Core functionality | **PASS** (live) | **PASS** (live scan; monitors/alerts by suite) | **PASS** (live capture; replay by suite) |
| Scheduled jobs | **PASS** (live) | **PASS** (live) | **PASS** (live) |
| Security | **PASS** | **PASS** | **PASS** |
| SEO readiness | **FAIL until public** (crawlers get 401); files and tags PASS | same | same |
| Ready for public free use | **YES, once you approve removing the password** | **YES, same** | **YES, same** |
| Ready for real paid customers | **NO** (see blockers) | **NO** | **NO** |

## 1. Public accessibility

- **The 401s** that an outside checker saw are the launch password gate (HTTP Basic auth in the Cloudflare Worker), on purpose until you approve going public. `curl` from here: 401 on all three, TLS verify OK.
- **The ChangeKite 502** was not reproducible. Workers logs (Cloudflare Observability API, last 6 h) show no crashed invocations; the only 5xx were 503s from `/api/health` at 01:48 and 02:08 UTC, the exact minutes containers were being replaced by deploys. A request landing mid-swap can surface as a 502 at the edge. **Fix shipped:** the Worker now retries a GET/HEAD once against the fresh container and otherwise answers 503 + `Retry-After` (commit 48164bc).
- **HTTPS:** certificates from Google Trust Services, valid to 2027-02-10, cover apex + www, auto-renewed by Cloudflare. HSTS (2 years, preload) on every page; `www.` → apex 301.
- **Real browser, desktop 1366×900 and iPhone 13** (`scripts/live-render-check.mts`, headless Edge): `/`, `/pricing`, `/signup`, `/login`, `/help`, `/privacy`, `/terms` on all three = 42 page loads, **all 200, 0 console errors, 0 failed CSS/JS/font/image requests, 0 horizontal overflow**. Screenshots reviewed by eye: clear headline, free tool above the fold, pricing and sign-up in the nav, on desktop and phone.
- **Protected routes** (anonymous, live): ChangeKite `POST/GET /api/sites` 401, `/admin` 404, `/dashboard` → login; GridRinse `/api/workflows` 401, `/api/billing/checkout` 401, `/admin` 404; WebhookTrail `/api/billing/checkout` 401, `/admin` 404, `/account` → login, replay 401, add destination 401, another visitor reading an endpoint 404.

## 2. Email delivery — PASS
- Cloudflare Email Sending enabled for all three domains; DNS checked via DNS-over-HTTPS: SPF (`cf-bounce.<domain>`), DKIM (`cf-bounce._domainkey.<domain>`), DMARC `p=reject`, bounce MX — present on all three.
- Test message from each domain's live Worker relay arrived in the owner's **Gmail Inbox** (not spam) — checked in Gmail by searching the test subject: 3 of 3 present. Because DMARC is `p=reject`, Gmail would have refused any message failing SPF/DKIM alignment.

## 3. Stripe (test mode only)
- **Live webhook delivery to gridrinse.com** (`scripts/stripe-webhook-delivery-check.mts`): throwaway test customers via the Stripe API with Stripe's test payment tokens (`pm_card_visa`, `pm_card_chargeCustomerFail`). Stripe reported **0 pending deliveries** for all 25 events; the app's production database recorded all 6 subscribed event types (`customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`), each processed and correctly ignored because the customers belong to no GridRinse workspace. Test customers deleted afterwards.
- **Full customer lifecycle, GridRinse local production build** (`scripts/local-stripe-lifecycle.mts`, real Stripe test Checkout page and test card 4242; Stripe's real test events forwarded to localhost and signed with the local webhook secret, as `stripe listen` does): **16/16 PASS** — signup email, verification link, redirect to Stripe Checkout, payment, Stripe customer created, Pro entitlement, billing portal opens, upgrade to Business, downgrade to Pro, declined renewal shown to the customer, payment-failed email, plan-change emails, cancel at period end shown, cancel → Free, cancellation email, account deletion.
- **ChangeKite and WebhookTrail:** had no Stripe configuration until today. Products/prices now exist in the same test account, webhook endpoints were created for both domains and the keys added to their Worker secrets (deployed). Live webhook check after the deploy: **WebhookTrail** 0 pending, all 6 subscribed event types recorded and processed; **ChangeKite** the first attempts hit the container while it was still cold-starting after the deploy (Worker answered 503, logged "container not ready"), Stripe retried automatically and all events were recorded and processed within 2 minutes. Their checkout pages have not yet been run end to end.

## 4. Products as a customer
- **GridRinse (live, gridrinse.com)** — `scripts/live-gridrinse-check.mts`: a messy CSV and a messy XLSX (padded/duplicated names, `Jan 17, 2024` / `29 Feb 2024` dates, `$1,234.50`, `(45.00)`, a blank row, a duplicate row) → "5 rows in, 3 rows out, 7 cells changed"; downloaded cleaned CSV and XLSX from each input checked cell by cell: names trimmed, dates ISO, amounts 1234.5 / −45 / 1000, blank and duplicate rows gone — **4/4 outputs exact**. No request carried file data (only Cloudflare's ~830-byte page-speed beacon).
- **ChangeKite (live)**: 5 anonymous inspections of example.com, 2.1–4.0 s each, report page 200; the 6th was refused with 429 (anonymous limit 5/hour per IP). Monitors, repeated checks, change detection and alert e-mails are account features: `apps/changekite/src/test/monitoring.test.ts` **18/18 PASS** (baseline without alert, new broken link → one alert, no repeats, "resolved" mail, certificate/robots alerts, unreachable after 3 failures → alert, recovery → "back up", muted sites, scan-now rate limit, cross-tenant 404s, retention).
- **WebhookTrail (live)**: anonymous endpoint created; JSON POST with sub-path and query, form PUT and GET captured (200) and listed; detail returns method, path, query, headers and the exact body; 1.4 MB body refused 413; burst of 200 → 120 accepted, 80 refused 429. Replay (paid, verified destinations): `replay.test.ts` + `security.test.ts` **25/25 PASS** (verified destinations only, sensitive headers excluded unless ticked, no redirects followed, DNS-rebinding blocked, never to WebhookTrail itself, 1 MB cap, free plan refused, rate limits, cross-org 404).

## 5. Operations and SEO
- **Scheduled jobs (live, production databases, `scripts/prod-ops-report.mts`):** every schedule's last run `ok`; jobs in the last 3 h all `done`, none failed or dead-lettered (e.g. ChangeKite `sites.schedule` 35, `alerts.dispatch` 8; WebhookTrail `webhooktrail.retention` 4; billing checks every 5 min). Containers sleep between wakes (the per-minute job ran ~31 times in 3 h ⇒ awake ~17% of the time).
- **Backups:** nightly workflow ran manually — dumps 103–116 KB per database, restored into a fresh PostgreSQL 18 (29–33 tables each), encrypted, stored 14 days.
- **Monitoring:** hourly uptime workflow PASS; health endpoints report DB latency, scheduler heartbeat, queue, dead letters, outbox, incidents (all green); no incidents open. Budget alerts at $10/$15/$30/$60.
- **Analytics:** production `analytics_events` recorded 24 / 16 / 14 events in 3 h from real page use.
- **robots.txt / sitemap.xml:** valid on all three; sitemaps 22–25 URLs, all on the canonical https apex, every URL 200; private areas disallowed. Canonical tags correct on public pages. **Fixed today:** draft legal pages were inconsistent (one indexable, one canonical to the home page) → now noindex with self canonicals and out of the sitemaps until legal review.
- **Paid access cannot be bypassed:** see the protected-route list above; plan limits enforced server-side (suites above: `plan_required`, limits per plan).

## 6. Before real customers (owner items)
1. **Approve going public** (removes the password; then crawlers and visitors get 200).
2. **Legal pages** are drafts: privacy policy and terms need your operator details (legal entity, address, contact) and a lawyer's review. Mention Cloudflare's page-speed beacon and Stripe as processors.
3. **Support inbox:** `support@` addresses on all three sites cannot receive mail (no inbound MX). Fix: Cloudflare Email Routing forwarding `support@` / `abuse@` to your inbox (free; adds MX records; needs your OK).
4. **Stripe merchant name:** Checkout shows "MEDIA MASTERS LLC" (statement descriptor) and the account is named "DataPolish". Decide the public business name per product, or one company name for all three. Also decide whether all three products share this one Stripe account (works today; lookup keys are per app) and enable Stripe Tax if you need sales tax/VAT.
5. **Stripe billing portal:** configure plan switching per product so a ChangeKite customer is only offered ChangeKite plans.
6. **Live payments:** identity/business verification and payout account in Stripe, then your go-ahead to switch keys.
7. **Abuse handling:** an `abuse@` contact and a short policy (ChangeKite scans other people's sites; WebhookTrail stores what senders post).
8. Optional: an Anthropic API key for AI chat in the help centers (budget-capped in code); without it they answer from articles.
