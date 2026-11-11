import { beforeAll, describe, expect, it } from "vitest";
import type { FakeStripe } from "@repo/billing/testing";
import * as checkoutRoute from "@/app/api/billing/checkout/route";
import * as portalRoute from "@/app/api/billing/portal/route";
import * as webhookRoute from "@/app/api/billing/webhook/route";
import { CATALOG } from "@/lib/plans";
import { installPlatformForTests, type Platform } from "@/lib/platform";
import type { EndpointDTO, RequestDetailDTO } from "@/lib/types";
import { apiRequest, capture, createEndpoint, ORIGIN, routes, signUpVerified, uniqueEmail } from "./helpers";
import { deliverWebhooks, setupPlatform, subscribe } from "./platform";

let p: Platform;
let fake: FakeStripe;
beforeAll(async () => {
  ({ p, fake } = await setupPlatform());
});

const outbox = async (to: string, tag: string) =>
  (await p.ex.query<{ subject: string }>(`SELECT subject FROM ops_email_outbox WHERE to_address = $1 AND tag = $2`, [to, tag])).rows;

describe("billing lifecycle through the app's routes (FakeStripe, signed webhooks)", () => {
  it("rejects unsigned / wrongly signed webhooks", async () => {
    const res = await webhookRoute.POST(
      new Request(`${ORIGIN}/api/billing/webhook`, { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: "{}" }),
    );
    expect(res.status).toBe(400);
  });

  it("checkout -> paid plan; endpoints stop expiring; downgrade locks excess endpoints; upgrade unlocks", async () => {
    const owner = await signUpVerified(uniqueEmail("payer"));
    const first = await createEndpoint(undefined, undefined, owner.jar);
    expect(first.endpoint.expiresAt).not.toBeNull();

    const subId = await subscribe(fake, owner, "developer");
    const ent = await p.billing.getEntitlements(owner.orgId);
    expect(ent.planId).toBe("developer");
    expect(await outbox(owner.email, "plan_changed")).toHaveLength(1);
    // Paid: the existing endpoint no longer expires; new ones never do.
    const again = (await (await routes.getEndpoint(first.endpoint.id, { jar: owner.jar })).json()) as { endpoint: EndpointDTO };
    expect(again.endpoint.expiresAt).toBeNull();
    const more: EndpointDTO[] = [];
    for (let i = 0; i < 4; i++) more.push((await createEndpoint(undefined, undefined, owner.jar)).endpoint);
    expect(more.every((e) => e.expiresAt === null)).toBe(true);

    // Portal (owner only) - members/others cannot open it.
    const portal = await portalRoute.POST(apiRequest("POST", "/api/billing/portal", { jar: owner.jar }));
    expect(portal.status).toBe(200);

    // Cancel at period end, then the period ends -> free plan.
    fake.portalCancelAtPeriodEnd(subId);
    await deliverWebhooks(fake);
    expect((await p.billing.getEntitlements(owner.orgId)).planId).toBe("developer");
    fake.advancePeriod(subId);
    await deliverWebhooks(fake);
    expect((await p.billing.getEntitlements(owner.orgId)).planId).toBe("free");

    // 5 endpoints, free allows 3: the 2 newest are locked (not deleted) and capture answers 423.
    const { rows } = await p.ex.query<{ id: string; locked_at: Date | null }>(
      `SELECT id, locked_at FROM endpoints WHERE org_id = $1 ORDER BY created_at`,
      [owner.orgId],
    );
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.locked_at).map((r) => r.id)).toEqual([more[2]!.id, more[3]!.id]);
    const locked = await capture(more[3]!.slug, "POST", { body: "x" });
    expect(locked.status).toBe(423);
    expect(((await locked.json()) as { error: string }).error).toBe("endpoint_paused");
    const dto = (await (await routes.getEndpoint(more[3]!.id, { jar: owner.jar })).json()) as { endpoint: EndpointDTO };
    expect(dto.endpoint.locked).toBe(true);
    // Creating a 6th endpoint is refused on free.
    expect((await createEndpoint(undefined, undefined, owner.jar)).res.status).toBe(403);

    // Subscribe again (Pro): everything unlocks.
    await subscribe(fake, owner, "pro");
    const { rows: after } = await p.ex.query(`SELECT 1 FROM endpoints WHERE org_id = $1 AND locked_at IS NOT NULL`, [owner.orgId]);
    expect(after).toHaveLength(0);
    expect((await capture(more[3]!.slug, "POST", { body: "x" })).status).toBe(200);
  });

  it("emails owners on a failed payment", async () => {
    const owner = await signUpVerified(uniqueEmail("failpay"));
    const subId = await subscribe(fake, owner, "developer");
    fake.failPayment(subId);
    await deliverWebhooks(fake);
    expect(await outbox(owner.email, "payment_failed")).toHaveLength(1);
  });

  it("answers a clear 503 for checkout when Stripe is not configured (and 401 when signed out)", async () => {
    const { p: unconfigured } = await setupPlatform({ stripe: null });
    try {
      const u = await signUpVerified(uniqueEmail("nostripe"));
      const res = await checkoutRoute.POST(apiRequest("POST", "/api/billing/checkout", { jar: u.jar, body: { planId: "pro" } }));
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("billing_not_configured");
      expect((await unconfigured.billing.getEntitlements(u.orgId)).planId).toBe("free");
      const anon = await checkoutRoute.POST(apiRequest("POST", "/api/billing/checkout", { body: { planId: "pro" } }));
      expect(anon.status).toBe(401);
    } finally {
      installPlatformForTests(p);
    }
  });
});

describe("plan limits on capture", () => {
  it("payload caps follow the plan: free rejects > 1 MB, developer accepts 2 MB and stores 1 MB", async () => {
    const free = await createEndpoint();
    const oneMbPlus = "x".repeat(1024 * 1024 + 1);
    const r1 = await capture(free.endpoint.slug, "POST", { body: oneMbPlus });
    expect(r1.status).toBe(413);
    expect(((await r1.json()) as { error: string }).error).toBe("payload_too_large");

    const dev = await signUpVerified(uniqueEmail("devcap"));
    await subscribe(fake, dev, "developer");
    const e = await createEndpoint(undefined, undefined, dev.jar);
    const big = "y".repeat(1536 * 1024);
    const r2 = await capture(e.endpoint.slug, "POST", { body: big });
    expect(r2.status).toBe(200);
    const id = ((await r2.json()) as { id: string }).id;
    const d = ((await (await routes.getRequest(e.endpoint.id, id, { jar: dev.jar })).json()) as { request: RequestDetailDTO }).request;
    expect(d.bodySize).toBe(big.length);
    expect(d.truncated).toBe(true);
    expect(d.storedBodySize).toBe(CATALOG.plans.find((x) => x.id === "developer")!.limits.storedBodyKb! * 1024);
    const r3 = await capture(e.endpoint.slug, "POST", { body: "z".repeat(2048 * 1024 + 1) });
    expect(r3.status).toBe(413);
  });
});

describe("monthly quota (consumeUsage)", () => {
  const limit = CATALOG.plans.find((x) => x.id === "free")!.limits.requestsPerMonth!;

  it("answers 429 quota_exceeded with a clear JSON body once the org's monthly quota is used", async () => {
    const u = await signUpVerified(uniqueEmail("quota"));
    const e = await createEndpoint(undefined, undefined, u.jar);
    const period = p.billing.currentPeriod();
    await p.ex.query(`INSERT INTO billing_usage (org_id, metric, period, used) VALUES ($1, 'requestsPerMonth', $2, $3)`, [
      u.orgId,
      period,
      limit - 1,
    ]);
    expect((await capture(e.endpoint.slug, "POST", { body: "last" })).status).toBe(200);
    const over = await capture(e.endpoint.slug, "POST", { body: "over" });
    expect(over.status).toBe(429);
    const body = (await over.json()) as { error: string; message: string; limit: number; used: number; resetsAt: string };
    expect(body.error).toBe("quota_exceeded");
    expect(body.limit).toBe(limit);
    expect(body.used).toBe(limit);
    expect(body.message).toMatch(/Monthly request quota exhausted/);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    // Nothing stored for the rejected request.
    const { rows } = await p.ex.query(`SELECT 1 FROM captured_requests WHERE endpoint_id = $1`, [e.endpoint.id]);
    expect(rows).toHaveLength(1);
  });

  it("never exceeds the quota under many concurrent captures at the limit", async () => {
    const u = await signUpVerified(uniqueEmail("race"));
    const e = await createEndpoint(undefined, undefined, u.jar);
    const period = p.billing.currentPeriod();
    await p.ex.query(`INSERT INTO billing_usage (org_id, metric, period, used) VALUES ($1, 'requestsPerMonth', $2, $3)`, [
      u.orgId,
      period,
      limit - 5,
    ]);
    const statuses = await Promise.all(Array.from({ length: 40 }, (_, i) => capture(e.endpoint.slug, "POST", { body: String(i) }).then((r) => r.status)));
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(35);
    expect(await p.billing.getUsage(u.orgId, "requestsPerMonth")).toBe(limit);
    const { rows } = await p.ex.query(`SELECT 1 FROM captured_requests WHERE endpoint_id = $1`, [e.endpoint.id]);
    expect(rows).toHaveLength(5);
  });

  it("emails the owner once per period when usage crosses 80%", async () => {
    const u = await signUpVerified(uniqueEmail("near"));
    const e = await createEndpoint(undefined, undefined, u.jar);
    const period = p.billing.currentPeriod();
    await p.ex.query(`INSERT INTO billing_usage (org_id, metric, period, used) VALUES ($1, 'requestsPerMonth', $2, $3)`, [
      u.orgId,
      period,
      Math.ceil(limit * 0.8) - 2,
    ]);
    await Promise.all(Array.from({ length: 6 }, () => capture(e.endpoint.slug, "POST", { body: "x" })));
    expect(await outbox(u.email, "usage_near_limit")).toHaveLength(1);
  });
});
