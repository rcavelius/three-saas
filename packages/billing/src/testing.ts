/**
 * @repo/billing/testing: FakeStripe, an in-memory StripeGateway for tests and local development
 * without Stripe keys. It keeps Stripe-shaped objects, normalises them with the same code as the
 * real gateway, and emits webhook events signed with the REAL Stripe signature scheme
 * (Stripe.webhooks.generateTestHeaderString), verified with the real Stripe.webhooks.constructEvent.
 * Events are queued so tests can deliver them in order, out of order, duplicated or dropped.
 *
 * Nothing here talks to the network or can move money.
 */
import Stripe from "stripe";
import { createDb, type DbHandle } from "@repo/database";
import { CORE_MIGRATIONS } from "@repo/database";
import type { Billing } from "./billing";
import type { Catalog, ProductDef } from "./catalog";
import {
  normalizeCheckoutSession,
  normalizeEvent,
  normalizePrice,
  normalizeSubscription,
  type CheckoutSessionParams,
  type GatewayCheckoutSession,
  type GatewayEvent,
  type PaymentCheckoutSessionParams,
  type GatewayPrice,
  type GatewaySubscription,
  type StripeGateway,
  type SubscriptionStatus,
  type SubscriptionUpdateParams,
} from "./gateway";
import { BILLING_MIGRATIONS } from "./migrations";

type Obj = Record<string, any>;

export interface FakeDelivery {
  id: string;
  type: string;
  /** Raw JSON body exactly as Stripe would POST it. */
  payload: string;
  /** Stripe-Signature header, signed when the delivery is taken (like a real delivery attempt). */
  header: string;
}

export interface FakeStripeOptions {
  webhookSecret: string;
  /** Shared clock with createBilling({ now }) so event timestamps follow simulated time. */
  now?: () => Date;
  /** Creates prices for every paid plan of these catalogs. */
  catalogs?: Catalog[];
  /** Artificial latency for customers.create (widens race windows in tests). */
  latencyMs?: number;
  /** One-time digital products: a Stripe price is created for each one's lookup key. */
  products?: ProductDef[];
}

const PERIOD_SECONDS = 30 * 86_400;

class FakeStripeError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "FakeStripeError";
  }
}

export class FakeStripe implements StripeGateway {
  readonly mode = "fake" as const;
  private seq = 0;
  private readonly secret: string;
  private readonly clock: () => Date;
  private readonly latencyMs: number;
  private readonly idempotency = new Map<string, string>();
  readonly customersById = new Map<string, Obj>();
  readonly subscriptionsById = new Map<string, Obj>();
  readonly pricesById = new Map<string, Obj>();
  readonly sessionsById = new Map<string, Obj>();
  /** Counters of API calls, for assertions. */
  readonly calls = { customersCreate: 0, checkoutCreate: 0, portalCreate: 0, retrieve: 0, list: 0, update: 0, cancel: 0 };
  private queue: { id: string; type: string; payload: string }[] = [];

  constructor(opts: FakeStripeOptions) {
    this.secret = opts.webhookSecret;
    this.clock = opts.now ?? (() => new Date());
    this.latencyMs = opts.latencyMs ?? 0;
    for (const c of opts.catalogs ?? []) {
      for (const p of c.plans) if (p.stripeLookupKey) this.addPrice(p.stripeLookupKey, p.priceMonthlyCents, `${c.app} ${p.name}`);
      for (const p of c.passes ?? []) this.addPrice(p.stripeLookupKey, p.priceCents, `${c.app} ${p.name}`, { oneTime: true });
    }
    for (const p of opts.products ?? []) this.addPrice(p.stripeLookupKey, p.priceCents, p.name, { oneTime: true });
  }

  // ---- utilities ------------------------------------------------------------------------------

  private id(prefix: string): string {
    this.seq++;
    return `${prefix}_fake${String(this.seq).padStart(6, "0")}`;
  }
  private nowSec(): number {
    return Math.floor(this.clock().getTime() / 1000);
  }
  private async latency() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }
  private sub(id: string): Obj {
    const s = this.subscriptionsById.get(id);
    if (!s) throw new FakeStripeError(`No such subscription: '${id}'`, 404, "resource_missing");
    return s;
  }
  private item(s: Obj): Obj {
    return s.items.data[0];
  }

  /** Adds a recurring monthly price. lookupKey null = a price not in any catalog. */
  addPrice(lookupKey: string | null, unitAmount: number, productName = "Fake product", o: { oneTime?: boolean } = {}): string {
    const id = this.id("price");
    this.pricesById.set(id, {
      id,
      object: "price",
      active: true,
      currency: "usd",
      lookup_key: lookupKey,
      unit_amount: unitAmount,
      product: this.id("prod"),
      nickname: productName,
      recurring: o.oneTime ? null : { interval: "month", interval_count: 1 },
      type: o.oneTime ? "one_time" : "recurring",
    });
    return id;
  }

  priceIdForLookupKey(lookupKey: string): string {
    for (const p of this.pricesById.values()) if (p.lookup_key === lookupKey && p.active) return p.id;
    throw new Error(`FakeStripe: no price for ${lookupKey}`);
  }

  private emit(type: string, object: Obj) {
    const event = {
      id: this.id("evt"),
      object: "event",
      api_version: Stripe.API_VERSION,
      created: this.nowSec(),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type,
      data: { object: structuredClone(object) },
    };
    this.queue.push({ id: event.id, type, payload: JSON.stringify(event) });
  }

  /** Signs a payload with the real Stripe scheme (t=..., v1=HMAC-SHA256). */
  sign(payload: string, secret = this.secret, timestamp?: number): string {
    return Stripe.webhooks.generateTestHeaderString({ payload, secret, ...(timestamp ? { timestamp } : {}) });
  }

  /** Queued events (not yet delivered). */
  pendingEvents(): { id: string; type: string }[] {
    return this.queue.map(({ id, type }) => ({ id, type }));
  }

  /** Removes and returns all queued events, each freshly signed. */
  takeEvents(): FakeDelivery[] {
    const q = this.queue;
    this.queue = [];
    return q.map((e) => ({ ...e, header: this.sign(e.payload) }));
  }

  /** Drops all queued events (simulates missed webhooks). */
  dropEvents(): number {
    const n = this.queue.length;
    this.queue = [];
    return n;
  }

  /**
   * Delivers queued events to billing.handleWebhook.
   * order: "fifo" (default) | "reverse" | "shuffle"; duplicate: deliver each twice;
   * drop: predicate for events to lose.
   */
  async deliverAll(
    billing: Pick<Billing, "handleWebhook">,
    opts: { order?: "fifo" | "reverse" | "shuffle"; duplicate?: boolean; drop?: (e: FakeDelivery) => boolean } = {},
  ): Promise<{ id: string; type: string; status: number; body: string }[]> {
    let events = this.takeEvents().filter((e) => !opts.drop?.(e));
    if (opts.order === "reverse") events.reverse();
    if (opts.order === "shuffle") events = events.map((e) => [Math.random(), e] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    if (opts.duplicate) events = events.flatMap((e) => [e, e]);
    const out = [];
    for (const e of events) {
      const r = await billing.handleWebhook(e.payload, e.header);
      out.push({ id: e.id, type: e.type, status: r.status, body: r.body });
    }
    return out;
  }

  // ---- StripeGateway --------------------------------------------------------------------------

  customers = {
    create: async (params: { email?: string; metadata: Record<string, string> }, o?: { idempotencyKey?: string }) => {
      this.calls.customersCreate++;
      await this.latency();
      if (o?.idempotencyKey && this.idempotency.has(o.idempotencyKey)) {
        return { id: this.idempotency.get(o.idempotencyKey)! };
      }
      const id = this.id("cus");
      this.customersById.set(id, { id, object: "customer", email: params.email ?? null, metadata: { ...params.metadata }, created: this.nowSec() });
      if (o?.idempotencyKey) this.idempotency.set(o.idempotencyKey, id);
      return { id };
    },
  };

  checkout = {
    sessions: {
      create: async (params: CheckoutSessionParams | PaymentCheckoutSessionParams) => {
        this.calls.checkoutCreate++;
        if (params.mode === "subscription" && !this.customersById.has(params.customer)) {
          throw new FakeStripeError("No such customer", 404, "resource_missing");
        }
        for (const li of params.line_items) {
          if ("price_data" in li) {
            if (params.mode !== "payment" || !(li.price_data.unit_amount > 0)) throw new FakeStripeError("Invalid price_data", 400, "invalid_request");
            continue;
          }
          const price = this.pricesById.get(li.price);
          if (!price) throw new FakeStripeError(`No such price: '${li.price}'`, 404, "resource_missing");
          if ((params.mode === "payment") !== (price.type === "one_time")) {
            throw new FakeStripeError("Price type does not match the Checkout mode", 400, "invalid_request");
          }
        }
        const id = this.id("cs_test");
        const session = {
          id,
          object: "checkout.session",
          status: "open",
          url: `https://checkout.stripe.test/c/pay/${id}`,
          subscription: null as string | null,
          payment_status: "unpaid",
          payment_intent: null as string | null,
          created: this.nowSec(),
          ...structuredClone(params),
        };
        this.sessionsById.set(id, session);
        return { id, url: session.url };
      },
      retrieve: async (id: string): Promise<GatewayCheckoutSession> => {
        const session = this.sessionsById.get(id);
        if (!session) throw new FakeStripeError(`No such checkout.session: '${id}'`, 404, "resource_missing");
        return normalizeCheckoutSession(structuredClone(session));
      },
    },
  };

  billingPortal = {
    sessions: {
      create: async (params: { customer: string; return_url: string }) => {
        this.calls.portalCreate++;
        if (!this.customersById.has(params.customer)) throw new FakeStripeError("No such customer", 404, "resource_missing");
        return { url: `https://billing.stripe.test/p/session/${this.id("bps")}` };
      },
    },
  };

  subscriptions = {
    retrieve: async (id: string): Promise<GatewaySubscription> => {
      this.calls.retrieve++;
      return normalizeSubscription(structuredClone(this.sub(id)));
    },
    list: async (params: { customer: string }): Promise<GatewaySubscription[]> => {
      this.calls.list++;
      return [...this.subscriptionsById.values()]
        .filter((s) => s.customer === params.customer)
        .sort((a, b) => b.created - a.created)
        .map((s) => normalizeSubscription(structuredClone(s)));
    },
    update: async (id: string, params: SubscriptionUpdateParams): Promise<GatewaySubscription> => {
      this.calls.update++;
      const s = this.sub(id);
      if (s.status === "canceled") throw new FakeStripeError("A canceled subscription can only update its metadata", 400, "invalid_request");
      if (params.items) {
        for (const it of params.items) {
          const price = this.pricesById.get(it.price);
          if (!price) throw new FakeStripeError(`No such price: '${it.price}'`, 404, "resource_missing");
          if (it.id !== this.item(s).id) throw new FakeStripeError("No such subscription item", 404, "resource_missing");
          this.item(s).price = structuredClone(price);
        }
      }
      if (params.cancel_at_period_end !== undefined) {
        s.cancel_at_period_end = params.cancel_at_period_end;
        if (!params.cancel_at_period_end) s.cancel_at = null;
      }
      if (params.metadata) s.metadata = { ...s.metadata, ...params.metadata };
      this.emit("customer.subscription.updated", s);
      return normalizeSubscription(structuredClone(s));
    },
    cancel: async (id: string): Promise<GatewaySubscription> => {
      this.calls.cancel++;
      const s = this.sub(id);
      this.endSubscription(s);
      return normalizeSubscription(structuredClone(s));
    },
  };

  prices = {
    listByLookupKeys: async (lookupKeys: string[]): Promise<GatewayPrice[]> =>
      [...this.pricesById.values()].filter((p) => p.active && lookupKeys.includes(p.lookup_key)).map(normalizePrice),
  };

  webhooks = {
    constructEvent: (rawBody: string, header: string, secret: string): GatewayEvent =>
      normalizeEvent(Stripe.webhooks.constructEvent(rawBody, header, secret)),
  };

  // ---- simulations (what Stripe / the customer would do) ---------------------------------------

  private invoice(s: Obj, status: "paid" | "open", extra: Obj = {}): Obj {
    return {
      id: this.id("in"),
      object: "invoice",
      customer: s.customer,
      status,
      amount_due: this.item(s).price.unit_amount ?? 0,
      amount_paid: status === "paid" ? (this.item(s).price.unit_amount ?? 0) : 0,
      currency: "usd",
      created: this.nowSec(),
      next_payment_attempt: null,
      parent: { type: "subscription_details", subscription_details: { subscription: s.id, metadata: s.metadata } },
      ...extra,
    };
  }

  private endSubscription(s: Obj) {
    if (s.status === "canceled") return;
    s.status = "canceled";
    s.canceled_at = this.nowSec();
    s.ended_at = this.nowSec();
    this.emit("customer.subscription.deleted", s);
  }

  /** Customer pays on the hosted Checkout page: creates the subscription and emits its events. */
  completeCheckout(sessionId: string, opts: { status?: SubscriptionStatus } = {}): string {
    const session = this.sessionsById.get(sessionId);
    if (!session) throw new Error(`FakeStripe: no session ${sessionId}`);
    if (session.status !== "open") throw new Error("FakeStripe: session already completed");
    const li = session.line_items[0];
    const price = li.price_data ? { unit_amount: li.price_data.unit_amount } : this.pricesById.get(li.price)!;
    const now = this.nowSec();
    const sub = {
      id: this.id("sub"),
      object: "subscription",
      customer: session.customer,
      status: opts.status ?? "active",
      created: now,
      start_date: now,
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      livemode: false,
      metadata: { ...(session.subscription_data?.metadata ?? {}) },
      items: {
        object: "list",
        data: [
          {
            id: this.id("si"),
            object: "subscription_item",
            price: structuredClone(price),
            quantity: 1,
            current_period_start: now,
            current_period_end: now + PERIOD_SECONDS,
          },
        ],
      },
    };
    this.subscriptionsById.set(sub.id, sub);
    session.status = "complete";
    session.subscription = sub.id;
    session.payment_status = "paid";
    this.emit("customer.subscription.created", sub);
    this.emit("checkout.session.completed", session);
    this.emit("invoice.paid", this.invoice(sub, "paid"));
    return sub.id;
  }

  /**
   * Customer pays a one-time pass Checkout. status "unpaid" leaves an async payment pending (no event yet);
   * returns the payment intent id.
   */
  completePassCheckout(sessionId: string, opts: { email?: string; paymentStatus?: "paid" | "unpaid" } = {}): string {
    const session = this.sessionsById.get(sessionId);
    if (!session) throw new Error(`FakeStripe: no session ${sessionId}`);
    if (session.status !== "open") throw new Error("FakeStripe: session already completed");
    if (session.mode !== "payment") throw new Error("FakeStripe: not a payment session");
    const li = session.line_items[0];
    const price = li.price_data ? { unit_amount: li.price_data.unit_amount } : this.pricesById.get(li.price)!;
    const customer = this.id("cus");
    const email = opts.email ?? session.customer_email ?? "buyer@example.test";
    this.customersById.set(customer, { id: customer, object: "customer", email, metadata: {}, created: this.nowSec() });
    session.status = "complete";
    session.customer = customer;
    session.customer_details = { email };
    session.amount_total = price.unit_amount;
    session.currency = "usd";
    session.payment_intent = this.id("pi");
    session.payment_status = opts.paymentStatus ?? "paid";
    this.emit("checkout.session.completed", session);
    return session.payment_intent;
  }

  /** A pending async payment of a pass Checkout succeeds. */
  succeedAsyncPayment(sessionId: string) {
    const session = this.sessionsById.get(sessionId)!;
    session.payment_status = "paid";
    this.emit("checkout.session.async_payment_succeeded", session);
  }

  /** Refunds the charge of a payment intent (full by default). */
  refundPayment(paymentIntent: string, opts: { full?: boolean } = {}) {
    const full = opts.full ?? true;
    this.emit("charge.refunded", {
      id: this.id("ch"),
      object: "charge",
      payment_intent: paymentIntent,
      refunded: full,
      amount_refunded: full ? 1 : 0,
    });
  }

  /** Customer switches price in the Billing Portal. */
  portalChangePrice(subId: string, lookupKeyOrPriceId: string) {
    const s = this.sub(subId);
    const price = this.pricesById.get(lookupKeyOrPriceId) ?? this.pricesById.get(this.priceIdForLookupKey(lookupKeyOrPriceId));
    this.item(s).price = structuredClone(price);
    this.emit("customer.subscription.updated", s);
  }

  /** Customer cancels (or un-cancels) at period end in the Billing Portal. */
  portalCancelAtPeriodEnd(subId: string, cancel = true) {
    const s = this.sub(subId);
    s.cancel_at_period_end = cancel;
    this.emit("customer.subscription.updated", s);
  }

  /** The billing period ends: renew (invoice.paid) or end a subscription scheduled to cancel. */
  advancePeriod(subId: string) {
    const s = this.sub(subId);
    if (s.status === "canceled") return;
    if (s.cancel_at_period_end) return this.endSubscription(s);
    const it = this.item(s);
    it.current_period_start = it.current_period_end;
    it.current_period_end = it.current_period_end + PERIOD_SECONDS;
    this.emit("invoice.paid", this.invoice(s, "paid"));
    this.emit("customer.subscription.updated", s);
  }

  /** Renewal payment fails: subscription becomes past_due, Stripe will retry in 3 days. */
  failPayment(subId: string) {
    const s = this.sub(subId);
    s.status = "past_due";
    this.emit("invoice.payment_failed", this.invoice(s, "open", { next_payment_attempt: this.nowSec() + 3 * 86_400, attempt_count: 1 }));
    this.emit("customer.subscription.updated", s);
  }

  /** A retry (or a new card) succeeds. */
  recoverPayment(subId: string) {
    const s = this.sub(subId);
    s.status = "active";
    this.emit("invoice.paid", this.invoice(s, "paid"));
    this.emit("customer.subscription.updated", s);
  }

  /** All retries exhausted with "cancel subscription" dunning setting. */
  exhaustRetries(subId: string) {
    this.endSubscription(this.sub(subId));
  }

  trialWillEnd(subId: string) {
    this.emit("customer.subscription.trial_will_end", this.sub(subId));
  }

  /** Dashboard edit that bypasses our catalog (e.g. an ad-hoc price). */
  dashboardSetPrice(subId: string, priceId: string) {
    const s = this.sub(subId);
    this.item(s).price = structuredClone(this.pricesById.get(priceId));
    this.emit("customer.subscription.updated", s);
  }

  /** Emits an arbitrary event (e.g. types billing does not handle). */
  emitRaw(type: string, object: Obj) {
    this.emit(type, object);
  }

  subscriptionForCustomer(customerId: string): Obj | undefined {
    return [...this.subscriptionsById.values()].filter((s) => s.customer === customerId).sort((a, b) => b.created - a.created)[0];
  }
}

/** In-memory PGlite with core + billing migrations (tests, local demos). */
export async function createBillingTestDb(): Promise<DbHandle<Record<string, unknown>>> {
  const handle = createDb("pglite:memory", {});
  await handle.migrate([...CORE_MIGRATIONS, ...BILLING_MIGRATIONS]);
  return handle;
}
