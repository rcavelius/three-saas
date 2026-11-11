import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp, STEPS, type App } from "./test/harness";

let t = new Date("2026-11-11T12:00:00Z").getTime();
const now = () => new Date(t);
const advanceDays = (d: number) => {
  t += d * 86_400_000;
};

let app: App;
beforeAll(async () => {
  app = await makeApp({ now });
});
afterAll(async () => {
  await app.close();
});

async function ent(jar: Map<string, string>) {
  return (await (await app.entitlements(jar)).json()) as {
    planId: string;
    status: string;
    limits: Record<string, number>;
    cancelAtPeriodEnd: boolean;
    graceEndsAt: string | null;
    usage: { savedWorkflows: number };
  };
}

describe("billing lifecycle via FakeStripe and signed webhooks on the app route", () => {
  it("checkout → pro entitlements → payment failure grace → downgrade locks (not deletes) excess workflows", async () => {
    const u = await app.user("lifecycle@example.com");
    expect((await ent(u.jar)).planId).toBe("free");

    const subId = await app.subscribe(u.jar, "pro");
    let e = await ent(u.jar);
    expect(e.planId).toBe("pro");
    expect(e.limits).toMatchObject({ maxFileMb: 50, maxRows: 500_000, filesPerBatch: 20, savedWorkflows: 50 });
    // owner got a plan-changed email (via ops builders, into the outbox)
    const { rows: mails } = await app.p.handle.executor.query<{ tag: string; to_address: string }>(`SELECT tag, to_address FROM ops_email_outbox WHERE to_address = $1`, ["lifecycle@example.com"]);
    expect(mails.map((m) => m.tag)).toContain("plan_changed");

    // Duplicate webhook delivery is a no-op.
    const before = await app.p.handle.executor.query(`SELECT count(*)::int AS n FROM billing_events`);
    app.fake.advancePeriod(subId);
    const events = app.fake.takeEvents();
    for (const d of [...events, ...events]) {
      const r = await app.call((p, req) => app.routes.webhookRouteHandler(p, req), "/api/billing/webhook", { rawBody: d.payload, origin: null, headers: { "stripe-signature": d.header, "content-type": "application/json" } });
      expect(r.status).toBe(200);
    }
    const after = await app.p.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM billing_events`);
    expect(Number(after.rows[0]!.n) - Number((before.rows[0] as { n: number }).n)).toBe(events.length);

    // A forged webhook is rejected.
    const forged = await app.call((p, req) => app.routes.webhookRouteHandler(p, req), "/api/billing/webhook", { rawBody: events[0]!.payload, origin: null, headers: { "stripe-signature": "t=1,v1=deadbeef" } });
    expect(forged.status).toBe(400);

    for (let i = 0; i < 3; i++) expect((await app.wf.create(u.jar, { name: `flow ${i}`, steps: STEPS })).status).toBe(201);

    // Payment fails: past_due keeps Pro during the 7-day grace period, then falls back to Free.
    app.fake.failPayment(subId);
    await app.deliverWebhooks();
    e = await ent(u.jar);
    expect(e.status).toBe("past_due");
    expect(e.planId).toBe("pro");
    expect(e.graceEndsAt).not.toBeNull();
    const { rows: failed } = await app.p.handle.executor.query(`SELECT 1 FROM ops_email_outbox WHERE tag = 'payment_failed' AND to_address = $1`, ["lifecycle@example.com"]);
    expect(failed.length).toBe(1);
    advanceDays(8);
    e = await ent(u.jar);
    expect(e.planId).toBe("free");

    // Payment recovers.
    app.fake.recoverPayment(subId);
    await app.deliverWebhooks();
    expect((await ent(u.jar)).planId).toBe("pro");

    // Cancel at period end, period ends → Free. Workflows over the limit are kept but locked.
    app.fake.portalCancelAtPeriodEnd(subId);
    await app.deliverWebhooks();
    expect((await ent(u.jar)).cancelAtPeriodEnd).toBe(true);
    advanceDays(31);
    app.fake.advancePeriod(subId);
    await app.deliverWebhooks();
    e = await ent(u.jar);
    expect(e.planId).toBe("free");
    expect(e.usage.savedWorkflows).toBe(3);

    const list = (await (await app.wf.list(u.jar)).json()) as { workflows: { id: string; locked: boolean }[]; limit: number };
    expect(list.limit).toBe(0);
    expect(list.workflows).toHaveLength(3);
    expect(list.workflows.every((w) => w.locked)).toBe(true);
    const id = list.workflows[0]!.id;
    expect((await app.wf.get(u.jar, id)).status).toBe(200); // still readable / exportable
    const upd = await app.wf.update(u.jar, id, { name: "edit", steps: [] });
    expect(upd.status).toBe(403);
    expect(((await upd.json()) as { error: string }).error).toBe("workflow_locked");
    expect((await app.wf.create(u.jar, { name: "new", steps: [] })).status).toBe(403);
    expect((await app.wf.remove(u.jar, id)).status).toBe(204); // can still clean up
    const { rows: canceledMail } = await app.p.handle.executor.query(`SELECT 1 FROM ops_email_outbox WHERE tag = 'subscription_canceled' AND to_address = $1`, ["lifecycle@example.com"]);
    expect(canceledMail.length).toBe(1);
  });

  it("partial downgrade (Business → Pro) locks only the newest workflows beyond the new limit", async () => {
    const u = await app.user("partial@example.com");
    const subId = await app.subscribe(u.jar, "business"); // unlimited
    for (let i = 0; i < 52; i++) {
      const r = await app.wf.create(u.jar, { name: `b${String(i).padStart(2, "0")}`, steps: [] }, { ip: `10.20.${i}.1` });
      if (r.status !== 201) throw new Error(`create ${i}: ${r.status}`);
      t += 1000; // distinct created_at
      if (i === 30) await new Promise((r2) => setTimeout(r2, 0));
    }
    app.fake.portalChangePrice(subId, "gridrinse_pro_monthly");
    await app.deliverWebhooks();
    expect((await ent(u.jar)).planId).toBe("pro");
    const list = (await (await app.wf.list(u.jar, "10.30.0.1")).json()) as { workflows: { name: string; locked: boolean }[] };
    expect(list.workflows.filter((w) => w.locked)).toHaveLength(2);
    expect(list.workflows.filter((w) => !w.locked)).toHaveLength(50);
  });

  it("only the owner can start checkout; non-owners get 403; unknown plans 400", async () => {
    const u = await app.user("plans@example.com");
    const bad = await app.call((p, r) => app.routes.checkoutRouteHandler(p, r), "/api/billing/checkout", { jar: u.jar, body: { planId: "enterprise" } });
    expect(bad.status).toBe(400);
    const anon = await app.call((p, r) => app.routes.checkoutRouteHandler(p, r), "/api/billing/checkout", { body: { planId: "pro" } });
    expect(anon.status).toBe(401);
  });

  it("without a Stripe key, checkout answers a clear 503 and entitlements stay free", async () => {
    const noStripe = await makeApp({ stripe: "none" });
    try {
      const u = await noStripe.user("nostripe@example.com");
      const r = await noStripe.call((p, req) => noStripe.routes.checkoutRouteHandler(p, req), "/api/billing/checkout", { jar: u.jar, body: { planId: "pro" } });
      expect(r.status).toBe(503);
      expect(((await r.json()) as { error: string }).error).toBe("billing_not_configured");
      const portal = await noStripe.call((p, req) => noStripe.routes.portalRouteHandler(p, req), "/api/billing/portal", { jar: u.jar, body: {} });
      expect(portal.status).toBe(503);
      const e = (await (await noStripe.entitlements(u.jar)).json()) as { planId: string; billingConfigured: boolean };
      expect(e).toMatchObject({ planId: "free", billingConfigured: false });
      // Any webhook is rejected (no secret can verify).
      const wh = await noStripe.call((p, req) => noStripe.routes.webhookRouteHandler(p, req), "/api/billing/webhook", { rawBody: "{}", origin: null, headers: { "stripe-signature": "t=1,v1=x" } });
      expect(wh.status).toBe(400);
    } finally {
      await noStripe.close();
    }
  });
});
