# App integration brief (Phase 3–5)

Shared instructions for wiring each app onto the shared packages. Read with `docs/CONTRACTS.md`, `packages/auth/src/*`, `packages/billing/README.md`, `packages/ops/README.md`, `packages/security/src/index.ts`, `docs/DEPLOYMENT.md`.

## Composition (one module per app: `src/lib/platform.ts`, server-only)

- Migrations: `[...CORE_MIGRATIONS, ...AUTH_MIGRATIONS, ...BILLING_MIGRATIONS, ...OPS_MIGRATIONS, ...APP_MIGRATIONS]`; one DB handle singleton on `globalThis`.
- `createAuth` with the app's `cookiePrefix` (`sp` / `dp` / `hp`), branded email templates, `ipAddress` headers aligned with `TRUSTED_PROXY` (fly → `fly-client-ip`, cloudflare → `cf-connecting-ip`), `onBeforeUserDelete` → `billing.cancelImmediately(orgId)` + purge the app's org data, `getMemberLimit` → billing entitlement `teamSeats`.
- `createMailer` (outbox; Resend when `RESEND_API_KEY` set) is the `sendEmail` for auth and all routine emails.
- `createBilling` with the app's catalog from `@repo/billing`, `stripeGatewayFromEnv(process.env)`; when no Stripe key is configured the app still runs: pricing shows plans, checkout returns a clear "billing not configured" 503, entitlements = free. Hooks: `onPlanChanged`/`onPaymentFailed`/`onSubscriptionCanceled` → routine emails via ops builders; `onAnomaly` → `raiseIncident`.
- `createScheduler` with `createOpsJobs`/`defaultOpsSchedules` plus app jobs (billing reconcile hourly, cleanup, etc.). `src/instrumentation.ts` starts a 60 s in-process tick when `RUN_SCHEDULER=1` (Node runtime only, guard against double start in dev). `/api/cron/tick` via `cronTickRoute` for external cron.
- `proxy.ts` (Next 16) via `cspProxy` → nonce CSP. Remove `'unsafe-inline'` scripts from `next.config.ts` (keep the other headers there or move them into the proxy; do not send two conflicting CSP headers). Pages that render inline scripts (JSON-LD) must read the nonce from `headers().get("x-nonce")`. Verify in a production build (`next build && next start`) that pages load with no CSP violations in the console.
- `/api/health` (`healthRoute`, public minimal; details with `HEALTH_DETAILS_SECRET`), `/api/events` (`eventsRoute`) + a tiny client `track(name, props)` helper: pageview, signup_started/completed, checkout_started, tool_used, upgrade_clicked. No third-party analytics.
- Client IP for every app-level rate limit: `getClientIp(headers, clientIpConfigFromEnv(process.env))` and `rateLimitKeyForIp`; replace any `x-forwarded-for` parsing in the app.

## Accounts UI (real pages, app-branded)

`/signup`, `/login`, `/verify-email` (pending + result), `/forgot-password`, `/reset-password`, `/accept-invitation/[id]`, `/account` (profile, change password, sessions list + revoke, delete account with password confirmation and clear explanation of what is deleted), `/account/team` (members, invite, roles, remove — gated by plan seats), `/account/billing` (current plan from server entitlements, usage meters, upgrade/downgrade buttons → checkout or portal, cancellation state, failed-payment banner). Use `@repo/auth/client`. Sign-out everywhere. Pricing page buttons go to checkout when signed in (owner) or to signup with `?plan=` and continue to checkout after verification.

## Authorization rules (must be tested)

- Every customer resource row carries `org_id`; every query filters by the org from `auth.requireOrg(headers)` — never an org id from the request body/query.
- Entitlements and quotas come only from `billing.getEntitlements(orgId)` / `consumeUsage` on the server. Gauge limits (sites, endpoints) are counted inside `handle.transaction` with `withOrgLock`.
- Cross-tenant tests: user B gets 404 for user A's resources on every route (read, update, delete, export, replay, download).
- Downgrade handling: when limits drop, excess resources are paused/locked (not deleted) and the UI says so.

## Internal ops dashboard

`/admin` (only `auth_user.role` in `operator`/`owner`; 404 for everyone else): `getOwnerMetrics` with the app's catalog, `healthReport`, open incidents (acknowledge/resolve), dead-letter jobs (retry), budgets (set monthly limit per provider), record a cost entry, email outbox status, recent billing events. Server components only; no client-side role checks. Document how the owner grants the role (SQL one-liner in the app README; no self-service elevation).

## SEO and acquisition

`src/app/sitemap.ts`, `src/app/robots.ts` (disallow /api, /account, /admin, private report/inspector URLs), canonical URLs via `metadataBase` from `APP_URL`, per-page titles/descriptions, Open Graph, JSON-LD (`SoftwareApplication` with real `offers` from the catalog on home/pricing; `FAQPage` on the FAQ; `Article`/`HowTo` on guides) using the CSP nonce. Pricing page FAQ (billing, cancellation, refunds policy = "contact support; handled by a person", data retention, security). Original guides only where genuinely useful (2–4 more per app, accurate, no fluff); a free-tool landing page that IS the working tool. `docs/SEO.md` in the app folder: Search Console steps (DNS TXT), sitemap submission, target queries, internal-link map. No fake testimonials, counts, logos or reviews.

## Tests and verification (required; report honestly)

- vitest: auth flows through the app's routes, cross-tenant isolation on every resource route, entitlement enforcement (free vs paid limits, downgrade), billing lifecycle via `FakeStripe` from `@repo/billing/testing` with signed webhooks hitting the app's webhook route, quota races, scheduled jobs run through `scheduler.tick`, data deletion (account delete removes org data), rate limits with spoofed headers, CSRF/origin on mutating routes, `/admin` 404 for customers.
- `npx vitest run`, `npx tsc -p tsconfig.json --noEmit`, and `npx next build` (BelowNormal priority, after checking no game is running) must pass in the app.
- Smoke test the production server (`npx next start --port <your port>`) with curl and the headless browser (Playwright with `channel: "msedge"`, headless — never a visible window): sign up → verification link from the outbox table → login → main tool → billing page (no Stripe key: graceful message) → delete account. Check console for CSP violations. Mobile viewport 390px. `@axe-core/playwright` scan of home, pricing, signup, the tool and account pages: fix serious/critical violations.
- Never kill a process you did not start: stop servers only after confirming via `Get-CimInstance Win32_Process` that the CommandLine contains BOTH your worktree path and your port.
