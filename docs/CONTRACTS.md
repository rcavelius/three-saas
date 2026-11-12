# Shared package contracts (Phase 3)

Interfaces the shared packages expose so they can be built in parallel and composed by each app.
Every app runs its own database; each app composes migrations in this order:

```ts
[...CORE_MIGRATIONS, ...AUTH_MIGRATIONS, ...BILLING_MIGRATIONS, ...OPS_MIGRATIONS, ...APP_MIGRATIONS]
```

Migration ids are prefixed by package (`core_`, `auth_`, `billing_`, `ops_`, `<app>_`). Never edit an applied migration once deployed (nothing is deployed yet).

`DbHandle` (from `@repo/database`): `{ db, executor, driver, migrate, transaction(fn), close }`. `executor` and the `tx` passed to `transaction` are `SqlExecutor { exec(sql), query(sql, params) }`. Tests use `createDb("pglite:memory", schema)`.

## Tenancy model

- Identity: Better Auth users. Ids are **text** (UUID strings).
- **Every customer resource belongs to an organization** (`org_id text`). Each user gets a personal organization at signup; paid team plans invite more members into the same org.
- Billing (subscription, entitlements, usage) is per organization.
- Roles in an org: `owner`, `admin`, `member`. Billing actions and deletion of the org require `owner`.
- Platform role on the user (`auth_user.role`): `customer` (default) | `operator` | `owner`. Operators/owner see the internal ops dashboard; this is never derived from client input.

## @repo/auth

Tables (Better Auth, renamed with `modelName`): `auth_user`, `auth_session`, `auth_account`, `auth_verification`, `auth_organization`, `auth_member`, `auth_invitation`, `auth_rate_limit`. Required columns used by other packages:

- `auth_user(id text pk, email text unique, name text, email_verified boolean, role text default 'customer', created_at timestamptz)`
- `auth_organization(id text pk, name text, slug text unique, created_at timestamptz)`
- `auth_member(id text pk, organization_id text, user_id text, role text, created_at timestamptz)`

```ts
export const AUTH_MIGRATIONS: Migration[];
export function createAuth(opts: {
  handle: DbHandle<any>;
  appName: string;              // shown in emails
  baseURL: string;              // APP_URL
  secret: string;               // SESSION_SECRET (>= 32 chars)
  cookiePrefix: string;         // e.g. "ck", "gr", "wt" so apps on sibling domains never share cookies
  sendEmail: (msg: EmailMessage) => Promise<void>;
  emailTemplates?: Partial<AuthEmailTemplates>; // per-app branding
  onBeforeUserDelete?: (userId: string, orgIdsOwnedSolely: string[]) => Promise<void>; // cancel billing, purge data
  trustedOrigins?: string[];
}): AppAuth;

export interface EmailMessage { to: string; subject: string; text: string; html: string; tag: string }

// Server helpers (AppAuth methods)
auth.getSession(headers): Promise<{ user, session } | null>;
auth.requireUser(headers): Promise<{ user, session }>;                 // throws AuthError(401)
auth.requireOrg(headers, opts?: { role?: "owner" | "admin" | "member"; orgId?: string })
  : Promise<{ user, session, org: { id, name, slug }, role }>;         // throws 401/403; 404 for orgs the user isn't in
auth.handler: (req: Request) => Promise<Response>;                    // mount at /api/auth/[...all]
```

Client: `@repo/auth/client` exports `createAppAuthClient(baseURL)` (Better Auth React client with organization plugin).

## @repo/billing

Tables: `billing_customers(org_id text pk, stripe_customer_id text unique, created_at)`, `billing_subscriptions(org_id text pk, stripe_subscription_id text unique, plan_id text, status text, stripe_price_id text, current_period_end timestamptz, cancel_at_period_end boolean, last_event_at timestamptz, updated_at timestamptz)`, `billing_events(id text pk, type text, created_at timestamptz, received_at timestamptz, processed_at timestamptz, attempts int, error text)`, `billing_usage(org_id text, metric text, period text, used bigint, primary key(org_id, metric, period))`.

```ts
export interface PlanDef {
  id: string;                       // "free" | "solo" | ...
  name: string;
  priceMonthlyCents: number;        // 0 for free
  stripeLookupKey?: string;         // e.g. "changekite_solo_monthly"; absent for free
  limits: Record<string, number>;   // e.g. { sites: 3, pagesPerScan: 500 }  (-1 = unlimited)
  features: Record<string, boolean>;
}
export interface Catalog { app: string; plans: PlanDef[]; freePlanId: string }

export const BILLING_MIGRATIONS: Migration[];
export function createBilling(opts: {
  handle: DbHandle<any>;
  catalog: Catalog;
  stripe: StripeGateway;            // createStripeGateway(secretKey) in prod; FakeStripe in tests
  webhookSecret: string;
  appUrl: string;
  hooks?: {
    onPlanChanged?(orgId: string, from: string, to: string): Promise<void>;
    onPaymentFailed?(orgId: string, info: { invoiceId: string; amountDueCents: number; nextAttemptAt: Date | null }): Promise<void>;
    onSubscriptionCanceled?(orgId: string): Promise<void>;
  };
}): Billing;

billing.getEntitlements(orgId): Promise<{ planId, status, limits, features, cancelAtPeriodEnd, currentPeriodEnd }>;
billing.consumeUsage(orgId, metric, amount, opts?: { period?: string }): Promise<{ ok: boolean; used: number; limit: number }>; // atomic
billing.releaseUsage(orgId, metric, amount, opts?): Promise<void>;
billing.createCheckoutSession(orgId, planId, customerEmail): Promise<{ url: string }>;
billing.createPortalSession(orgId): Promise<{ url: string }>;
billing.handleWebhook(rawBody: string, signatureHeader: string | null): Promise<{ status: number; body: string }>;
billing.reconcile(): Promise<{ checked: number; fixed: number }>;     // scheduled job
billing.cancelImmediately(orgId): Promise<void>;                       // account deletion path
```

Server-side entitlements are the only source of truth; apps never trust a client-side plan flag.

## @repo/ops

Tables (OPS_MIGRATIONS): `ops_schedules(name text pk, interval_seconds int, next_run_at timestamptz, last_run_at, last_status, last_error)`, `ops_heartbeats(name text pk, at timestamptz, details jsonb)`, `ops_email_outbox(id uuid pk, to_address, subject, text_body, html_body, tag, status, attempts, provider_id, error, created_at, sent_at)`, and `ALTER TABLE incidents ADD fingerprint text, occurrences int, last_seen_at timestamptz, notified_at timestamptz`.

```ts
export const OPS_MIGRATIONS: Migration[];
export function getClientIp(headers: Headers, cfg: ClientIpConfig): string | null;
export type ClientIpConfig = { mode: "fly" | "cloudflare" | "render" | "xff"; trustedHops?: number } | { mode: "none" };
export function clientIpConfigFromEnv(env): ClientIpConfig;           // TRUSTED_PROXY=fly|cloudflare|render|xff:<n>|none
export function createMailer(opts: { handle; from: string; resendApiKey?: string; brand: Brand }): Mailer; // outbox + Resend; dev: outbox only
export function createScheduler(opts: { handle; jobs: Record<string, JobHandler>; schedules: ScheduleDef[]; logger }): Scheduler;
scheduler.tick({ budgetMs }): Promise<TickReport>;                    // called by /api/cron/tick every minute
export function raiseIncident(ex, i: { fingerprint, severity, source, title, details }): Promise<void>; // dedup while open
export function healthReport(handle, opts): Promise<HealthReport>;    // db latency, queue backlog, dead letters, last tick age
export function getOwnerMetrics(ex, opts: { catalog plan prices; since: Date }): Promise<OwnerMetrics>;
export function trackEvent(ex, e: { name, anonymousId?, userId?, path?, props? }): Promise<void>;
// ./next
export function buildCsp(nonce: string, opts?): string;
export function cspProxy(opts): (req: NextRequest) => NextResponse; // nonce per request for proxy.ts
export function verifyCronRequest(req: Request, secret: string | undefined): boolean; // constant-time Bearer check
```

Owner notification policy: `critical` incidents email the owner immediately (at most once per fingerprint per 6 h); `warning` incidents go into a daily digest; `info` is dashboard-only.
