import { describe, expect, it } from "vitest";
import { ALL_CATALOGS, DATAPOLISH_CATALOG, WEBHOOKTRAIL_CATALOG, SITEPROOF_CATALOG } from "./catalogs";
import { defineCatalog, getFreePlan } from "./catalog";
import { LiveModeRefusedError, createStripeGateway, stripeGatewayFromEnv } from "./gateway";
import { checkoutRoute, portalRoute, webhookRoute } from "./routes";
import { APP_URL, setup } from "./test-helpers";

describe("createStripeGateway live-key guard", () => {
  it("refuses live secret and restricted keys unless allowLive === true", () => {
    for (const key of ["sk_live_abc123", "rk_live_abc123", " sk_live_abc123 "]) {
      expect(() => createStripeGateway(key)).toThrow(LiveModeRefusedError);
      expect(() => createStripeGateway(key, { allowLive: false })).toThrow(LiveModeRefusedError);
      expect(() => createStripeGateway(key, { allowLive: "true" as unknown as boolean })).toThrow(LiveModeRefusedError);
    }
    expect(createStripeGateway("sk_live_abc123", { allowLive: true }).mode).toBe("live");
    expect(createStripeGateway("sk_test_abc123").mode).toBe("test");
    expect(() => createStripeGateway("")).toThrow();
    expect(() => createStripeGateway("pk_test_abc")).toThrow();
  });

  it("only STRIPE_LIVE_MODE_AUTHORIZED=true (exact) enables live mode from env", () => {
    const live = { STRIPE_SECRET_KEY: "sk_live_abc123" };
    expect(() => stripeGatewayFromEnv(live)).toThrow(LiveModeRefusedError);
    for (const v of ["TRUE", "1", "yes", " true", ""]) {
      expect(() => stripeGatewayFromEnv({ ...live, STRIPE_LIVE_MODE_AUTHORIZED: v })).toThrow(LiveModeRefusedError);
    }
    expect(stripeGatewayFromEnv({ ...live, STRIPE_LIVE_MODE_AUTHORIZED: "true" }).mode).toBe("live");
    expect(stripeGatewayFromEnv({ STRIPE_SECRET_KEY: "sk_test_abc" }).mode).toBe("test");
    expect(() => stripeGatewayFromEnv({})).toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("catalogs", () => {
  it("are valid and free tiers match the pre-account free tools", () => {
    expect(ALL_CATALOGS.map((c) => c.app)).toEqual(["siteproof", "datapolish", "webhooktrail"]);
    expect(getFreePlan(SITEPROOF_CATALOG).limits.pagesPerScan).toBe(25);
    expect(getFreePlan(DATAPOLISH_CATALOG).limits).toMatchObject({ maxFileMb: 5, maxRows: 50_000, filesPerBatch: 3 });
    expect(getFreePlan(WEBHOOKTRAIL_CATALOG).limits).toMatchObject({ endpointRetentionHours: 24, requestsStored: 100, storedBodyKb: 256 });
    const prices = Object.fromEntries(ALL_CATALOGS.flatMap((c) => c.plans.map((p) => [`${c.app}_${p.id}`, p.priceMonthlyCents])));
    expect(prices).toEqual({
      siteproof_free: 0, siteproof_solo: 1900, siteproof_agency: 7900,
      datapolish_free: 0, datapolish_pro: 1200, datapolish_business: 2900,
      webhooktrail_free: 0, webhooktrail_developer: 900, webhooktrail_pro: 2900,
    });
    expect(SITEPROOF_CATALOG.plans.find((p) => p.id === "solo")!.limits.sites).toBe(3);
    expect(SITEPROOF_CATALOG.plans.find((p) => p.id === "agency")!.limits.sites).toBe(20);
    expect(WEBHOOKTRAIL_CATALOG.plans.map((p) => p.features.replay)).toEqual([false, true, true]);
  });

  it("rejects inconsistent catalogs", () => {
    const base = structuredClone(DATAPOLISH_CATALOG);
    expect(() => defineCatalog({ ...base, freePlanId: "gold" })).toThrow(/freePlanId/);
    const missingKey = structuredClone(base);
    delete missingKey.plans[1]!.limits.maxRows;
    expect(() => defineCatalog(missingKey)).toThrow(/same limit/);
    const dupKey = structuredClone(base);
    dupKey.plans[2]!.stripeLookupKey = dupKey.plans[1]!.stripeLookupKey;
    expect(() => defineCatalog(dupKey)).toThrow(/duplicate lookup key/);
    const noPrice = structuredClone(base);
    noPrice.plans[1]!.priceMonthlyCents = 0;
    expect(() => defineCatalog(noPrice)).toThrow(/needs a price/);
  });
});

describe("route handlers", () => {
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(APP_URL + path, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_URL, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("checkout uses the org from the injected resolver, never from the request", async () => {
    const t = await setup();
    const route = checkoutRoute(t.billing, async () => ({ orgId: "org_owner", email: "owner@example.test" }));
    const res = await route(post("/api/billing/checkout", { planId: "solo", orgId: "org_victim", limits: { sites: 999 }, planIdOverride: "agency" }));
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const session = [...t.fake.sessionsById.values()].find((s) => s.url === url)!;
    expect(session.client_reference_id).toBe("org_owner");
    expect(session.metadata.orgId).toBe("org_owner");
    const customers = await t.handle.executor.query<{ org_id: string }>(`SELECT org_id FROM billing_customers`);
    expect(customers.rows.map((r) => r.org_id)).toEqual(["org_owner"]);
    // Entitlements cannot be influenced by request data: there is no input but the org id.
    expect((await t.billing.getEntitlements("org_owner")).planId).toBe("free");
    expect((await t.billing.getEntitlements("org_victim")).planId).toBe("free");
  });

  it("checkout/portal enforce auth, owner role, same origin and input validation", async () => {
    const t = await setup();
    const forbidden = Object.assign(new Error("not owner"), { status: 403 });
    expect((await checkoutRoute(t.billing, async () => null)(post("/c", { planId: "solo" }))).status).toBe(401);
    expect(
      (await checkoutRoute(t.billing, async () => {
        throw forbidden;
      })(post("/c", { planId: "solo" }))).status,
    ).toBe(403);
    const ok = checkoutRoute(t.billing, async () => ({ orgId: "org_a", email: "a@example.test" }));
    expect((await ok(post("/c", { planId: "solo" }, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await ok(post("/c", { planId: "solo" }, { origin: "", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await ok(post("/c", "{not json"))).status).toBe(400);
    expect((await ok(post("/c", { planId: 5 }))).status).toBe(400);
    expect((await ok(post("/c", { planId: "free" }))).status).toBe(400);
    expect((await ok(new Request(APP_URL + "/c", { method: "GET" }))).status).toBe(405);

    // Form post (no JS) -> 303 redirect to Stripe.
    const form = await ok(
      new Request(APP_URL + "/c", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: APP_URL },
        body: "planId=solo",
      }),
    );
    expect(form.status).toBe(303);
    expect(form.headers.get("location")).toMatch(/^https:\/\/checkout\.stripe\.test\//);

    const portal = portalRoute(t.billing, async () => ({ orgId: "org_a", email: "a@example.test" }));
    const pr = await portal(post("/p", {}));
    expect(pr.status).toBe(200);
    expect(((await pr.json()) as { url: string }).url).toMatch(/^https:\/\/billing\.stripe\.test\//);
    const noCustomer = await portalRoute(t.billing, async () => ({ orgId: "org_new", email: "" }))(post("/p", {}));
    expect(noCustomer.status).toBe(404);

    await t.subscribe("org_a", "solo");
    const again = await ok(post("/c", { planId: "agency" }));
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe("already_subscribed");
  });

  it("webhook route passes the raw body and signature through", async () => {
    const t = await setup();
    const route = webhookRoute(t.billing);
    const s = await t.billing.createCheckoutSession("org_a", "solo", "a@example.test");
    t.fake.completeCheckout(s.id);
    for (const e of t.fake.takeEvents()) {
      const res = await route(
        new Request(APP_URL + "/api/billing/webhook", {
          method: "POST",
          headers: { "content-type": "application/json", "stripe-signature": e.header },
          body: e.payload,
        }),
      );
      expect(res.status).toBe(200);
    }
    expect((await t.billing.getEntitlements("org_a")).planId).toBe("solo");
    const unsigned = await route(new Request(APP_URL + "/w", { method: "POST", body: "{}" }));
    expect(unsigned.status).toBe(400);
    const reparsed = await route(
      new Request(APP_URL + "/w", {
        method: "POST",
        headers: { "stripe-signature": t.fake.sign('{"id":"evt_1"}') },
        body: '{"id": "evt_1"}', // same JSON, different bytes
      }),
    );
    expect(reparsed.status).toBe(400);
  });
});
