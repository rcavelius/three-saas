# @repo/billing

Stripe subscriptions, entitlements and usage limits for SiteProof, DataPolish and HookPilot
(one catalog and one database per app). Interface: `docs/CONTRACTS.md` → "@repo/billing".

## Wiring (per app)

```ts
const billing = createBilling({
  handle,                                   // DbHandle; migrations include BILLING_MIGRATIONS
  catalog: SITEPROOF_CATALOG,               // from @repo/billing
  stripe: stripeGatewayFromEnv(process.env),// throws on live keys unless STRIPE_LIVE_MODE_AUTHORIZED=true
  webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  appUrl: env.APP_URL,
  hooks: { onPlanChanged, onPaymentFailed, onSubscriptionCanceled, onAnomaly /* -> raiseIncident */ },
});
export const POST = checkoutRoute(billing, resolveOwnerOrg); // app/api/billing/checkout/route.ts
export const POST = portalRoute(billing, resolveOwnerOrg);   // app/api/billing/portal/route.ts
export const POST = webhookRoute(billing);                   // app/api/billing/webhook/route.ts (runtime nodejs)
// scheduler: { name: "billing-reconcile", interval: 3600 } -> billing.reconcile()
// account deletion (onBeforeUserDelete): billing.cancelImmediately(orgId)
```

`resolveOwnerOrg(req)` comes from the app (billing never imports auth): authenticate, require the
`owner` role, return `{ orgId, email }`, or throw an error with `status` 401/403/404.

## Live mode

`createStripeGateway(key, { allowLive })` refuses `sk_live_`/`rk_live_` keys unless `allowLive === true`.
`stripeGatewayFromEnv` sets it only when `STRIPE_LIVE_MODE_AUTHORIZED` is exactly `true`. **Only the
owner sets that variable**, after Stripe account verification; agents, CI and tests never do.

## Webhook processing

1. Signature verified with the Stripe SDK on the raw body. Missing/invalid/stale → 400, nothing stored.
2. Event id recorded in `billing_events` (`ON CONFLICT DO NOTHING`); already processed → 200 no-op.
3. The subscription is **re-fetched from Stripe** (the event only says which one), then upserted in
   one transaction together with the "processed" mark. An event older than `last_event_at` is
   recorded as `stale` and does not change state; an event for an old subscription never replaces
   the org's live one. Hooks run after commit, once per event id.
4. Outcomes in `billing_events.outcome`: `processed`, `stale`, `ignored` (unhandled types,
   `trial_will_end`, customers not created by this app), `unknown_price`, `failed`.
5. **Unknown price** (lookup key not in the catalog, e.g. an ad-hoc dashboard price): error stored in
   `billing_events.error`, `onAnomaly` called, response **200**, previous plan kept. Retrying cannot
   fix a catalog mismatch, and a non-2xx would make Stripe retry for days and eventually disable
   the endpoint. Fix the catalog/price, then `reconcile()` applies it.
6. Processing failure (Stripe API or DB error): error recorded, **500** so Stripe retries; the hourly
   `reconcile()` repairs anything still missed.

Subscribe each app's endpoint to `STRIPE_WEBHOOK_EVENTS` (see `scripts/setup-stripe-test.ts`).

## Entitlements

From the database only: `active`/`trialing` → plan; `past_due` → plan for 7 days from the first
failed payment, then free; `canceled`/`unpaid`/`incomplete`/`incomplete_expired`/`paused` → free;
`cancel_at_period_end` keeps the plan until the period end. `onPlanChanged` fires when the paid
plan changes (not when a grace period silently runs out; apps read entitlements on each request).

## Usage

`consumeUsage` is one atomic `INSERT … ON CONFLICT DO UPDATE … WHERE used + n <= limit` statement
(period = UTC `YYYY-MM` by default; `-1` = unlimited). Gauge limits (sites, endpoints, seats) are
counted by the app inside `handle.transaction` after `withOrgLock(tx, orgId)`.

## Plan limits

| App | Plan | $/mo | Limits |
|---|---|---|---|
| SiteProof | Free | 0 | 0 monitored sites (one-off scans), 25 pages/scan, no scheduled scans, no history, 1 seat |
| | Solo | 19 | 3 sites, 250 pages/scan, every 24 h, 90 days history, 1 seat |
| | Agency | 79 | 20 sites, 1,000 pages/scan, every 6 h, 365 days history, 5 seats, PDF reports, priority queue |
| DataPolish | Free | 0 | 5 MB, 50,000 rows, 3 files/batch, 0 cloud workflows, 1 seat |
| | Pro | 12 | 50 MB, 500,000 rows, 20 files/batch, 50 workflows, 1 seat |
| | Business | 29 | 200 MB, 2,000,000 rows, 100 files/batch, unlimited workflows, 5 seats |
| HookPilot | Free | 0 | 3 endpoints, 24 h retention, 100 requests stored, 3,000 req/month, 256 KB stored body, 1 MB max payload, 1 seat, no replay |
| | Developer | 9 | 25 endpoints, 7 days, 2,000 stored, 100,000 req/month, 1 MB stored, 2 MB max, 1 seat, replay |
| | Pro | 29 | 100 endpoints, 30 days, 10,000 stored, 1,000,000 req/month, 5 MB stored, 10 MB max, 5 seats, replay |

DataPolish and HookPilot paid values match their existing pricing pages; SiteProof paid crawl
sizes and frequencies, and HookPilot `requestsPerMonth`, are new choices.

## Tests

`npx vitest run` uses PGlite in memory and `FakeStripe` (`@repo/billing/testing`), whose webhook
events are signed with the real Stripe scheme and verified with the real SDK. The optional
`stripe-test-mode.test.ts` runs read-only checks only when `STRIPE_TEST_SECRET_KEY=sk_test_…` is set.
