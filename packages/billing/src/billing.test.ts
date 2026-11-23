import { describe, expect, it } from "vitest";
import { BillingError } from "./billing";
import { DAY, WEBHOOK_SECRET, setup } from "./test-helpers";

describe("subscription lifecycle", () => {
  it("checkout -> webhooks -> active plan entitlements", async () => {
    const t = await setup();
    const before = await t.billing.getEntitlements("org_a");
    expect(before).toMatchObject({ planId: "free", status: "none", cancelAtPeriodEnd: false });
    expect(before.limits).toMatchObject({ sites: 0, pagesPerScan: 25 });

    const session = await t.billing.createCheckoutSession("org_a", "solo", "owner@example.test");
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const params = t.fake.sessionsById.get(session.id)!;
    expect(params).toMatchObject({
      mode: "subscription",
      client_reference_id: "org_a",
      allow_promotion_codes: false,
      metadata: { orgId: "org_a", app: "changekite", planId: "solo" },
      subscription_data: { metadata: { orgId: "org_a", app: "changekite", planId: "solo" } },
      line_items: [{ price: t.fake.priceIdForLookupKey("changekite_solo_monthly"), quantity: 1 }],
    });
    expect(params.success_url).toMatch(/^https:\/\/changekite\.test\/billing\?checkout=success&session_id=\{CHECKOUT_SESSION_ID\}$/);
    expect(params.cancel_url).toBe("https://changekite.test/billing?checkout=canceled");
    expect(t.fake.customersById.get(params.customer)!.metadata).toEqual({ orgId: "org_a", app: "changekite" });

    // Nothing changes until Stripe tells us (a redirect to success_url proves nothing).
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("free");

    t.fake.completeCheckout(session.id);
    const res = await t.fake.deliverAll(t.billing);
    expect(res.map((r) => [r.type, r.status])).toEqual([
      ["customer.subscription.created", 200],
      ["checkout.session.completed", 200],
      ["invoice.paid", 200],
    ]);
    const ent = await t.billing.getEntitlements("org_a");
    expect(ent).toMatchObject({ planId: "solo", status: "active", cancelAtPeriodEnd: false, subscribedPlanId: "solo" });
    expect(ent.limits).toEqual({ sites: 3, pagesPerScan: 250, scanFrequencyHours: 24, historyDays: 90, teamSeats: 1, reportIssues: -1 });
    expect(ent.features.scheduledScans).toBe(true);
    expect(ent.currentPeriodEnd!.getTime()).toBe(t.clock.t.getTime() + 30 * DAY);
    expect(t.seen.planChanged).toEqual([["org_a", "free", "solo"]]);
    const evs = await t.events();
    expect(evs).toHaveLength(3);
    expect(evs.every((e) => e.processed_at && e.outcome === "processed" && e.error === null && e.attempts === 1)).toBe(true);

    // Other orgs are untouched.
    expect((await t.billing.getEntitlements("org_b")).planId).toBe("free");
    // Returned limits are copies: mutating them cannot change the catalog.
    ent.limits.sites = 999;
    expect((await t.billing.getEntitlements("org_a")).limits.sites).toBe(3);
  });

  it("upgrade via changePlan (prorated) and downgrade via the portal call onPlanChanged(from, to)", async () => {
    const t = await setup();
    const subId = await t.subscribe("org_a", "solo");
    t.seen.planChanged.length = 0;

    t.advance(DAY);
    const ent = await t.billing.changePlan("org_a", "agency");
    expect(ent.planId).toBe("agency");
    expect(ent.limits.sites).toBe(20);
    expect(t.seen.planChanged).toEqual([["org_a", "solo", "agency"]]);
    expect(t.fake.calls.update).toBe(1);
    expect(t.fake.subscriptionsById.get(subId)!.items.data[0].price.lookup_key).toBe("changekite_agency_monthly");
    // The webhook for our own update arrives later: no second hook call.
    await t.fake.deliverAll(t.billing);
    expect(t.seen.planChanged).toHaveLength(1);

    t.advance(DAY);
    t.fake.portalChangePrice(subId, "changekite_solo_monthly");
    await t.fake.deliverAll(t.billing);
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("solo");
    expect(t.seen.planChanged).toEqual([
      ["org_a", "solo", "agency"],
      ["org_a", "agency", "solo"],
    ]);

    // "Downgrade to free" = cancel at period end; the paid plan stays until then.
    const toFree = await t.billing.changePlan("org_a", "free");
    expect(toFree).toMatchObject({ planId: "solo", cancelAtPeriodEnd: true });
    await expect(t.billing.changePlan("org_a", "nope")).rejects.toMatchObject({ code: "invalid_plan" });
    await expect(t.billing.changePlan("org_zzz", "agency")).rejects.toMatchObject({ code: "not_subscribed" });
  });

  it("payment failure -> past_due -> hook -> 7 day grace -> free; recovery via invoice.paid", async () => {
    const t = await setup();
    const subId = await t.subscribe("org_a", "solo");
    t.advance(30 * DAY);
    const failedAt = t.clock.t.getTime();
    t.fake.failPayment(subId);
    await t.fake.deliverAll(t.billing);

    let ent = await t.billing.getEntitlements("org_a");
    expect(ent).toMatchObject({ planId: "solo", status: "past_due" });
    expect(ent.graceEndsAt!.getTime()).toBe(failedAt + 7 * DAY);
    expect(t.seen.paymentFailed).toHaveLength(1);
    const [org, info] = t.seen.paymentFailed[0]!;
    expect(org).toBe("org_a");
    expect(info.amountDueCents).toBe(1900);
    expect(info.invoiceId).toMatch(/^in_/);
    expect(info.nextAttemptAt!.getTime()).toBe(failedAt + 3 * DAY);

    // A second failure (retry) does not restart the grace period.
    t.advance(3 * DAY);
    t.fake.failPayment(subId);
    await t.fake.deliverAll(t.billing);
    expect((await t.billing.getEntitlements("org_a")).graceEndsAt!.getTime()).toBe(failedAt + 7 * DAY);
    expect(t.seen.paymentFailed).toHaveLength(2);

    t.advance(4 * DAY - 60_000); // 1 minute before the grace period ends
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("solo");
    t.advance(2 * 60_000);
    ent = await t.billing.getEntitlements("org_a");
    expect(ent).toMatchObject({ planId: "free", status: "past_due", subscribedPlanId: "solo" });
    expect(ent.limits.sites).toBe(0);

    t.fake.recoverPayment(subId);
    await t.fake.deliverAll(t.billing);
    ent = await t.billing.getEntitlements("org_a");
    expect(ent).toMatchObject({ planId: "solo", status: "active", graceEndsAt: null });
    const row = await t.handle.executor.query<{ payment_failed_at: Date | null }>(
      `SELECT payment_failed_at FROM billing_subscriptions WHERE org_id = 'org_a'`,
    );
    expect(row.rows[0]!.payment_failed_at).toBeNull();
  });

  it("cancel at period end keeps the plan until the period ends, then free", async () => {
    const t = await setup();
    const subId = await t.subscribe("org_a", "agency");
    t.advance(10 * DAY);
    t.fake.portalCancelAtPeriodEnd(subId);
    await t.fake.deliverAll(t.billing);
    let ent = await t.billing.getEntitlements("org_a");
    expect(ent).toMatchObject({ planId: "agency", cancelAtPeriodEnd: true, status: "active" });
    expect(t.seen.canceled).toEqual([]);
    // The "access continues until" email gets the real end date, exactly once.
    expect(t.seen.cancellationScheduled).toHaveLength(1);
    expect(t.seen.cancellationScheduled[0]![0]).toBe("org_a");
    expect(t.seen.cancellationScheduled[0]![1].planId).toBe("agency");
    expect(t.seen.cancellationScheduled[0]![1].endsAt?.getTime()).toBe(ent.currentPeriodEnd?.getTime());
    await t.fake.deliverAll(t.billing);
    expect(t.seen.cancellationScheduled).toHaveLength(1);

    // Period end passes; even before the deleted webhook arrives the plan is no longer granted.
    t.advance(20 * DAY + 1000);
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("free");

    t.fake.advancePeriod(subId);
    await t.fake.deliverAll(t.billing);
    ent = await t.billing.getEntitlements("org_a");
    expect(ent).toMatchObject({ planId: "free", status: "canceled" });
    expect(t.seen.canceled).toEqual(["org_a"]);
    expect(t.seen.planChanged.at(-1)).toEqual(["org_a", "agency", "free"]);

    // After cancellation the org can subscribe again with a new checkout.
    t.advance(DAY);
    await t.subscribe("org_a", "solo");
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("solo");
  });

  it("un-cancel before period end keeps the subscription", async () => {
    const t = await setup();
    const subId = await t.subscribe("org_a", "solo");
    t.fake.portalCancelAtPeriodEnd(subId, true);
    t.advance(1000);
    t.fake.portalCancelAtPeriodEnd(subId, false);
    await t.fake.deliverAll(t.billing);
    t.advance(31 * DAY);
    t.fake.advancePeriod(subId);
    await t.fake.deliverAll(t.billing);
    expect(await t.billing.getEntitlements("org_a")).toMatchObject({ planId: "solo", status: "active", cancelAtPeriodEnd: false });
  });

  it("subscription deleted (dunning exhausted / cancelImmediately) -> free", async () => {
    const t = await setup();
    const subId = await t.subscribe("org_a", "solo");
    t.advance(DAY);
    t.fake.exhaustRetries(subId);
    await t.fake.deliverAll(t.billing);
    expect(await t.billing.getEntitlements("org_a")).toMatchObject({ planId: "free", status: "canceled" });
    expect(t.seen.canceled).toEqual(["org_a"]);

    const t2 = await setup();
    await t2.subscribe("org_b", "agency");
    t2.advance(DAY);
    await t2.billing.cancelImmediately("org_b");
    expect(await t2.billing.getEntitlements("org_b")).toMatchObject({ planId: "free", status: "canceled" });
    expect(t2.seen.canceled).toEqual(["org_b"]);
    // The deleted webhook for our own cancel is a no-op for hooks.
    await t2.fake.deliverAll(t2.billing);
    expect(t2.seen.canceled).toEqual(["org_b"]);
    // Idempotent and harmless for orgs without billing.
    await t2.billing.cancelImmediately("org_b");
    await t2.billing.cancelImmediately("org_without_billing");
    expect(t2.fake.calls.cancel).toBe(1);
  });
});

describe("checkout guards", () => {
  it("refuses checkout for an org that already has a paid subscription", async () => {
    const t = await setup();
    await t.subscribe("org_a", "solo");
    const err = await t.billing.createCheckoutSession("org_a", "agency", "x@example.test").catch((e) => e);
    expect(err).toBeInstanceOf(BillingError);
    expect(err).toMatchObject({ code: "already_subscribed", status: 409 });
    expect(t.fake.calls.checkoutCreate).toBe(1);
  });

  it("rejects free/unknown plans and missing prices", async () => {
    const t = await setup();
    await expect(t.billing.createCheckoutSession("org_a", "free", "x@example.test")).rejects.toMatchObject({ code: "invalid_plan", status: 400 });
    await expect(t.billing.createCheckoutSession("org_a", "gold", "x@example.test")).rejects.toMatchObject({ code: "invalid_plan" });
    await expect(t.billing.createCheckoutSession("", "solo", "x@example.test")).rejects.toMatchObject({ code: "invalid_input" });
    for (const p of t.fake.pricesById.values()) p.active = false;
    await expect(t.billing.createCheckoutSession("org_a", "solo", "x@example.test")).rejects.toMatchObject({ code: "price_not_configured", status: 500 });
  });

  it("rejects a Stripe price whose amount differs from the catalog", async () => {
    const t = await setup();
    for (const p of t.fake.pricesById.values()) if (p.lookup_key === "changekite_solo_monthly") p.unit_amount = 900;
    await expect(t.billing.createCheckoutSession("org_a", "solo", "x@example.test")).rejects.toMatchObject({ code: "price_not_configured" });
  });

  it("two concurrent checkouts for a new org create exactly one Stripe customer", async () => {
    const t = await setup({ latencyMs: 25 });
    const [a, b] = await Promise.all([
      t.billing.createCheckoutSession("org_race", "solo", "x@example.test"),
      t.billing.createCheckoutSession("org_race", "agency", "x@example.test"),
    ]);
    expect(t.fake.calls.customersCreate).toBe(1);
    expect(t.fake.customersById.size).toBe(1);
    expect(t.fake.sessionsById.get(a.id)!.customer).toBe(t.fake.sessionsById.get(b.id)!.customer);
    const rows = await t.handle.executor.query(`SELECT * FROM billing_customers`);
    expect(rows.rows).toHaveLength(1);
  });

  it("portal session needs an existing customer", async () => {
    const t = await setup();
    await expect(t.billing.createPortalSession("org_a")).rejects.toMatchObject({ code: "no_customer", status: 404 });
    await t.subscribe("org_a", "solo");
    const p = await t.billing.createPortalSession("org_a");
    expect(p.url).toMatch(/^https:\/\/billing\.stripe\.test\//);
  });
});

describe("webhooks", () => {
  it("processes a duplicated event only once", async () => {
    const t = await setup();
    const s = await t.billing.createCheckoutSession("org_a", "solo", "x@example.test");
    t.fake.completeCheckout(s.id);
    const res = await t.fake.deliverAll(t.billing, { duplicate: true });
    expect(res).toHaveLength(6);
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect(res.filter((r) => r.body.includes('"duplicate":true'))).toHaveLength(3);
    expect(t.seen.planChanged).toEqual([["org_a", "free", "solo"]]);
    expect(await t.events()).toHaveLength(3);

    // Concurrent duplicate deliveries of a payment failure call the hook once.
    const subId = t.fake.subscriptionForCustomer(t.fake.sessionsById.get(s.id)!.customer)!.id;
    t.advance(DAY);
    t.fake.failPayment(subId);
    const [failed] = t.fake.takeEvents();
    const results = await Promise.all([1, 2, 3, 4].map(() => t.billing.handleWebhook(failed!.payload, failed!.header)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(t.seen.paymentFailed).toHaveLength(1);
  });

  it("out-of-order delivery (updated before created, old update after new) ends in the newest state", async () => {
    const t = await setup();
    const s = await t.billing.createCheckoutSession("org_a", "solo", "x@example.test");
    const subId = t.fake.completeCheckout(s.id); // created, checkout.completed, invoice.paid @ t0
    t.advance(5000);
    t.fake.portalChangePrice(subId, "changekite_agency_monthly"); // updated @ t0+5s
    t.advance(5000);
    t.fake.portalChangePrice(subId, "changekite_solo_monthly"); // updated @ t0+10s (newest)

    const res = await t.fake.deliverAll(t.billing, { order: "reverse" });
    expect(res.map((r) => r.type)).toEqual([
      "customer.subscription.updated",
      "customer.subscription.updated",
      "invoice.paid",
      "checkout.session.completed",
      "customer.subscription.created",
    ]);
    expect(res.every((r) => r.status === 200)).toBe(true);
    const byId = new Map((await t.events()).map((e) => [e.id, e.outcome]));
    expect(res.map((r) => byId.get(r.id))).toEqual(["processed", "stale", "stale", "stale", "stale"]);
    expect(await t.billing.getEntitlements("org_a")).toMatchObject({ planId: "solo", status: "active" });
    expect(t.seen.planChanged).toEqual([["org_a", "free", "solo"]]);
  });

  it("an event for an older subscription never replaces the org's live subscription", async () => {
    const t = await setup();
    const oldSub = await t.subscribe("org_a", "solo");
    t.advance(DAY);
    t.fake.portalCancelAtPeriodEnd(oldSub);
    const lateUpdate = t.fake.takeEvents(); // delayed by Stripe, delivered after the org re-subscribed
    t.advance(DAY);
    t.fake.exhaustRetries(oldSub);
    await t.fake.deliverAll(t.billing);
    expect((await t.billing.getEntitlements("org_a")).status).toBe("canceled");
    t.advance(DAY);
    await t.subscribe("org_a", "agency");
    t.advance(DAY);
    for (const e of lateUpdate) expect((await t.billing.handleWebhook(e.payload, e.header)).status).toBe(200);
    expect(await t.billing.getEntitlements("org_a")).toMatchObject({ planId: "agency", status: "active", cancelAtPeriodEnd: false });
    expect((await t.events()).find((e) => e.id === lateUpdate[0]!.id)!.outcome).toBe("stale");
    // Reconcile also picks the live subscription over the canceled one.
    expect(await t.billing.reconcile()).toMatchObject({ fixed: 0, errors: 0 });
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("agency");
  });

  it("a dropped event is repaired by reconcile()", async () => {
    const t = await setup();
    await t.subscribe("org_ok", "solo");
    const s = await t.billing.createCheckoutSession("org_a", "agency", "x@example.test");
    const subId = t.fake.completeCheckout(s.id);
    await t.fake.deliverAll(t.billing, { drop: () => true }); // every webhook lost
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("free");

    t.advance(60_000);
    expect(await t.billing.reconcile()).toEqual({ checked: 2, fixed: 1, errors: 0 });
    expect(await t.billing.getEntitlements("org_a")).toMatchObject({ planId: "agency", status: "active" });
    expect(t.seen.planChanged.at(-1)).toEqual(["org_a", "free", "agency"]);

    // A missed cancellation is repaired too.
    t.advance(DAY);
    t.fake.exhaustRetries(subId);
    t.fake.dropEvents();
    expect(await t.billing.reconcile()).toEqual({ checked: 2, fixed: 1, errors: 0 });
    expect(await t.billing.getEntitlements("org_a")).toMatchObject({ planId: "free", status: "canceled" });
    expect(await t.billing.reconcile()).toEqual({ checked: 2, fixed: 0, errors: 0 });
  });

  it("rejects missing, invalid, tampered, wrong-secret and stale signatures with 400 and stores nothing", async () => {
    const t = await setup();
    const s = await t.billing.createCheckoutSession("org_a", "solo", "x@example.test");
    t.fake.completeCheckout(s.id);
    const [e] = t.fake.takeEvents();
    const tampered = e!.payload.replace('"status":"active"', '"status":"trialing"');
    expect(tampered).not.toBe(e!.payload);
    const cases: [string, string | null][] = [
      [e!.payload, null],
      [e!.payload, ""],
      [e!.payload, "garbage"],
      [e!.payload, "t=123,v1=deadbeef"],
      [tampered, e!.header],
      [e!.payload, t.fake.sign(e!.payload, "whsec_some_other_secret")],
      [e!.payload, t.fake.sign(e!.payload, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600)],
    ];
    for (const [body, sig] of cases) {
      const r = await t.billing.handleWebhook(body, sig);
      expect(r.status).toBe(400);
    }
    expect(await t.events()).toHaveLength(0);
    expect((await t.handle.executor.query(`SELECT * FROM billing_subscriptions`)).rows).toHaveLength(0);
    // The untouched original still works.
    expect((await t.billing.handleWebhook(e!.payload, e!.header)).status).toBe(200);
  });

  it("unknown price: recorded as an incident-worthy error, 200, previous plan kept", async () => {
    const t = await setup();
    const subId = await t.subscribe("org_a", "solo");
    const adHoc = t.fake.addPrice(null, 4200);
    t.advance(1000);
    t.fake.dashboardSetPrice(subId, adHoc);
    const [r] = await t.fake.deliverAll(t.billing);
    expect(r!.status).toBe(200);
    const ev = (await t.events()).at(-1)!;
    expect(ev.outcome).toBe("unknown_price");
    expect(ev.error).toContain(adHoc);
    expect(ev.processed_at).not.toBeNull();
    expect(t.seen.anomalies).toEqual([expect.objectContaining({ kind: "unknown_price", orgId: "org_a", eventId: ev.id })]);
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("solo");
  });

  it("processing failure -> 500 with error recorded; Stripe's retry then succeeds", async () => {
    const t = await setup();
    const s = await t.billing.createCheckoutSession("org_a", "solo", "x@example.test");
    t.fake.completeCheckout(s.id);
    const [created] = t.fake.takeEvents();
    const original = t.fake.subscriptions.retrieve;
    t.fake.subscriptions.retrieve = async () => {
      throw new Error("Stripe API unavailable");
    };
    const r1 = await t.billing.handleWebhook(created!.payload, created!.header);
    expect(r1).toEqual({ status: 500, body: "processing failed" });
    let ev = (await t.events())[0]!;
    expect(ev).toMatchObject({ outcome: "failed", error: "Stripe API unavailable", attempts: 1, processed_at: null });

    t.fake.subscriptions.retrieve = original;
    const r2 = await t.billing.handleWebhook(created!.payload, t.fake.sign(created!.payload));
    expect(r2.status).toBe(200);
    ev = (await t.events())[0]!;
    expect(ev).toMatchObject({ outcome: "processed", error: null, attempts: 2 });
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("solo");
  });

  it("ignores trial_will_end, unhandled types and customers of other apps gracefully", async () => {
    const t = await setup();
    const subId = await t.subscribe("org_a", "solo");
    t.fake.trialWillEnd(subId);
    t.fake.emitRaw("charge.succeeded", { id: "ch_1", object: "charge" });
    t.fake.emitRaw("customer.subscription.updated", { id: "sub_other_app", object: "subscription", customer: "cus_other_app", status: "active", items: { data: [] } });
    // The foreign subscription exists in "Stripe" (shared account, another app's customer).
    t.fake.subscriptionsById.set("sub_other_app", {
      id: "sub_other_app",
      object: "subscription",
      customer: "cus_other_app",
      status: "active",
      created: 1,
      metadata: {},
      items: { data: [{ id: "si_x", price: { id: "price_x", lookup_key: "webhooktrail_pro_monthly" }, current_period_end: 2 }] },
    });
    const res = await t.fake.deliverAll(t.billing);
    expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
    const evs = (await t.events()).slice(-3);
    expect(evs.map((e) => e.outcome)).toEqual(["ignored", "ignored", "ignored"]);
    expect(t.seen.anomalies).toEqual([]);
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("solo");
  });

  it("hook failures do not fail the webhook and are recorded", async () => {
    const t = await setup({
      hooks: {
        onPlanChanged: async () => {
          throw new Error("mailer down");
        },
      },
    });
    await t.subscribe("org_a", "solo");
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("solo");
    const evs = await t.events();
    expect(evs.some((e) => e.error?.includes("hook onPlanChanged failed: mailer down"))).toBe(true);
    expect(t.seen.anomalies.some((a) => a.kind === "hook_failed")).toBe(true);
  });
});

describe("automatic tax", () => {
  it("is off by default: checkout carries no tax settings", async () => {
    const t = await setup();
    const s = await t.billing.createCheckoutSession("org_a", "solo", "x@example.test");
    const params = t.fake.sessionsById.get(s.id)!;
    expect(params.automatic_tax).toBeUndefined();
    expect(params.customer_update).toBeUndefined();
  });

  it("when enabled, checkout asks Stripe Tax, collects the billing address and saves it on the customer", async () => {
    const t = await setup({ automaticTax: true });
    const s = await t.billing.createCheckoutSession("org_a", "solo", "x@example.test");
    expect(t.fake.sessionsById.get(s.id)).toMatchObject({
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
    });
  });
});

describe("checkout branding", () => {
  it("names the product on its own checkout page when configured", async () => {
    const t = await setup({ checkoutBranding: { display_name: "GridRinse", button_color: "#138a4a" } });
    const s = await t.billing.createCheckoutSession("org_a", "solo", "x@example.test");
    expect(t.fake.sessionsById.get(s.id)!.branding_settings).toEqual({ display_name: "GridRinse", button_color: "#138a4a" });
  });
});
