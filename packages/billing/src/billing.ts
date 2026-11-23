/**
 * createBilling(): Stripe checkout/portal, webhook processing, entitlements, usage counters and
 * reconciliation for ONE app (one catalog, one database).
 *
 * Invariants
 * - The database is only written from verified Stripe data: webhook events whose signature
 *   verified, and subscriptions re-fetched from the Stripe API (source of truth). Event payload
 *   snapshots are only used to find which subscription to fetch.
 * - Every event id is recorded once in billing_events; the state change and "processed" mark
 *   commit in one transaction, so a duplicate delivery can never run side effects twice.
 * - An event older than the stored state (last_event_at) never overwrites it.
 * - Entitlements are computed server-side from billing_subscriptions only.
 */
import type { DbHandle, SqlExecutor } from "@repo/database";
import { applyPassGrants, getFreePlan, getPass, getPlan, planByLookupKey, type Catalog, type PassDef, type PlanDef } from "./catalog";
import { BillingNotConfiguredError,
  invoiceSubscriptionId,
  type GatewayCheckoutSession,
  normalizeSubscription,
  type GatewayEvent,
  type GatewaySubscription,
  type StripeGateway,
  type SubscriptionStatus,
} from "./gateway";
import { advisoryXactLock } from "./locks";
import { readCookie, signPassToken, verifyPassToken } from "./pass-token";

// ---------------------------------------------------------------------------------------------
// Public types

export interface PaymentFailedInfo {
  invoiceId: string;
  amountDueCents: number;
  nextAttemptAt: Date | null;
}

export interface BillingAnomaly {
  kind: "unknown_price" | "org_mismatch" | "hook_failed" | "reconcile_failed" | "pass_mismatch";
  message: string;
  orgId?: string;
  eventId?: string;
}

export interface BillingHooks {
  onPlanChanged?(orgId: string, from: string, to: string): Promise<void>;
  onPaymentFailed?(orgId: string, info: PaymentFailedInfo): Promise<void>;
  /** The subscription has ENDED (access is now the free plan). */
  onSubscriptionCanceled?(orgId: string): Promise<void>;
  /**
   * The customer scheduled a cancellation (cancel at period end / cancel_at). Paid access continues until
   * `endsAt`; use it for the "your plan stays active until …" email. Fires once per scheduling.
   */
  onCancellationScheduled?(orgId: string, info: { planId: string; endsAt: Date | null }): Promise<void>;
  /** A one-time pass was paid and recorded (fires once per pass). */
  onPassPurchased?(pass: ActivePass): Promise<void>;
  /** Extension: incident-worthy problems (wire to @repo/ops raiseIncident). */
  onAnomaly?(a: BillingAnomaly): Promise<void>;
}

export interface BillingOptions {
  handle: DbHandle<any>;
  catalog: Catalog;
  stripe: StripeGateway;
  /** Required unless the gateway is notConfiguredGateway(). */
  webhookSecret?: string;
  /** APP_URL, e.g. https://changekite.example. Used for redirect URLs and the route Origin check. */
  appUrl: string;
  hooks?: BillingHooks;
  /** Clock (tests inject one). */
  now?: () => Date;
  /** Days a past_due subscription keeps its plan, counted from the first failed payment. Default 7. */
  gracePeriodDays?: number;
  /** Checkout allow_promotion_codes. Default false. */
  allowPromotionCodes?: boolean;
  /**
   * Stripe Tax on checkout (and the subscription it creates). Needs Stripe Tax set up in the dashboard (head office,
   * product tax codes). Tax is only collected where the account has a tax registration; elsewhere it is $0.
   * Checkout then asks for the billing address and offers a business tax ID field. Default false.
   */
  automaticTax?: boolean;
  /**
   * Checkout page branding for this product (Checkout Session branding_settings). Several products share one Stripe
   * account whose public name belongs to another business, so each app names itself on its own checkout page.
   */
  checkoutBranding?: CheckoutBranding;
  /** Proration for changePlan. Default "create_prorations" (difference billed on the next invoice). */
  prorationBehavior?: "create_prorations" | "always_invoice";
  paths?: { checkoutSuccess?: string; checkoutCancel?: string; portalReturn?: string };
  /**
   * One-time passes: the cookie that carries a buyer's pass (value = Checkout Session id + HMAC). `secret` must be
   * a server-only secret of at least 32 characters (e.g. derived from the auth secret). Without it passes can still be
   * bought and attached to signed-in orgs, but anonymous buyers cannot be unlocked.
   */
  passCookie?: { name: string; secret: string };
  /** Card statement suffix for one-time payments (e.g. "GRIDRINSE.COM"); subscriptions use the product descriptor. */
  passStatementDescriptorSuffix?: string;
}

/** A paid, recorded pass that has not expired or been refunded. */
export interface ActivePass {
  /** Stripe Checkout Session id (also the bearer reference in the cookie / unlock link). */
  id: string;
  passId: string;
  name: string;
  orgId: string | null;
  email: string | null;
  startsAt: Date;
  expiresAt: Date;
}

export type PassClaim =
  | { status: "active"; pass: ActivePass }
  | { status: "expired" | "revoked"; pass: Omit<ActivePass, "name"> & { name: string } }
  | { status: "unpaid" | "invalid" };

export interface CheckoutBranding {
  display_name: string;
  button_color?: string;
  background_color?: string;
  border_style?: "rounded" | "rectangular" | "pill";
}

export interface Entitlements {
  planId: string;
  planName: string;
  /** Stripe status of the org's subscription, or "none" when it never subscribed. */
  status: SubscriptionStatus | "none";
  limits: Record<string, number>;
  features: Record<string, boolean>;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  /** Set while past_due: when the plan falls back to free. */
  graceEndsAt: Date | null;
  /** The plan the org pays for (may differ from planId once the grace period is over). */
  subscribedPlanId: string;
  /** The active one-time pass raising these limits (the one that lasts longest), or null. */
  pass: { id: string; passId: string; name: string; expiresAt: Date } | null;
}

export interface UsageResult {
  ok: boolean;
  used: number;
  limit: number;
}

export interface Billing {
  readonly catalog: Catalog;
  readonly appUrl: string;
  /**
   * Plan + active passes. orgId null = anonymous visitor (free plan). passIds: Checkout Session ids from the
   * visitor's verified pass cookie (see passIdsFromCookieHeader); passes bought by the org always count.
   */
  getEntitlements(orgId: string | null, opts?: { passIds?: string[] }): Promise<Entitlements>;
  /** Stripe Checkout (mode "payment") for a one-time pass. No account needed; orgId binds the pass to an org too. */
  createPassCheckout(
    passId: string,
    opts?: { orgId?: string | null; email?: string | null; returnPath?: string },
  ): Promise<{ url: string; id: string }>;
  /** Verifies a Checkout Session with Stripe and records the pass (idempotent; also done by the webhook). */
  claimPass(sessionId: string): Promise<PassClaim>;
  /** Active passes of an org and/or the given session ids. */
  getActivePasses(opts: { orgId?: string | null; passIds?: string[] }): Promise<ActivePass[]>;
  /** Verified pass session ids from a Cookie header ([] without passCookie configured). */
  passIdsFromCookieHeader(cookieHeader: string | null): string[];
  /** Set-Cookie header value carrying the pass until it expires (null without passCookie configured). */
  passSetCookie(pass: Pick<ActivePass, "id"> & { expiresAt: Date | null }, opts?: { secure?: boolean }): string | null;
  consumeUsage(orgId: string, metric: string, amount: number, opts?: { period?: string }): Promise<UsageResult>;
  releaseUsage(orgId: string, metric: string, amount: number, opts?: { period?: string }): Promise<void>;
  getUsage(orgId: string, metric: string, opts?: { period?: string }): Promise<number>;
  createCheckoutSession(orgId: string, planId: string, customerEmail: string): Promise<{ url: string; id: string }>;
  createPortalSession(orgId: string): Promise<{ url: string }>;
  changePlan(orgId: string, planId: string): Promise<Entitlements>;
  handleWebhook(rawBody: string, signatureHeader: string | null): Promise<{ status: number; body: string }>;
  reconcile(): Promise<{ checked: number; fixed: number; errors: number }>;
  cancelImmediately(orgId: string): Promise<void>;
  /** Current usage period ("YYYY-MM", UTC) for the injected clock. */
  currentPeriod(): string;
}

export type BillingErrorCode =
  | "invalid_plan"
  | "already_subscribed"
  | "not_subscribed"
  | "no_customer"
  | "price_not_configured"
  | "invalid_input";

export class BillingError extends Error {
  constructor(
    readonly code: BillingErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

/** Shape check (see isAuthError): `instanceof` fails across Next.js server chunks. */
export function isBillingError(err: unknown): err is BillingError {
  if (err instanceof BillingError) return true;
  const e = err as { name?: unknown; status?: unknown; code?: unknown } | null;
  return !!e && typeof e === "object" && e.name === "BillingError" && typeof e.status === "number" && typeof e.code === "string";
}

// ---------------------------------------------------------------------------------------------
// Internals

interface SubRow {
  org_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  stripe_price_id: string | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  cancel_at: Date | null;
  payment_failed_at: Date | null;
  last_event_at: Date;
  updated_at: Date;
}

const SUB_COLUMNS = `org_id, stripe_subscription_id, stripe_customer_id, plan_id, status, stripe_price_id,
  current_period_end, cancel_at_period_end, cancel_at, payment_failed_at, last_event_at, updated_at`;

/** Statuses that keep the paid plan (subject to grace / scheduled cancel). */
const PLAN_STATUSES = new Set<string>(["active", "trialing", "past_due"]);
/** Statuses where the org still has a subscription that must be managed via portal/changePlan. */
const SUBSCRIBED_STATUSES = new Set<string>(["active", "trialing", "past_due", "unpaid", "paused"]);

const DAY_MS = 86_400_000;
const PRICE_CACHE_MS = 10 * 60_000;

type ApplyResult =
  | {
      kind: "applied";
      orgId: string;
      from: string;
      to: string;
      canceled: boolean;
      changed: boolean;
      cancellationScheduled: { planId: string; endsAt: Date | null } | null;
    }
  | { kind: "stale"; orgId: string }
  | { kind: "foreign" }
  | { kind: "unknown_price"; orgId: string; lookupKey: string | null; priceId: string | null };

const toDate = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
const secToDate = (s: number | null): Date | null => (s == null ? null : new Date(s * 1000));

function rowFromDb(r: Record<string, unknown>): SubRow {
  return {
    ...(r as unknown as SubRow),
    current_period_end: toDate(r.current_period_end),
    cancel_at: toDate(r.cancel_at),
    payment_failed_at: toDate(r.payment_failed_at),
    last_event_at: toDate(r.last_event_at)!,
    updated_at: toDate(r.updated_at)!,
  };
}

function subscriptionRank(s: GatewaySubscription): number {
  if (s.status === "active" || s.status === "trialing") return 3;
  if (s.status === "past_due" || s.status === "unpaid" || s.status === "paused") return 2;
  if (s.status === "incomplete") return 1;
  return 0;
}

/** The subscription that should represent the org: live ones first, then the newest. */
export function pickPrimarySubscription(subs: GatewaySubscription[]): GatewaySubscription | null {
  const sorted = [...subs].sort((a, b) => subscriptionRank(b) - subscriptionRank(a) || b.created - a.created);
  return sorted[0] ?? null;
}

function errMessage(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 2000);
}

function isNotFound(e: unknown): boolean {
  const o = e as { statusCode?: number; code?: string } | null;
  return !!o && (o.statusCode === 404 || o.code === "resource_missing");
}

const PERIOD_RE = /^[A-Za-z0-9:_-]{1,40}$/;
/** Stripe Checkout Session ids (cs_test_..., cs_live_...; FakeStripe: cs_test_fake...). */
const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{1,250}$/;
const MAX_PASS_IDS = 5;
const EMAIL_RE = /^[^\s@]{1,200}@[^\s@]{1,200}$/;

const PASS_COLUMNS = `id, pass_id, org_id, email, starts_at, expires_at, revoked_at`;

/** A same-site path to come back to after Checkout ("/tools/x?y=1"); anything else becomes "/". */
export function safeReturnPath(p: unknown): string {
  if (typeof p !== "string" || p.length === 0 || p.length > 300) return "/";
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("\\") || /[\u0000-\u001f]/.test(p)) return "/";
  return p;
}

// ---------------------------------------------------------------------------------------------

export function createBilling(opts: BillingOptions): Billing {
  const { handle, catalog, stripe } = opts;
  const hooks = opts.hooks ?? {};
  const now = opts.now ?? (() => new Date());
  const graceMs = (opts.gracePeriodDays ?? 7) * DAY_MS;
  const freePlan = getFreePlan(catalog);
  const configured = stripe.mode !== "none";
  if (configured && !opts.webhookSecret) throw new Error("createBilling: webhookSecret is required");
  if (opts.passCookie && (opts.passCookie.secret.length < 32 || !/^[A-Za-z0-9_-]{1,40}$/.test(opts.passCookie.name))) {
    throw new Error("createBilling: passCookie needs a cookie name and a secret of at least 32 characters");
  }
  let appOrigin: URL;
  try {
    appOrigin = new URL(opts.appUrl);
  } catch {
    throw new Error("createBilling: appUrl must be an absolute URL");
  }
  const appUrl = appOrigin.origin;
  const paths = {
    checkoutSuccess: opts.paths?.checkoutSuccess ?? "/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    checkoutCancel: opts.paths?.checkoutCancel ?? "/billing?checkout=canceled",
    portalReturn: opts.paths?.portalReturn ?? "/billing",
  };
  const ex = handle.executor;

  // ---- helpers ---------------------------------------------------------------------------

  async function safeHook(name: string, fn: (() => Promise<void>) | undefined, ctx: { orgId?: string; eventId?: string }) {
    if (!fn) return null;
    try {
      await fn();
      return null;
    } catch (e) {
      const message = `hook ${name} failed: ${errMessage(e)}`;
      if (name !== "onAnomaly") {
        await safeHook("onAnomaly", hooks.onAnomaly && (() => hooks.onAnomaly!({ kind: "hook_failed", message, ...ctx })), ctx);
      }
      return message;
    }
  }

  async function loadSub(q: SqlExecutor, orgId: string, forUpdate = false): Promise<SubRow | null> {
    const { rows } = await q.query<Record<string, unknown>>(
      `SELECT ${SUB_COLUMNS} FROM billing_subscriptions WHERE org_id = $1${forUpdate ? " FOR UPDATE" : ""}`,
      [orgId],
    );
    return rows[0] ? rowFromDb(rows[0]) : null;
  }

  async function orgForCustomer(q: SqlExecutor, customerId: string): Promise<string | null> {
    if (!customerId) return null;
    const { rows } = await q.query<{ org_id: string }>(
      `SELECT org_id FROM billing_customers WHERE stripe_customer_id = $1`,
      [customerId],
    );
    return rows[0]?.org_id ?? null;
  }

  /** Plan the org is paying for according to the row (ignores grace expiry). */
  function subscribedPlanId(row: SubRow | null): string {
    if (!row || !PLAN_STATUSES.has(row.status)) return freePlan.id;
    return getPlan(catalog, row.plan_id)?.id ?? freePlan.id;
  }

  function passDefOf(passId: string): PassDef | undefined {
    return getPass(catalog, passId);
  }

  function activePassOf(r: Record<string, unknown>): ActivePass | null {
    const def = passDefOf(String(r.pass_id));
    if (!def) return null;
    return {
      id: String(r.id),
      passId: def.id,
      name: def.name,
      orgId: (r.org_id as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      startsAt: toDate(r.starts_at)!,
      expiresAt: toDate(r.expires_at)!,
    };
  }

  function computeEntitlements(row: SubRow | null, passes: ActivePass[] = []): Entitlements {
    const t = now().getTime();
    let effective: PlanDef = freePlan;
    let graceEndsAt: Date | null = null;
    const subscribed = subscribedPlanId(row);
    if (row && subscribed !== freePlan.id) {
      const plan = getPlan(catalog, subscribed)!;
      if (row.status === "active" || row.status === "trialing") {
        effective = plan;
      } else if (row.status === "past_due") {
        const since = row.payment_failed_at ?? row.updated_at;
        graceEndsAt = new Date(since.getTime() + graceMs);
        if (t < graceEndsAt.getTime()) effective = plan;
      }
      if (effective !== freePlan && row.cancel_at_period_end) {
        const endsAt = row.cancel_at ?? row.current_period_end;
        if (endsAt && t >= endsAt.getTime()) effective = freePlan;
      }
    }
    const defs = passes.map((p) => passDefOf(p.passId)).filter((d): d is PassDef => !!d);
    const granted = applyPassGrants(effective.limits, effective.features, defs);
    const longest = [...passes].sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
    return {
      planId: effective.id,
      planName: effective.name,
      status: row?.status ?? "none",
      limits: granted.limits,
      features: granted.features,
      cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
      currentPeriodEnd: row?.current_period_end ?? null,
      graceEndsAt,
      subscribedPlanId: subscribed,
      pass: longest ? { id: longest.id, passId: longest.passId, name: longest.name, expiresAt: longest.expiresAt } : null,
    };
  }

  /**
   * Writes Stripe's view of a subscription into billing_subscriptions.
   * versionSec: Stripe event `created` (webhooks) or the current time (API results we just
   * fetched: reconcile, changePlan, cancel). Older versions never overwrite newer ones.
   * Runs inside `tx`; returns what changed so hooks can run after commit.
   */
  async function applySubscription(
    tx: SqlExecutor,
    sub: GatewaySubscription,
    versionSec: number,
  ): Promise<ApplyResult> {
    const orgId = await orgForCustomer(tx, sub.customer);
    if (!orgId) return { kind: "foreign" };
    const plan = planByLookupKey(catalog, sub.priceLookupKey);
    if (!plan || plan.id === freePlan.id) {
      return { kind: "unknown_price", orgId, lookupKey: sub.priceLookupKey, priceId: sub.priceId };
    }
    await advisoryXactLock(tx, `billing-sub:${orgId}`);
    const existing = await loadSub(tx, orgId, true);
    const version = new Date(versionSec * 1000);
    if (existing) {
      const sameSub = existing.stripe_subscription_id === sub.id;
      // An event for an old/other subscription must not replace a live one.
      if (!sameSub && SUBSCRIBED_STATUSES.has(existing.status) && !SUBSCRIBED_STATUSES.has(sub.status)) {
        return { kind: "stale", orgId };
      }
      if (sameSub && existing.last_event_at.getTime() > version.getTime()) {
        return { kind: "stale", orgId };
      }
    }
    // A subscription id may already sit on another org row only through data corruption; the
    // UNIQUE constraint then fails loudly and the event is retried / surfaced.
    const failing = sub.status === "past_due" || sub.status === "unpaid";
    const failedAt = failing ? (existing?.payment_failed_at ?? version) : null;
    const { rows } = await tx.query<Record<string, unknown>>(
      `INSERT INTO billing_subscriptions (org_id, stripe_subscription_id, stripe_customer_id, plan_id, status,
         stripe_price_id, current_period_end, cancel_at_period_end, cancel_at, payment_failed_at, last_event_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (org_id) DO UPDATE SET
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         stripe_customer_id = EXCLUDED.stripe_customer_id,
         plan_id = EXCLUDED.plan_id,
         status = EXCLUDED.status,
         stripe_price_id = EXCLUDED.stripe_price_id,
         current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         cancel_at = EXCLUDED.cancel_at,
         payment_failed_at = EXCLUDED.payment_failed_at,
         last_event_at = GREATEST(billing_subscriptions.last_event_at, EXCLUDED.last_event_at),
         updated_at = EXCLUDED.updated_at
       RETURNING ${SUB_COLUMNS}`,
      [
        orgId,
        sub.id,
        sub.customer,
        plan.id,
        sub.status,
        sub.priceId,
        secToDate(sub.currentPeriodEnd),
        sub.cancelAtPeriodEnd,
        secToDate(sub.cancelAt),
        failedAt,
        version,
        now(),
      ],
    );
    const after = rowFromDb(rows[0]!);
    const changed =
      !existing ||
      existing.stripe_subscription_id !== after.stripe_subscription_id ||
      existing.status !== after.status ||
      existing.plan_id !== after.plan_id ||
      existing.stripe_price_id !== after.stripe_price_id ||
      existing.cancel_at_period_end !== after.cancel_at_period_end ||
      existing.current_period_end?.getTime() !== after.current_period_end?.getTime() ||
      existing.cancel_at?.getTime() !== after.cancel_at?.getTime();
    // onSubscriptionCanceled: a subscription the org actually had (not an abandoned incomplete one) ended.
    const canceled =
      !!existing &&
      existing.stripe_subscription_id === after.stripe_subscription_id &&
      SUBSCRIBED_STATUSES.has(existing.status) &&
      !SUBSCRIBED_STATUSES.has(after.status) &&
      after.status !== "incomplete";
    const wasScheduled = !!existing && (existing.cancel_at_period_end || existing.cancel_at != null);
    const isScheduled = SUBSCRIBED_STATUSES.has(after.status) && (after.cancel_at_period_end || after.cancel_at != null);
    const cancellationScheduled =
      isScheduled && !wasScheduled
        ? { planId: subscribedPlanId(after), endsAt: after.cancel_at ?? after.current_period_end ?? null }
        : null;
    return {
      kind: "applied",
      orgId,
      from: subscribedPlanId(existing),
      to: subscribedPlanId(after),
      canceled,
      changed,
      cancellationScheduled,
    };
  }

  async function runApplyHooks(r: ApplyResult, eventId?: string): Promise<string[]> {
    const errors: string[] = [];
    if (r.kind === "applied") {
      if (r.from !== r.to) {
        const e = await safeHook("onPlanChanged", hooks.onPlanChanged && (() => hooks.onPlanChanged!(r.orgId, r.from, r.to)), {
          orgId: r.orgId,
          eventId,
        });
        if (e) errors.push(e);
      }
      if (r.cancellationScheduled) {
        const info = r.cancellationScheduled;
        const e = await safeHook(
          "onCancellationScheduled",
          hooks.onCancellationScheduled && (() => hooks.onCancellationScheduled!(r.orgId, info)),
          { orgId: r.orgId, eventId },
        );
        if (e) errors.push(e);
      }
      if (r.canceled) {
        const e = await safeHook(
          "onSubscriptionCanceled",
          hooks.onSubscriptionCanceled && (() => hooks.onSubscriptionCanceled!(r.orgId)),
          { orgId: r.orgId, eventId },
        );
        if (e) errors.push(e);
      }
    } else if (r.kind === "unknown_price") {
      const message = `Stripe price ${r.priceId ?? "?"} (lookup key ${r.lookupKey ?? "none"}) is not in the ${catalog.app} catalog`;
      const e = await safeHook(
        "onAnomaly",
        hooks.onAnomaly && (() => hooks.onAnomaly!({ kind: "unknown_price", message, orgId: r.orgId, eventId })),
        { orgId: r.orgId, eventId },
      );
      if (e) errors.push(e);
    }
    return errors;
  }

  /** Applies an API-fetched subscription outside of webhook processing (version = now). */
  async function applyFetched(sub: GatewaySubscription): Promise<ApplyResult> {
    const version = Math.floor(now().getTime() / 1000);
    const r = await handle.transaction((tx) => applySubscription(tx, sub, version));
    await runApplyHooks(r);
    return r;
  }

  // ---- prices & customers ----------------------------------------------------------------

  const priceCache = new Map<string, { id: string; at: number }>();
  async function priceIdFor(plan: PlanDef): Promise<string> {
    return priceIdForKey(plan.stripeLookupKey!, plan.priceMonthlyCents);
  }

  async function priceIdForKey(key: string, cents: number): Promise<string> {
    const cached = priceCache.get(key);
    if (cached && Date.now() - cached.at < PRICE_CACHE_MS) return cached.id;
    const prices = (await stripe.prices.listByLookupKeys([key])).filter((p) => p.active && p.lookupKey === key);
    if (prices.length !== 1) {
      throw new BillingError(
        "price_not_configured",
        `Expected exactly one active Stripe price with lookup key ${key}, found ${prices.length}. Run scripts/setup-stripe-test.ts.`,
        500,
      );
    }
    const p = prices[0]!;
    if (p.unitAmount !== cents) {
      throw new BillingError(
        "price_not_configured",
        `Stripe price ${key} is ${p.unitAmount} cents but the catalog says ${cents}`,
        500,
      );
    }
    priceCache.set(key, { id: p.id, at: Date.now() });
    return p.id;
  }

  async function getCustomerId(orgId: string): Promise<string | null> {
    const { rows } = await ex.query<{ stripe_customer_id: string }>(
      `SELECT stripe_customer_id FROM billing_customers WHERE org_id = $1`,
      [orgId],
    );
    return rows[0]?.stripe_customer_id ?? null;
  }

  /**
   * Race-safe: an advisory lock per org serialises concurrent creators, the second one sees the
   * row; the PRIMARY KEY on org_id is the backstop; the Stripe idempotency key makes a retried
   * create (e.g. after a crash before COMMIT) return the same customer within 24 h.
   */
  async function getOrCreateCustomer(orgId: string, email: string): Promise<string> {
    const existing = await getCustomerId(orgId);
    if (existing) return existing;
    return handle.transaction(async (tx) => {
      await advisoryXactLock(tx, `billing-customer:${orgId}`);
      const { rows } = await tx.query<{ stripe_customer_id: string }>(
        `SELECT stripe_customer_id FROM billing_customers WHERE org_id = $1`,
        [orgId],
      );
      if (rows[0]) return rows[0].stripe_customer_id;
      const customer = await stripe.customers.create(
        { email: email || undefined, metadata: { orgId, app: catalog.app } },
        { idempotencyKey: `${catalog.app}-customer-${orgId}` },
      );
      const ins = await tx.query<{ stripe_customer_id: string }>(
        `INSERT INTO billing_customers (org_id, stripe_customer_id) VALUES ($1, $2)
         ON CONFLICT (org_id) DO NOTHING RETURNING stripe_customer_id`,
        [orgId, customer.id],
      );
      if (ins.rows[0]) return ins.rows[0].stripe_customer_id;
      const again = await tx.query<{ stripe_customer_id: string }>(
        `SELECT stripe_customer_id FROM billing_customers WHERE org_id = $1`,
        [orgId],
      );
      return again.rows[0]!.stripe_customer_id;
    });
  }

  function requireOrgId(orgId: string) {
    if (typeof orgId !== "string" || orgId.length === 0 || orgId.length > 200) {
      throw new BillingError("invalid_input", "orgId required", 400);
    }
  }

  function periodOf(p?: string): string {
    if (p === undefined) return currentPeriod();
    if (!PERIOD_RE.test(p)) throw new BillingError("invalid_input", "invalid usage period", 400);
    return p;
  }

  function currentPeriod(): string {
    return now().toISOString().slice(0, 7);
  }

  // ---- webhook ---------------------------------------------------------------------------

  type Prepared =
    | { kind: "subscription"; sub: GatewaySubscription; payment?: PaymentFailedInfo; expectOrg?: string }
    | { kind: "pass"; session: GatewayCheckoutSession }
    | { kind: "refund"; paymentIntent: string }
    | { kind: "ignore"; reason: string };

  async function retrieveOrSnapshot(id: string, snapshot?: Record<string, unknown>): Promise<GatewaySubscription> {
    try {
      return await stripe.subscriptions.retrieve(id);
    } catch (e) {
      if (isNotFound(e) && snapshot) return normalizeSubscription(snapshot);
      throw e;
    }
  }

  /** Network part (outside DB transactions): figure out which subscription and fetch it. */
  async function prepare(event: GatewayEvent): Promise<Prepared> {
    const o = event.object;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        if (o.mode === "payment") {
          const md = (o.metadata ?? {}) as Record<string, unknown>;
          if (md.app !== catalog.app || md.kind !== "pass") return { kind: "ignore", reason: "payment checkout of another product" };
          // Source of truth: re-fetch the session (payment status) from Stripe.
          return { kind: "pass", session: await stripe.checkout.sessions.retrieve(String(o.id)) };
        }
        if (event.type !== "checkout.session.completed") return { kind: "ignore", reason: "async payment of a subscription checkout" };
        if (o.mode !== "subscription") return { kind: "ignore", reason: "not a subscription checkout" };
        const subId = typeof o.subscription === "string" ? o.subscription : (o.subscription as { id?: string })?.id;
        if (!subId) return { kind: "ignore", reason: "checkout without subscription" };
        const expectOrg = typeof o.client_reference_id === "string" ? o.client_reference_id : undefined;
        return { kind: "subscription", sub: await stripe.subscriptions.retrieve(subId), expectOrg };
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        return { kind: "subscription", sub: await retrieveOrSnapshot(String(o.id), o) };
      }
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const subId = invoiceSubscriptionId(o);
        if (!subId) return { kind: "ignore", reason: "invoice without subscription" };
        const sub = await stripe.subscriptions.retrieve(subId);
        if (event.type !== "invoice.payment_failed") return { kind: "subscription", sub };
        const next = typeof o.next_payment_attempt === "number" ? o.next_payment_attempt : null;
        return {
          kind: "subscription",
          sub,
          payment: {
            invoiceId: String(o.id),
            amountDueCents: typeof o.amount_due === "number" ? o.amount_due : 0,
            nextAttemptAt: secToDate(next),
          },
        };
      }
      case "customer.subscription.trial_will_end":
        return { kind: "ignore", reason: "trial_will_end needs no state change" };
      case "charge.refunded": {
        // Only a full refund ends a pass. Charges of other products / the other business match no pass row.
        const pi = typeof o.payment_intent === "string" ? o.payment_intent : (o.payment_intent as { id?: string } | null)?.id;
        if (!pi || o.refunded !== true) return { kind: "ignore", reason: "partial refund or no payment intent" };
        return { kind: "refund", paymentIntent: pi };
      }
      default:
        return { kind: "ignore", reason: `unhandled event type ${event.type}` };
    }
  }

  async function handleWebhook(rawBody: string, signatureHeader: string | null) {
    const text = (status: number, body: string) => ({ status, body });
    if (!configured) return text(503, "billing not configured");
    if (!signatureHeader) return text(400, "missing Stripe-Signature header");
    if (typeof rawBody !== "string" || rawBody.length === 0) return text(400, "empty body");
    let event: GatewayEvent;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signatureHeader, opts.webhookSecret!);
    } catch {
      return text(400, "invalid signature");
    }
    if (event.livemode && stripe.mode !== "live") return text(400, "live event sent to a test-mode endpoint");

    const known = await ex.query<{ processed_at: unknown }>(`SELECT processed_at FROM billing_events WHERE id = $1`, [
      event.id,
    ]);
    if (known.rows[0]?.processed_at) return text(200, JSON.stringify({ received: true, duplicate: true }));
    await ex.query(
      `INSERT INTO billing_events (id, type, created_at, received_at, attempts) VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.type, new Date(event.created * 1000), now()],
    );
    await ex.query(`UPDATE billing_events SET attempts = attempts + 1 WHERE id = $1`, [event.id]);

    try {
      const prepared = await prepare(event);
      const outcome = await handle.transaction(async (tx) => {
        const claim = await tx.query<{ processed_at: unknown }>(
          `SELECT processed_at FROM billing_events WHERE id = $1 FOR UPDATE`,
          [event.id],
        );
        if (claim.rows[0]?.processed_at) return { duplicate: true as const };
        let result: ApplyResult | null = null;
        let label: string;
        let error: string | null = null;
        let orgId: string | null = null;
        let newPass: ActivePass | null = null;
        if (prepared.kind === "ignore") {
          label = "ignored";
          error = null;
        } else if (prepared.kind === "pass") {
          const r = await recordPassTx(tx, prepared.session);
          if (r.kind === "rejected") {
            label = "ignored";
            error = r.reason;
          } else {
            label = "processed";
            orgId = r.pass.orgId;
            if (r.kind === "created") newPass = r.pass;
          }
        } else if (prepared.kind === "refund") {
          const { rows } = await tx.query<{ id: string; org_id: string | null }>(
            `UPDATE billing_passes SET revoked_at = $2 WHERE payment_intent_id = $1 AND app = $3 AND revoked_at IS NULL
             RETURNING id, org_id`,
            [prepared.paymentIntent, now(), catalog.app],
          );
          label = rows.length ? "processed" : "ignored";
          orgId = rows[0]?.org_id ?? null;
        } else {
          result = await applySubscription(tx, prepared.sub, event.created);
          if (result.kind === "foreign") {
            label = "ignored";
            error = `customer ${prepared.sub.customer} is not managed by ${catalog.app}`;
          } else {
            orgId = result.orgId;
            if (result.kind === "unknown_price") {
              label = "unknown_price";
              error = `unknown price ${result.priceId ?? "?"} (lookup key ${result.lookupKey ?? "none"})`;
            } else {
              label = result.kind === "stale" ? "stale" : "processed";
              if (prepared.expectOrg && prepared.expectOrg !== result.orgId) {
                error = `client_reference_id ${prepared.expectOrg} does not match customer org ${result.orgId}`;
              }
            }
          }
        }
        await tx.query(
          `UPDATE billing_events SET processed_at = $2, outcome = $3, error = $4, org_id = $5 WHERE id = $1`,
          [event.id, now(), label, error, orgId],
        );
        return { duplicate: false as const, result, label, orgId, error, newPass };
      });
      if (outcome.duplicate) return text(200, JSON.stringify({ received: true, duplicate: true }));

      // Side effects after COMMIT, exactly once per event id.
      const hookErrors: string[] = [];
      if (outcome.result) hookErrors.push(...(await runApplyHooks(outcome.result, event.id)));
      if (outcome.newPass) {
        const pass = outcome.newPass;
        const e = await safeHook("onPassPurchased", hooks.onPassPurchased && (() => hooks.onPassPurchased!(pass)), {
          orgId: pass.orgId ?? undefined,
          eventId: event.id,
        });
        if (e) hookErrors.push(e);
      }
      if (outcome.error && outcome.label === "processed" && outcome.orgId) {
        const e = await safeHook(
          "onAnomaly",
          hooks.onAnomaly &&
            (() => hooks.onAnomaly!({ kind: "org_mismatch", message: outcome.error!, orgId: outcome.orgId!, eventId: event.id })),
          { orgId: outcome.orgId, eventId: event.id },
        );
        if (e) hookErrors.push(e);
      }
      if (prepared.kind === "subscription" && prepared.payment && outcome.orgId && outcome.label !== "unknown_price") {
        const orgId = outcome.orgId;
        const info = prepared.payment;
        const e = await safeHook("onPaymentFailed", hooks.onPaymentFailed && (() => hooks.onPaymentFailed!(orgId, info)), {
          orgId,
          eventId: event.id,
        });
        if (e) hookErrors.push(e);
      }
      if (hookErrors.length) {
        await ex.query(`UPDATE billing_events SET error = concat_ws('; ', error, $2::text) WHERE id = $1`, [
          event.id,
          hookErrors.join("; ").slice(0, 2000),
        ]);
      }
      return text(200, JSON.stringify({ received: true, outcome: outcome.label }));
    } catch (e) {
      // Not marked processed: Stripe retries with backoff (up to 3 days), reconcile() covers the rest.
      await ex
        .query(`UPDATE billing_events SET outcome = 'failed', error = $2 WHERE id = $1`, [event.id, errMessage(e)])
        .catch(() => {});
      return text(500, "processing failed");
    }
  }

  // ---- public API --------------------------------------------------------------------------

  async function getEntitlements(orgId: string | null, o?: { passIds?: string[] }): Promise<Entitlements> {
    if (orgId !== null) requireOrgId(orgId);
    const [row, passes] = await Promise.all([
      orgId === null ? Promise.resolve(null) : loadSub(ex, orgId),
      getActivePasses({ orgId, passIds: o?.passIds }),
    ]);
    return computeEntitlements(row, passes);
  }

  // ---- one-time passes ---------------------------------------------------------------------

  async function getActivePasses(o: { orgId?: string | null; passIds?: string[] }): Promise<ActivePass[]> {
    if (!catalog.passes?.length) return [];
    const ids = (o.passIds ?? []).filter((id) => typeof id === "string" && SESSION_ID_RE.test(id)).slice(0, MAX_PASS_IDS);
    const orgId = o.orgId ?? null;
    if (!orgId && ids.length === 0) return [];
    const { rows } = await ex.query<Record<string, unknown>>(
      `SELECT ${PASS_COLUMNS} FROM billing_passes
       WHERE app = $1 AND revoked_at IS NULL AND starts_at <= $2 AND expires_at > $2
         AND (id = ANY($3::text[]) OR ($4::text IS NOT NULL AND org_id = $4::text))
       ORDER BY expires_at DESC`,
      [catalog.app, now(), ids, orgId],
    );
    return rows.map(activePassOf).filter((p): p is ActivePass => !!p);
  }

  type RecordResult = { kind: "created" | "existing"; pass: ActivePass } | { kind: "rejected"; reason: string };

  /** Records a paid pass session once (id = session id). The pass starts when it is first recorded. */
  async function recordPassTx(tx: SqlExecutor, session: GatewayCheckoutSession): Promise<RecordResult> {
    const md = session.metadata ?? {};
    if (session.mode !== "payment" || md.app !== catalog.app || md.kind !== "pass") {
      return { kind: "rejected", reason: `checkout ${session.id} is not a ${catalog.app} pass` };
    }
    const def = passDefOf(md.passId ?? "");
    if (!def) return { kind: "rejected", reason: `checkout ${session.id} names unknown pass ${md.passId ?? "?"}` };
    if (session.paymentStatus !== "paid") return { kind: "rejected", reason: `checkout ${session.id} is not paid (${session.paymentStatus})` };
    const startsAt = now();
    const expiresAt = new Date(startsAt.getTime() + def.durationHours * 3_600_000);
    const orgId = typeof md.orgId === "string" && md.orgId.length > 0 && md.orgId.length <= 200 ? md.orgId : null;
    const ins = await tx.query<Record<string, unknown>>(
      `INSERT INTO billing_passes (id, app, pass_id, org_id, email, stripe_customer_id, payment_intent_id, amount_cents,
         currency, livemode, starts_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING
       RETURNING ${PASS_COLUMNS}`,
      [
        session.id,
        catalog.app,
        def.id,
        orgId,
        session.customerEmail ? session.customerEmail.slice(0, 320) : null,
        session.customer,
        session.paymentIntent,
        session.amountTotal,
        session.currency,
        session.livemode,
        startsAt,
        expiresAt,
      ],
    );
    if (ins.rows[0]) return { kind: "created", pass: activePassOf(ins.rows[0])! };
    const again = (await tx.query<Record<string, unknown>>(`SELECT ${PASS_COLUMNS} FROM billing_passes WHERE id = $1`, [session.id])).rows[0]!;
    return { kind: "existing", pass: activePassOf(again)! };
  }

  async function createPassCheckout(
    passId: string,
    o: { orgId?: string | null; email?: string | null; returnPath?: string } = {},
  ): Promise<{ url: string; id: string }> {
    const def = typeof passId === "string" ? passDefOf(passId) : undefined;
    if (!def) throw new BillingError("invalid_plan", `Unknown pass "${String(passId)}"`, 400);
    if (o.orgId != null) requireOrgId(o.orgId);
    if (!configured) throw new BillingNotConfiguredError();
    const price = await priceIdForKey(def.stripeLookupKey, def.priceCents);
    const back = safeReturnPath(o.returnPath);
    const metadata: Record<string, string> = { app: catalog.app, kind: "pass", passId: def.id, ...(o.orgId ? { orgId: o.orgId } : {}) };
    const email = typeof o.email === "string" && EMAIL_RE.test(o.email) ? o.email : undefined;
    const sep = back.includes("?") ? "&" : "?";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      ...(email ? { customer_email: email } : {}),
      ...(o.orgId ? { client_reference_id: o.orgId } : {}),
      line_items: [{ price, quantity: 1 }],
      // The claim route verifies the session with Stripe, records the pass and sets the pass cookie.
      success_url: `${appUrl}/api/billing/pass/claim?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(back)}`,
      cancel_url: `${appUrl}${back}${sep}pass=canceled`,
      allow_promotion_codes: opts.allowPromotionCodes ?? false,
      metadata,
      payment_intent_data: {
        metadata,
        ...(opts.passStatementDescriptorSuffix ? { statement_descriptor_suffix: opts.passStatementDescriptorSuffix.slice(0, 22) } : {}),
      },
      ...(opts.checkoutBranding ? { branding_settings: opts.checkoutBranding } : {}),
      ...(opts.automaticTax
        ? { automatic_tax: { enabled: true }, billing_address_collection: "required" as const, tax_id_collection: { enabled: true } }
        : {}),
    });
    return { url: session.url, id: session.id };
  }

  async function claimPass(sessionId: string): Promise<PassClaim> {
    if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) return { status: "invalid" };
    if (!catalog.passes?.length) return { status: "invalid" };
    const load = async () =>
      (await ex.query<Record<string, unknown>>(`SELECT ${PASS_COLUMNS} FROM billing_passes WHERE id = $1 AND app = $2`, [
        sessionId,
        catalog.app,
      ])).rows[0];
    let raw = await load();
    if (!raw) {
      if (!configured) return { status: "invalid" };
      let session: GatewayCheckoutSession;
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
      } catch (e) {
        if (isNotFound(e)) return { status: "invalid" };
        throw e;
      }
      const md = session.metadata ?? {};
      if (session.mode !== "payment" || md.app !== catalog.app || md.kind !== "pass") return { status: "invalid" };
      if (session.paymentStatus !== "paid") return { status: "unpaid" };
      const r = await handle.transaction((tx) => recordPassTx(tx, session));
      if (r.kind === "rejected") return { status: "invalid" };
      if (r.kind === "created") {
        const pass = r.pass;
        await safeHook("onPassPurchased", hooks.onPassPurchased && (() => hooks.onPassPurchased!(pass)), { orgId: pass.orgId ?? undefined });
      }
      raw = await load();
    }
    const pass = raw ? activePassOf(raw) : null;
    if (!raw || !pass) return { status: "invalid" };
    if (raw.revoked_at) return { status: "revoked", pass };
    if (pass.expiresAt.getTime() <= now().getTime()) return { status: "expired", pass };
    return { status: "active", pass };
  }

  function passIdsFromCookieHeader(cookieHeader: string | null): string[] {
    if (!opts.passCookie || !cookieHeader) return [];
    const v = readCookie(cookieHeader, opts.passCookie.name);
    const id = v ? verifyPassToken(v, opts.passCookie.secret) : null;
    return id && SESSION_ID_RE.test(id) ? [id] : [];
  }

  function passSetCookie(pass: Pick<ActivePass, "id"> & { expiresAt: Date | null }, o?: { secure?: boolean }): string | null {
    if (!opts.passCookie) return null;
    // expiresAt null = payment still pending: keep the reference long enough for a delayed payment to clear and the
    // pass to run its full length (entitlements only count it once the paid session is recorded).
    const longest = Math.max(0, ...(catalog.passes ?? []).map((p) => p.durationHours)) * 3_600_000;
    const until = pass.expiresAt ? pass.expiresAt.getTime() : now().getTime() + 14 * DAY_MS + longest;
    const maxAge = Math.max(0, Math.floor((until - now().getTime()) / 1000));
    const secure = o?.secure ?? appOrigin.protocol === "https:";
    return `${opts.passCookie.name}=${signPassToken(pass.id, opts.passCookie.secret)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  }

  async function consumeUsage(orgId: string, metric: string, amount: number, o?: { period?: string }): Promise<UsageResult> {
    requireOrgId(orgId);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new BillingError("invalid_input", "amount must be a non-negative integer", 400);
    const ent = await getEntitlements(orgId);
    const limit = ent.limits[metric];
    if (limit === undefined) throw new Error(`Unknown usage metric "${metric}" for ${catalog.app}`);
    const period = periodOf(o?.period);
    let rows: { used: string | number | bigint }[];
    if (limit === -1) {
      ({ rows } = await ex.query<{ used: string | number | bigint }>(
        `INSERT INTO billing_usage AS u (org_id, metric, period, used) VALUES ($1, $2, $3, $4::bigint)
         ON CONFLICT (org_id, metric, period) DO UPDATE SET used = u.used + EXCLUDED.used
         RETURNING used`,
        [orgId, metric, period, amount],
      ));
    } else {
      // One statement: the row lock taken by ON CONFLICT DO UPDATE makes check-and-increment atomic
      // under concurrency (the WHERE is re-evaluated against the latest row version).
      ({ rows } = await ex.query<{ used: string | number | bigint }>(
        `INSERT INTO billing_usage AS u (org_id, metric, period, used)
         SELECT $1, $2, $3, $4::bigint WHERE $4::bigint <= $5::bigint
         ON CONFLICT (org_id, metric, period) DO UPDATE SET used = u.used + EXCLUDED.used
         WHERE u.used + EXCLUDED.used <= $5::bigint
         RETURNING used`,
        [orgId, metric, period, amount, limit],
      ));
    }
    if (rows[0]) return { ok: true, used: Number(rows[0].used), limit };
    return { ok: false, used: await getUsage(orgId, metric, { period }), limit };
  }

  async function getUsage(orgId: string, metric: string, o?: { period?: string }): Promise<number> {
    const { rows } = await ex.query<{ used: string | number | bigint }>(
      `SELECT used FROM billing_usage WHERE org_id = $1 AND metric = $2 AND period = $3`,
      [orgId, metric, periodOf(o?.period)],
    );
    return rows[0] ? Number(rows[0].used) : 0;
  }

  async function releaseUsage(orgId: string, metric: string, amount: number, o?: { period?: string }): Promise<void> {
    requireOrgId(orgId);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new BillingError("invalid_input", "amount must be a non-negative integer", 400);
    await ex.query(
      `UPDATE billing_usage SET used = GREATEST(used - $4::bigint, 0) WHERE org_id = $1 AND metric = $2 AND period = $3`,
      [orgId, metric, periodOf(o?.period), amount],
    );
  }

  async function createCheckoutSession(orgId: string, planId: string, customerEmail: string) {
    requireOrgId(orgId);
    const plan = getPlan(catalog, planId);
    if (!plan || plan.id === freePlan.id || !plan.stripeLookupKey) {
      throw new BillingError("invalid_plan", `Unknown or free plan "${planId}"`, 400);
    }
    if (!configured) throw new BillingNotConfiguredError();
    const row = await loadSub(ex, orgId);
    if (row && SUBSCRIBED_STATUSES.has(row.status)) {
      throw new BillingError(
        "already_subscribed",
        "This organization already has a subscription; use the billing portal or change plan instead.",
        409,
      );
    }
    const price = await priceIdFor(plan);
    const customer = await getOrCreateCustomer(orgId, customerEmail);
    const metadata = { orgId, app: catalog.app, planId: plan.id };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: orgId,
      line_items: [{ price, quantity: 1 }],
      success_url: appUrl + paths.checkoutSuccess,
      cancel_url: appUrl + paths.checkoutCancel,
      allow_promotion_codes: opts.allowPromotionCodes ?? false,
      metadata,
      subscription_data: { metadata },
      ...(opts.checkoutBranding ? { branding_settings: opts.checkoutBranding } : {}),
      ...(opts.automaticTax
        ? {
            automatic_tax: { enabled: true },
            billing_address_collection: "required" as const,
            // Saves the address Checkout collects on the existing customer, so renewals are taxed the same way.
            customer_update: { address: "auto" as const, name: "auto" as const },
            tax_id_collection: { enabled: true },
          }
        : {}),
    });
    return { url: session.url, id: session.id };
  }

  let portalConfiguration: Promise<string | null> | undefined;

  async function createPortalSession(orgId: string) {
    requireOrgId(orgId);
    if (!configured) throw new BillingNotConfiguredError();
    const customer = await getCustomerId(orgId);
    if (!customer) throw new BillingError("no_customer", "No billing account yet; choose a plan first.", 404);
    // Product-specific portal (only this app's plans offered); falls back to the account default.
    portalConfiguration ??= stripe.billingPortal.configurations
      ? stripe.billingPortal.configurations.findForApp(catalog.app).catch(() => null)
      : Promise.resolve(null);
    const configuration = (await portalConfiguration) ?? undefined;
    if (!configuration) portalConfiguration = undefined; // retry the lookup next time
    return stripe.billingPortal.sessions.create({ customer, return_url: appUrl + paths.portalReturn, ...(configuration ? { configuration } : {}) });
  }

  async function changePlan(orgId: string, planId: string): Promise<Entitlements> {
    requireOrgId(orgId);
    const plan = getPlan(catalog, planId);
    if (!plan) throw new BillingError("invalid_plan", `Unknown plan "${planId}"`, 400);
    const row = await loadSub(ex, orgId);
    if (!row || !SUBSCRIBED_STATUSES.has(row.status)) {
      throw new BillingError("not_subscribed", "No active subscription; start a checkout instead.", 409);
    }
    const current = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    let updated: GatewaySubscription;
    if (plan.id === freePlan.id) {
      // Downgrade to free = cancel at the end of the paid period (no refund for the rest of it).
      updated = await stripe.subscriptions.update(current.id, { cancel_at_period_end: true });
    } else {
      if (!current.itemId) throw new Error(`subscription ${current.id} has no items`);
      const price = await priceIdFor(plan);
      updated = await stripe.subscriptions.update(current.id, {
        items: [{ id: current.itemId, price }],
        proration_behavior: opts.prorationBehavior ?? "create_prorations",
        cancel_at_period_end: false,
        metadata: { orgId, app: catalog.app, planId: plan.id },
      });
    }
    await applyFetched(updated);
    return getEntitlements(orgId);
  }

  async function cancelImmediately(orgId: string): Promise<void> {
    requireOrgId(orgId);
    const customer = await getCustomerId(orgId);
    if (!customer) return;
    // Cancel every live subscription of the customer, not only the one we know about.
    const subs = await stripe.subscriptions.list({ customer });
    for (const s of subs) {
      if (s.status === "canceled" || s.status === "incomplete_expired") continue;
      await applyFetched(await stripe.subscriptions.cancel(s.id, { prorate: false }));
    }
  }

  async function reconcile() {
    if (!configured) return { checked: 0, fixed: 0, errors: 0 };
    const { rows } = await ex.query<{ org_id: string; stripe_customer_id: string }>(
      `SELECT org_id, stripe_customer_id FROM billing_customers ORDER BY org_id`,
    );
    let checked = 0;
    let fixed = 0;
    let errors = 0;
    for (const c of rows) {
      checked++;
      try {
        const subs = await stripe.subscriptions.list({ customer: c.stripe_customer_id });
        const primary = pickPrimarySubscription(subs);
        if (!primary) continue;
        const r = await applyFetched(primary);
        if (r.kind === "applied" && r.changed) fixed++;
        if (r.kind === "unknown_price") errors++;
      } catch (e) {
        errors++;
        await safeHook(
          "onAnomaly",
          hooks.onAnomaly &&
            (() => hooks.onAnomaly!({ kind: "reconcile_failed", message: errMessage(e), orgId: c.org_id })),
          { orgId: c.org_id },
        );
      }
    }
    return { checked, fixed, errors };
  }

  return {
    catalog,
    appUrl,
    getEntitlements,
    createPassCheckout,
    claimPass,
    getActivePasses,
    passIdsFromCookieHeader,
    passSetCookie,
    consumeUsage,
    releaseUsage,
    getUsage,
    createCheckoutSession,
    createPortalSession,
    changePlan,
    handleWebhook,
    reconcile,
    cancelImmediately,
    currentPeriod,
  };
}
