import { describe, expect, it } from "vitest";
import { createBilling } from "./billing";
import { SITEPROOF_CATALOG } from "./catalogs";
import { notConfiguredGateway, stripeGatewayFromEnvOrNotConfigured } from "./gateway";
import { checkoutRoute, portalRoute, webhookRoute } from "./routes";
import { createBillingTestDb } from "./testing";

const APP = "https://siteproof.test";

async function setup() {
  const handle = await createBillingTestDb();
  const billing = createBilling({ handle, catalog: SITEPROOF_CATALOG, stripe: notConfiguredGateway(), appUrl: APP });
  return { handle, billing };
}

describe("billing without Stripe credentials", () => {
  it("picks the not-configured gateway when no key is set and never accepts a missing secret for a real key", () => {
    const r = stripeGatewayFromEnvOrNotConfigured({});
    expect(r.configured).toBe(false);
    expect(r.gateway.mode).toBe("none");
    expect(() => stripeGatewayFromEnvOrNotConfigured({ STRIPE_SECRET_KEY: "sk_live_abc" })).toThrow();
  });

  it("everyone is on the free plan; usage limits still apply", async () => {
    const { billing, handle } = await setup();
    const e = await billing.getEntitlements("org_1");
    expect(e.planId).toBe("free");
    expect(e.limits.sites).toBe(0);
    await handle.close();
  });

  it("checkout and portal answer 503, webhook 503, reconcile is a no-op, cancelImmediately is safe", async () => {
    const { billing, handle } = await setup();
    const resolve = async () => ({ orgId: "org_1", email: "a@example.com" });
    const post = (path: string, body: unknown) =>
      new Request(`${APP}${path}`, {
        method: "POST",
        headers: { origin: APP, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const c = await checkoutRoute(billing, resolve)(post("/api/billing/checkout", { planId: "solo" }));
    expect(c.status).toBe(503);
    expect(await c.json()).toMatchObject({ error: "billing_not_configured" });
    const p = await portalRoute(billing, resolve)(post("/api/billing/portal", {}));
    expect(p.status).toBe(503);
    const w = await webhookRoute(billing)(
      new Request(`${APP}/api/billing/webhook`, { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" }),
    );
    expect(w.status).toBe(503);
    expect(await billing.reconcile()).toEqual({ checked: 0, fixed: 0, errors: 0 });
    await expect(billing.cancelImmediately("org_1")).resolves.toBeUndefined();
    await handle.close();
  });
});
