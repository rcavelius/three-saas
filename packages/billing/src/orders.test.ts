import { describe, expect, it } from "vitest";
import type { Order } from "./billing";
import { defineProducts, type ProductDef } from "./catalog";
import { GRIDRINSE_CATALOG } from "./catalogs";
import { APP_URL, DAY, setup } from "./test-helpers";

const PRODUCTS: ProductDef[] = [
  { id: "debt-payoff-planner", name: "Debt Payoff Planner", priceCents: 599, stripeLookupKey: "gridrinse_template_debt_payoff_planner", accessDays: 30 },
  { id: "bundle", name: "All templates bundle", priceCents: 3900, stripeLookupKey: "gridrinse_template_bundle", accessDays: 30 },
];
const SUCCESS = "/templates/download?session_id={CHECKOUT_SESSION_ID}";

async function orderSetup(o: { priced?: ProductDef[] } = {}) {
  const paid: Order[] = [];
  const t = await setup({
    catalog: GRIDRINSE_CATALOG,
    products: PRODUCTS,
    pricedProducts: o.priced,
    hooks: { onOrderPaid: async (order) => void paid.push(order) },
  });
  return { ...t, paid };
}

async function buy(t: Awaited<ReturnType<typeof orderSetup>>, productId: string, o: { duplicate?: boolean } = {}) {
  const s = await t.billing.createProductCheckout(productId, { successPath: SUCCESS, cancelPath: `/templates/${productId}` });
  const pi = t.fake.completePassCheckout(s.id, { email: "buyer@example.test" });
  const res = await t.fake.deliverAll(t.billing, { duplicate: o.duplicate });
  for (const r of res) if (r.status !== 200) throw new Error(`webhook ${r.type} -> ${r.status} ${r.body}`);
  return { sessionId: s.id, pi, res };
}

describe("one-time products (orders)", () => {
  it("validates product lists", () => {
    expect(() => defineProducts([PRODUCTS[0]!, PRODUCTS[0]!])).toThrow(/duplicate product id/);
    expect(() => defineProducts([{ ...PRODUCTS[0]!, id: "Bad Id" }])).toThrow(/Invalid product/);
    expect(() => defineProducts([PRODUCTS[0]!, { ...PRODUCTS[1]!, stripeLookupKey: PRODUCTS[0]!.stripeLookupKey }])).toThrow(/duplicate product lookup key/);
    expect(() => defineProducts([{ ...PRODUCTS[0]!, priceCents: 0 }])).toThrow(/Invalid product/);
  });

  it("checkout: payment mode with the lookup-key price, product metadata, download success URL", async () => {
    const t = await orderSetup();
    const s = await t.billing.createProductCheckout("debt-payoff-planner", { successPath: SUCCESS, cancelPath: "/templates/debt-payoff-planner" });
    const params = t.fake.sessionsById.get(s.id)!;
    expect(params).toMatchObject({
      mode: "payment",
      customer_creation: "always",
      line_items: [{ price: t.fake.priceIdForLookupKey("gridrinse_template_debt_payoff_planner"), quantity: 1 }],
      metadata: { app: "gridrinse", kind: "product", productId: "debt-payoff-planner" },
      payment_intent_data: { metadata: { app: "gridrinse", kind: "product", productId: "debt-payoff-planner" } },
      success_url: `${APP_URL}/templates/download?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/templates/debt-payoff-planner`,
    });
    await expect(t.billing.createProductCheckout("nope", { successPath: SUCCESS })).rejects.toMatchObject({ code: "invalid_plan", status: 400 });
    await expect(t.billing.createProductCheckout("bundle", { successPath: "/no-placeholder" })).rejects.toMatchObject({ status: 400 });
    // An off-site cancel path falls back to the home page.
    const s2 = await t.billing.createProductCheckout("bundle", { successPath: SUCCESS, cancelPath: "https://evil.test/" });
    expect(t.fake.sessionsById.get(s2.id)!.cancel_url).toBe(`${APP_URL}/`);
  });

  it("a product without a Stripe price yet is sold with an inline price of the catalog amount", async () => {
    const t = await orderSetup({ priced: [PRODUCTS[1]!] });
    const s = await t.billing.createProductCheckout("debt-payoff-planner", { successPath: SUCCESS });
    expect(t.fake.sessionsById.get(s.id)!.line_items).toEqual([
      {
        price_data: {
          currency: "usd",
          unit_amount: 599,
          tax_behavior: "exclusive",
          product_data: { name: "Debt Payoff Planner", tax_code: "txcd_10000000", metadata: { app: "gridrinse", kind: "product", productId: "debt-payoff-planner" } },
        },
        quantity: 1,
      },
    ]);
    t.fake.completePassCheckout(s.id);
    await t.fake.deliverAll(t.billing);
    expect(await t.billing.claimOrder(s.id)).toMatchObject({ status: "active", order: { amountCents: 599 } });
  });

  it("webhook records the order once, fires the receipt hook once, and access lasts 30 days", async () => {
    const t = await orderSetup();
    const { sessionId, res } = await buy(t, "debt-payoff-planner", { duplicate: true });
    expect(JSON.parse(res[0]!.body).outcome).toBe("processed");
    // The same event delivered twice: the second is a duplicate no-op.
    expect(JSON.parse(res[1]!.body)).toMatchObject({ duplicate: true });
    expect(t.paid).toHaveLength(1);
    expect(t.paid[0]).toMatchObject({ id: sessionId, productId: "debt-payoff-planner", name: "Debt Payoff Planner", email: "buyer@example.test", amountCents: 599 });
    expect(t.paid[0]!.accessUntil.getTime() - t.paid[0]!.paidAt.getTime()).toBe(30 * DAY);

    // The buyer's claim and a second claim change nothing.
    const claim = await t.billing.claimOrder(sessionId);
    expect(claim).toMatchObject({ status: "active", order: { accessUntil: t.paid[0]!.accessUntil } });
    await t.billing.claimOrder(sessionId);
    expect(t.paid).toHaveLength(1);
    const n = await t.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM billing_orders`);
    expect(n.rows[0]!.n).toBe(1);
    // Orders never touch plan entitlements.
    expect((await t.billing.getEntitlements(null)).planId).toBe("free");

    t.advance(30 * DAY);
    expect(await t.billing.claimOrder(sessionId)).toMatchObject({ status: "expired" });
  });

  it("claim before the webhook: verifies with Stripe and records; unpaid stays locked; late webhook is a no-op", async () => {
    const t = await orderSetup();
    const s = await t.billing.createProductCheckout("bundle", { successPath: SUCCESS });
    expect(await t.billing.claimOrder(s.id)).toEqual({ status: "unpaid" });
    t.fake.completePassCheckout(s.id);
    expect(await t.billing.claimOrder(s.id)).toMatchObject({ status: "active", order: { productId: "bundle" } });
    expect(t.paid).toHaveLength(1);
    const res = await t.fake.deliverAll(t.billing);
    expect(res.map((r) => [r.type, r.status, JSON.parse(r.body).outcome])).toEqual([["checkout.session.completed", 200, "processed"]]);
    expect(t.paid).toHaveLength(1);
  });

  it("delayed payments unlock only when paid", async () => {
    const t = await orderSetup();
    const s = await t.billing.createProductCheckout("bundle", { successPath: SUCCESS });
    t.fake.completePassCheckout(s.id, { paymentStatus: "unpaid" });
    await t.fake.deliverAll(t.billing);
    expect(await t.billing.claimOrder(s.id)).toEqual({ status: "unpaid" });
    t.fake.succeedAsyncPayment(s.id);
    await t.fake.deliverAll(t.billing);
    expect(await t.billing.claimOrder(s.id)).toMatchObject({ status: "active" });
    expect(t.paid).toHaveLength(1);
  });

  it("a full refund revokes the download; a partial refund does not", async () => {
    const t = await orderSetup();
    const { sessionId, pi } = await buy(t, "debt-payoff-planner");
    t.fake.refundPayment(pi, { full: false });
    await t.fake.deliverAll(t.billing);
    expect((await t.billing.claimOrder(sessionId)).status).toBe("active");
    t.fake.refundPayment(pi);
    const res = await t.fake.deliverAll(t.billing);
    expect(JSON.parse(res[0]!.body).outcome).toBe("processed");
    expect((await t.billing.claimOrder(sessionId)).status).toBe("revoked");
  });

  it("passes and orders stay apart; other apps' and forged sessions are invalid", async () => {
    const t = await orderSetup();
    const pass = await t.billing.createPassCheckout("day");
    t.fake.completePassCheckout(pass.id);
    await t.fake.deliverAll(t.billing);
    expect(await t.billing.claimOrder(pass.id)).toEqual({ status: "invalid" });
    const { sessionId } = await buy(t, "bundle");
    expect(await t.billing.claimPass(sessionId)).toEqual({ status: "invalid" });
    expect((await t.billing.getEntitlements(null, { passIds: [sessionId] })).pass).toBeNull();
    t.fake.emitRaw("checkout.session.completed", { id: "cs_test_other", object: "checkout.session", mode: "payment", metadata: { app: "snackbox", kind: "product" } });
    const res = await t.fake.deliverAll(t.billing);
    expect(JSON.parse(res[0]!.body).outcome).toBe("ignored");
    expect(await t.billing.claimOrder("cs_test_doesnotexist")).toEqual({ status: "invalid" });
    expect(await t.billing.claimOrder("../etc/passwd")).toEqual({ status: "invalid" });
  });
});
