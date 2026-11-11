# @repo/ops

Shared operations layer for ChangeKite, GridRinse and WebhookTrail: scheduler + job runner, transactional
email outbox, incidents and owner alerts, health checks, budgets, billing health, owner metrics,
first-party analytics, client IP handling and Next.js security headers.

Everything that depends on time takes an injected clock (`now`), and everything that talks to the
network takes an injected `fetch`, so the test suite runs fully offline on PGlite.

## Wiring an app

```ts
// lib/ops.ts
import { createDb, CORE_MIGRATIONS } from "@repo/database";
import { createLogger } from "@repo/monitoring";
import { OPS_MIGRATIONS, createMailer, createOpsJobs, defaultOpsSchedules, createScheduler,
  uptimeUrlsFromEnv, clientIpConfigFromEnv } from "@repo/ops";

export const handle = createDb(process.env.DATABASE_URL!, schema);
// migrations: [...CORE_MIGRATIONS, ...AUTH_MIGRATIONS, ...BILLING_MIGRATIONS, ...OPS_MIGRATIONS, ...APP_MIGRATIONS]

export const brand = { name: "ChangeKite", url: process.env.APP_URL!, primaryColor: "#0f766e", supportEmail: "help@..." };
export const mailer = createMailer({ handle, from: process.env.EMAIL_FROM!, resendApiKey: process.env.RESEND_API_KEY, brand });
const opsJobs = createOpsJobs({
  handle, mailer,
  ownerEmail: process.env.OWNER_ALERT_EMAIL,
  dashboardUrl: `${process.env.APP_URL}/ops`,
  uptimeUrls: uptimeUrlsFromEnv(process.env.UPTIME_URLS),
});
const jobs = { ...opsJobs, "app.cleanup": cleanupJob };
export const scheduler = createScheduler({
  handle, jobs, logger: createLogger({ app: "changekite" }),
  schedules: [...defaultOpsSchedules(opsJobs), { name: "app.cleanup", intervalSeconds: 3600 }],
});
export const clientIp = clientIpConfigFromEnv(process.env);
```

```ts
// app/api/cron/tick/route.ts      (hosting cron / external pinger, every minute)
import { cronTickRoute } from "@repo/ops/next";
const handler = cronTickRoute({ scheduler, secret: process.env.CRON_SECRET });
export const GET = handler; export const POST = handler;

// app/api/health/route.ts
export const GET = healthRoute({ handle, version: process.env.GIT_SHA ?? "dev", detailsSecret: process.env.CRON_SECRET });

// app/api/events/route.ts
export const POST = eventsRoute({ handle, clientIp, rateLimit: { limit: 60, windowMs: 60_000 },
  allowedOrigins: [process.env.APP_URL!], getUserId: async (req) => (await auth.getSession(req.headers))?.user.id ?? null });

// proxy.ts (Next 16)
import { cspProxy } from "@repo/ops/next";
export const proxy = cspProxy({ dev: process.env.NODE_ENV !== "production", connectSrc: ["https://api.stripe.com"] });
export const config = { matcher: [ /* copy CSP_PROXY_MATCHER literally: Next requires a static config */ ] };
```

Server components read the nonce with `(await headers()).get("x-nonce")`. Pages that use the nonce must
render dynamically (that is how nonce-based CSP works in Next).

## Pieces

| Area | API | Notes |
|---|---|---|
| Migrations | `OPS_MIGRATIONS` | `ops_schedules`, `ops_heartbeats`, `ops_email_outbox`, `ops_budgets`, `ops_settings`; adds `fingerprint`, `occurrences`, `last_seen_at`, `notified_at` to `incidents` with a unique index on `fingerprint WHERE status = 'open'`. |
| Client IP | `getClientIp(headers, cfg)`, `clientIpConfigFromEnv(env)`, `normalizeIp`, `rateLimitKeyForIp` | See below. |
| Scheduler | `createScheduler({ handle, jobs, schedules, logger, workerId, now })` → `tick({ budgetMs })`, `retryDeadLetter(id)`, `listDeadLetters()` | Schedules are claimed with `UPDATE ... WHERE next_run_at <= now RETURNING` in a transaction, so concurrent ticks never double-enqueue. A schedule whose previous job is still pending is advanced but not stacked. Jobs: retry with backoff 30 s × 2^(n-1) (max 1 h); `PermanentJobError` or an unknown queue dead-letters immediately; per-job timeout 55 s. Heartbeat `scheduler` every tick. |
| Incidents | `raiseIncident`, `resolveIncident`, `autoResolve`, `listOpenIncidents`, `getOpenIncident` | One open incident per fingerprint; repeats bump `occurrences`/`last_seen_at`; severity can rise, never fall. Details pass through `redact()`. |
| Email | `createMailer`, `renderBrandedEmail`, `welcomeEmail`, `paymentFailedEmail`, `subscriptionCanceledEmail`, `planChangedEmail`, `usageNearLimitEmail`, `alertEmail` | `send()` = outbox row + `email.send` job in one transaction. Resend `POST /emails` with `Idempotency-Key` = outbox id. 429/409/5xx/network → retry; other 4xx → permanent. No API key → status `logged` (dev). Logs carry only `j***@domain` and the tag, never bodies. HTML is inline-styled and fully escaped; links must be http(s). |
| Owner alerts | `notifyOwner`, job `ops.notify_owner` | Policy below. |
| Health | `healthReport(handle, opts)`, `publicHealth(report)`, `runUptimeCheck`, `uptimeCheckJob`, `uptimeUrlsFromEnv` | `down` if `SELECT 1` fails/times out (2 s); `degraded` if scheduler heartbeat > 5 min old or missing, oldest due job > 15 min, any dead letters or failed emails in 24 h, or an open critical incident. Public shape is `{ status, version }` only. |
| Budgets / usage | `recordCost`, `setBudget`, `monthToDateCosts`, `checkBudgets`, `checkUsageCeiling` | Budget `name` is a provider or `total`; warning at `warn_ratio`, critical at 100%, auto-resolve below. USD entries only, by `period_start` month (UTC). |
| Billing health | `checkBillingHealth(ex)` | critical `billing:webhook_backlog` for events unprocessed/errored > 15 min; warning `billing:no_webhooks` if paid subscriptions exist and nothing arrived in 7 days. |
| Owner metrics | `getOwnerMetrics(ex, { plans, now })` | See below. |
| Analytics | `trackEvent`, `sanitizeProps`, `sanitizePath`, `DEFAULT_EVENT_NAMES`, `eventsRoute` | Allow-listed names; ≤ 20 props, ≤ 200 chars per string, ≤ 2 KB total; emails, IPs and PII-named keys dropped; paths lose query/fragment and email/IP segments. Route: POST only, same-origin (Origin or `Sec-Fetch-Site`), JSON/text body ≤ 4 KB read with a hard cap, rate limited per client IP (/64 for IPv6), userId only from the server session. |
| Next | `buildCsp`, `cspProxy`, `securityHeaders`, `generateNonce`, `CSP_PROXY_MATCHER`, `verifyCronRequest`, `cronTickRoute`, `healthRoute`, `eventsRoute` | See below. |
| Wiring helpers | `createOpsJobs`, `defaultOpsSchedules`, `OPS_QUEUES` | notify every 60 s, billing check 5 min, uptime 2 min, budgets hourly. |

## Owner notification policy

| Severity | What happens |
|---|---|
| `critical` | Emailed to `OWNER_ALERT_EMAIL` on the next `ops.notify_owner` run (≤ 1 min), **at most once per fingerprint per 6 h**. The throttle looks at every incident with the fingerprint, so resolve/re-open flapping cannot spam. |
| `warning` | Collected into **one daily digest** (first run after 08:00 UTC; configurable) listing open warnings only. No digest when there are none. |
| `info` | Never emailed; dashboard only. |

If `OWNER_ALERT_EMAIL` is unset, incidents are still stored and heartbeat `owner-notify` records
`"owner email not configured"` so the dashboard can flag it.

Incident sources raised by this package: `job:<queue>` (dead letter; warning, critical from the 3rd in
24 h), `uptime:<url>` (critical after 2 consecutive failures), `budget:<name>`, `usage:<metric>`,
`billing:webhook_backlog` (critical), `billing:no_webhooks` (warning). All auto-resolve when the check
recovers, except dead letters (resolve them from the dashboard after `retryDeadLetter`).

## Client IP (`TRUSTED_PROXY`)

| Value | Header read | Notes |
|---|---|---|
| `fly` | `Fly-Client-IP` | Set by Fly's proxy. |
| `cloudflare` | `CF-Connecting-IP` | Only safe if the origin is reachable through Cloudflare alone. |
| `render` | right-most `X-Forwarded-For` entry | **Assumption:** Render's load balancer appends the connecting peer to `X-Forwarded-For`, so the right-most entry is the client and everything left of it is client-supplied. If another proxy/CDN sits in front of Render, use `xff:<n>`. |
| `xff:<n>` | n-th entry from the **right** of `X-Forwarded-For` | n = number of trusted proxies. Fewer entries than n → `null`. |
| `none` (default) | nothing | Local dev or unknown topology. |

The left-most `X-Forwarded-For` entry is never used. Duplicated single-value headers are rejected,
values must be IP literals (`node:net` `isIP`), IPv6 is canonicalised and IPv4-mapped IPv6 reduced to
IPv4. `rateLimitKeyForIp` buckets IPv6 by /64. Invalid `TRUSTED_PROXY` values throw at startup.

## Owner metrics (real rows only)

| Metric | Source |
|---|---|
| MRR | Catalog monthly price of each `billing_subscriptions` row on a paid plan with status `active`/`trialing`, or `past_due` updated within the grace period (14 days). Unknown plan ids are excluded. |
| Active paid subs | Rows counted in MRR. |
| New subs / cancellations this month | `billing_events` of type `customer.subscription.created` / `.deleted` in the UTC month. |
| Churn rate | cancellations / (active now + cancellations − new). `null` when that is 0. |
| Signups this month | `auth_user.created_at` in the month. |
| Conversion rate | orgs created this month that are paid now / signups this month. `null` when no signups. |
| Traffic | `pageview` events and distinct `anonymous_id`, last 30 days. |
| Costs MTD | `cost_entries` (USD) with `period_start` in the month, total and per provider. |
| Est. Stripe fees | 2.9% × MRR + 30¢ per paid sub (flagged `estimate`). |
| Est. operating contribution | MRR − costs MTD − est. fees (flagged `estimate`). |
| Failed jobs | Dead letters finished in the last 24 h / 7 d. |
| Open incidents | Counts by severity. |

Missing tables yield `null` with the reason in `source`; an empty database yields zeros and `null`
rates, never invented values.

## Next.js security headers

`buildCsp(nonce, opts)` produces:

```
default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; worker-src 'self' blob:;
manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none';
upgrade-insecure-requests
```

- `'unsafe-eval'` (and `ws:` for HMR) is added **only** with `dev: true`; `upgrade-insecure-requests` only in production.
- `style-src 'unsafe-inline'` is deliberate: Next.js and Tailwind-driven components emit inline `style`
  attributes (next/image, next/font fallbacks, layout shims) that nonces cannot cover. Script execution
  stays nonce-only with `'strict-dynamic'`, which is where XSS risk lives.
- Extra sources are validated, so a misconfigured value cannot inject a directive.

`cspProxy(opts)` generates a fresh 128-bit base64 nonce per request, sets `x-nonce` and the CSP on the
forwarded request headers (`NextResponse.next({ request: { headers } })`, as in the Next docs; any
client-sent `x-nonce` is overwritten) and sets on the response: CSP, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
`X-Frame-Options: DENY` (unless `frameAncestors` is configured) and HSTS (production only).

`verifyCronRequest(req, secret)` compares SHA-256 digests of the bearer token and secret with
`crypto.timingSafeEqual`; it returns `false` when the secret is unset or shorter than 16 characters.
`cronTickRoute` answers 503 when `CRON_SECRET` is unset and 401 on a bad token.

## Environment

| Variable | Used by |
|---|---|
| `TRUSTED_PROXY` | `clientIpConfigFromEnv` |
| `RESEND_API_KEY`, `EMAIL_FROM` | `createMailer` (no key → emails are logged, not sent) |
| `OWNER_ALERT_EMAIL` | `createOpsJobs` → owner notifications |
| `CRON_SECRET` | `cronTickRoute`, `healthRoute` details |
| `UPTIME_URLS` | comma-separated, owner-configured uptime targets |

## Tests

`npx vitest run` and `npx tsc -p tsconfig.json` in this folder. Tests use in-memory PGlite with minimal
fixture versions of the auth/billing tables from `docs/CONTRACTS.md` (`src/test/fixtures.ts`), an
injected clock, and mocked `fetch`; no network, no real email.
