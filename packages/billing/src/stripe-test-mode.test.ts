/**
 * Optional read-only checks against a real Stripe TEST account. Runs only when
 * STRIPE_TEST_SECRET_KEY starts with sk_test_; skipped otherwise. Never creates charges.
 */
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { ALL_CATALOGS } from "./catalogs";
import { createStripeGateway } from "./gateway";

const key = process.env.STRIPE_TEST_SECRET_KEY ?? "";
const enabled = key.startsWith("sk_test_");

describe.skipIf(!enabled)("real Stripe (test mode)", () => {
  it("has exactly one active price per catalog lookup key with the catalog amount", async () => {
    const gw = createStripeGateway(key);
    expect(gw.mode).toBe("test");
    for (const c of ALL_CATALOGS) {
      for (const p of c.plans) {
        if (!p.stripeLookupKey) continue;
        const prices = await gw.prices.listByLookupKeys([p.stripeLookupKey]);
        expect(prices, p.stripeLookupKey).toHaveLength(1);
        expect(prices[0]!.unitAmount).toBe(p.priceMonthlyCents);
      }
    }
  });

  it("verifies a signed event through the real SDK path", () => {
    const gw = createStripeGateway(key);
    const secret = "whsec_local_check";
    const payload = JSON.stringify({ id: "evt_local", object: "event", type: "ping", created: 1, livemode: false, data: { object: { id: "x" } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(gw.webhooks.constructEvent(payload, header, secret).id).toBe("evt_local");
    expect(() => gw.webhooks.constructEvent(payload, header, "whsec_wrong")).toThrow();
  });
});
