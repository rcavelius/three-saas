/**
 * StripeGateway: the minimal Stripe surface billing uses. Responses are normalised into small
 * plain types so the rest of the package does not depend on SDK/API-version object shapes
 * (e.g. current_period_end moved from Subscription to SubscriptionItem in API 2025-03-31).
 *
 * createStripeGateway() wraps the real SDK; FakeStripe (./testing) is the in-memory version.
 */
import Stripe from "stripe";

export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface GatewaySubscription {
  id: string;
  customer: string;
  status: SubscriptionStatus;
  /** First subscription item (billing creates single-item subscriptions). */
  itemId: string | null;
  priceId: string | null;
  priceLookupKey: string | null;
  /** Unix seconds. */
  currentPeriodEnd: number | null;
  /** True for cancel_at_period_end or a scheduled cancel_at (newer portal behaviour). */
  cancelAtPeriodEnd: boolean;
  /** Unix seconds; when a scheduled cancellation takes effect. */
  cancelAt: number | null;
  created: number;
  metadata: Record<string, string>;
}

export interface GatewayPrice {
  id: string;
  lookupKey: string | null;
  unitAmount: number | null;
  currency: string;
  active: boolean;
  product: string;
}

export interface GatewayEvent {
  id: string;
  type: string;
  /** Unix seconds. */
  created: number;
  livemode: boolean;
  object: Record<string, unknown>;
}

export interface CheckoutSessionParams {
  mode: "subscription";
  customer: string;
  client_reference_id: string;
  line_items: { price: string; quantity: number }[];
  success_url: string;
  cancel_url: string;
  allow_promotion_codes: boolean;
  metadata: Record<string, string>;
  subscription_data: { metadata: Record<string, string> };
}

export interface SubscriptionUpdateParams {
  items?: { id: string; price: string }[];
  proration_behavior?: "create_prorations" | "always_invoice" | "none";
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
}

export interface StripeGateway {
  /** "test"/"live" for the real SDK (from the key prefix), "fake" for FakeStripe, "none" when not configured. */
  readonly mode: "test" | "live" | "fake" | "none";
  customers: {
    create(
      params: { email?: string; metadata: Record<string, string> },
      opts?: { idempotencyKey?: string },
    ): Promise<{ id: string }>;
  };
  checkout: { sessions: { create(params: CheckoutSessionParams): Promise<{ id: string; url: string }> } };
  billingPortal: { sessions: { create(params: { customer: string; return_url: string }): Promise<{ url: string }> } };
  subscriptions: {
    retrieve(id: string): Promise<GatewaySubscription>;
    /** All subscriptions of the customer, any status (auto-paginated). */
    list(params: { customer: string }): Promise<GatewaySubscription[]>;
    update(id: string, params: SubscriptionUpdateParams): Promise<GatewaySubscription>;
    cancel(id: string, params?: { prorate?: boolean; invoice_now?: boolean }): Promise<GatewaySubscription>;
  };
  prices: { listByLookupKeys(lookupKeys: string[]): Promise<GatewayPrice[]> };
  webhooks: {
    /** Verifies the Stripe-Signature header (throws on mismatch / stale timestamp) and parses. */
    constructEvent(rawBody: string, signatureHeader: string, secret: string): GatewayEvent;
  };
}

// ---------------------------------------------------------------------------------------------
// Normalisation shared by the real gateway and FakeStripe (which stores Stripe-shaped objects).

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | undefined => (v && typeof v === "object" ? (v as Obj) : undefined);
const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : typeof asObj(v)?.id === "string" ? (asObj(v)!.id as string) : null;
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);

export function normalizeSubscription(raw: unknown): GatewaySubscription {
  const s = asObj(raw);
  if (!s || typeof s.id !== "string") throw new Error("not a subscription object");
  const items = asObj(s.items);
  const first = asObj(Array.isArray(items?.data) ? (items!.data as unknown[])[0] : undefined);
  const price = asObj(first?.price);
  const cancelAt = numOrNull(s.cancel_at);
  return {
    id: s.id,
    customer: idOf(s.customer) ?? "",
    status: String(s.status) as SubscriptionStatus,
    itemId: typeof first?.id === "string" ? first.id : null,
    priceId: typeof price?.id === "string" ? price.id : null,
    priceLookupKey: typeof price?.lookup_key === "string" ? price.lookup_key : null,
    currentPeriodEnd: numOrNull(first?.current_period_end) ?? numOrNull(s.current_period_end),
    cancelAtPeriodEnd: s.cancel_at_period_end === true || cancelAt !== null,
    cancelAt,
    created: numOrNull(s.created) ?? 0,
    metadata: (asObj(s.metadata) as Record<string, string>) ?? {},
  };
}

export function normalizePrice(raw: unknown): GatewayPrice {
  const p = asObj(raw)!;
  return {
    id: String(p.id),
    lookupKey: typeof p.lookup_key === "string" ? p.lookup_key : null,
    unitAmount: numOrNull(p.unit_amount),
    currency: String(p.currency ?? "usd"),
    active: p.active === true,
    product: idOf(p.product) ?? "",
  };
}

export function normalizeEvent(raw: unknown): GatewayEvent {
  const e = asObj(raw);
  const data = asObj(e?.data);
  const object = asObj(data?.object);
  if (!e || typeof e.id !== "string" || typeof e.type !== "string" || !object) {
    throw new Error("malformed event");
  }
  return {
    id: e.id,
    type: e.type,
    created: numOrNull(e.created) ?? 0,
    livemode: e.livemode === true,
    object,
  };
}

/** Subscription id referenced by an invoice (new `parent.subscription_details` shape or legacy field). */
export function invoiceSubscriptionId(invoice: Obj): string | null {
  const parent = asObj(invoice.parent);
  const details = asObj(parent?.subscription_details);
  return idOf(details?.subscription) ?? idOf(invoice.subscription);
}

// ---------------------------------------------------------------------------------------------
// Live-key guard

export function isLiveKey(key: string): boolean {
  return /^(sk|rk)_live_/.test(key.trim());
}

export class LiveModeRefusedError extends Error {
  constructor() {
    super(
      "Refusing to use a LIVE Stripe key. Live mode is only enabled when the owner sets " +
        "STRIPE_LIVE_MODE_AUTHORIZED=true after completing Stripe account verification.",
    );
    this.name = "LiveModeRefusedError";
  }
}

export interface StripeGatewayOptions {
  /**
   * Must be exactly `true` to accept sk_live_/rk_live_ keys. Only derive it from
   * STRIPE_LIVE_MODE_AUTHORIZED=true, which only the owner sets (see stripeGatewayFromEnv).
   */
  allowLive?: boolean;
  /** Pin an API version; defaults to the SDK's built-in version. */
  apiVersion?: string;
}

/** Wraps the real Stripe SDK. Throws for live keys unless allowLive === true. */
export function createStripeGateway(secretKey: string, opts: StripeGatewayOptions = {}): StripeGateway {
  const key = (secretKey ?? "").trim();
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+/.test(key)) {
    throw new Error("Stripe secret key must start with sk_test_/rk_test_ (or sk_live_/rk_live_ when authorized)");
  }
  const live = isLiveKey(key);
  if (live && opts.allowLive !== true) throw new LiveModeRefusedError();

  const stripe = new Stripe(key, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "repo-billing" },
    ...(opts.apiVersion ? { apiVersion: opts.apiVersion as Stripe.LatestApiVersion } : {}),
  });

  return {
    mode: live ? "live" : "test",
    customers: {
      create: async (params, o) => {
        const c = await stripe.customers.create(
          { email: params.email, metadata: params.metadata },
          o?.idempotencyKey ? { idempotencyKey: o.idempotencyKey } : undefined,
        );
        return { id: c.id };
      },
    },
    checkout: {
      sessions: {
        create: async (params) => {
          const s = await stripe.checkout.sessions.create(params);
          if (!s.url) throw new Error("Stripe returned a checkout session without url");
          return { id: s.id, url: s.url };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params) => {
          const s = await stripe.billingPortal.sessions.create(params);
          return { url: s.url };
        },
      },
    },
    subscriptions: {
      retrieve: async (id) => normalizeSubscription(await stripe.subscriptions.retrieve(id)),
      list: async ({ customer }) => {
        const out: GatewaySubscription[] = [];
        for await (const s of stripe.subscriptions.list({ customer, status: "all", limit: 100 })) {
          out.push(normalizeSubscription(s));
          if (out.length >= 1000) break;
        }
        return out;
      },
      update: async (id, params) => normalizeSubscription(await stripe.subscriptions.update(id, params)),
      cancel: async (id, params) => normalizeSubscription(await stripe.subscriptions.cancel(id, params ?? {})),
    },
    prices: {
      listByLookupKeys: async (lookupKeys) => {
        const r = await stripe.prices.list({ lookup_keys: lookupKeys, active: true, limit: 100 });
        return r.data.map(normalizePrice);
      },
    },
    webhooks: {
      constructEvent: (rawBody, header, secret) =>
        normalizeEvent(stripe.webhooks.constructEvent(rawBody, header, secret)),
    },
  };
}

/**
 * Builds the gateway from env: STRIPE_SECRET_KEY, and STRIPE_LIVE_MODE_AUTHORIZED=true (exact
 * string) to accept a live key. Only the owner sets STRIPE_LIVE_MODE_AUTHORIZED, after Stripe
 * account verification; agents and CI never do.
 */
export function stripeGatewayFromEnv(env: Record<string, string | undefined> = process.env): StripeGateway {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return createStripeGateway(key, { allowLive: env.STRIPE_LIVE_MODE_AUTHORIZED === "true" });
}

/** Thrown by the not-configured gateway; routes map it to 503 "billing not configured". */
export class BillingNotConfiguredError extends Error {
  readonly status = 503;
  readonly code = "billing_not_configured";
  constructor() {
    super("Billing is not configured (no Stripe key)");
    this.name = "BillingNotConfiguredError";
  }
}

/**
 * A gateway for running without Stripe credentials (local dev, previews): every Stripe call throws
 * BillingNotConfiguredError, so entitlements fall back to whatever the database says (free for everyone
 * until a subscription exists) and checkout/portal answer 503.
 */
export function notConfiguredGateway(): StripeGateway {
  const fail = async (): Promise<never> => {
    throw new BillingNotConfiguredError();
  };
  return {
    mode: "none",
    customers: { create: fail },
    checkout: { sessions: { create: fail } },
    billingPortal: { sessions: { create: fail } },
    subscriptions: { retrieve: fail, list: fail, update: fail, cancel: fail },
    prices: { listByLookupKeys: fail },
    webhooks: {
      constructEvent: () => {
        throw new BillingNotConfiguredError();
      },
    },
  };
}

/** Real gateway when STRIPE_SECRET_KEY is set, otherwise the not-configured gateway. */
export function stripeGatewayFromEnvOrNotConfigured(env: Record<string, string | undefined> = process.env): {
  gateway: StripeGateway;
  configured: boolean;
} {
  return env.STRIPE_SECRET_KEY
    ? { gateway: stripeGatewayFromEnv(env), configured: true }
    : { gateway: notConfiguredGateway(), configured: false };
}
