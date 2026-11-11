import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "@repo/database";
import { checkBudgets, checkUsageCeiling, monthToDateCosts, recordCost, setBudget } from "./budgets";
import { checkBillingHealth } from "./billing-health";
import { getOpenIncident } from "./incidents";
import { makeDb } from "./test/fixtures";

let handle: DbHandle<any>;
const ex = () => handle.executor;
const now = new Date("2026-07-20T12:00:00Z");

beforeAll(async () => {
  handle = await makeDb();
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await ex().exec(
    `DELETE FROM cost_entries; DELETE FROM ops_budgets; DELETE FROM incidents; DELETE FROM billing_events; DELETE FROM billing_subscriptions;`,
  );
});

const cost = (provider: string, cents: number, start = "2026-07-01T00:00:00Z") =>
  recordCost(ex(), {
    provider,
    description: "test",
    amountCents: cents,
    periodStart: new Date(start),
    periodEnd: new Date("2026-07-31T23:59:59Z"),
    source: "manual",
  });

describe("costs and budgets", () => {
  it("sums only this month's USD entries", async () => {
    await cost("fly", 1000);
    await cost("fly", 500, "2026-07-15T00:00:00Z");
    await cost("resend", 200);
    await cost("fly", 9999, "2026-06-30T23:59:59Z"); // last month
    await ex().query(
      `INSERT INTO cost_entries (provider, description, amount_cents, currency, period_start, period_end, source)
       VALUES ('fly', 'eur', 777, 'eur', '2026-07-02', '2026-07-03', 'manual')`,
    );
    expect(await monthToDateCosts(ex(), now)).toEqual({ totalCents: 1700, byProvider: { fly: 1500, resend: 200 } });
  });

  it("validates cost input", async () => {
    await expect(cost("fly", -1)).rejects.toThrow();
    await expect(cost("bad provider!", 1)).rejects.toThrow();
  });

  it("warns at warn_ratio, goes critical at 100%, resolves when back under", async () => {
    await setBudget(ex(), { name: "fly", monthlyLimitCents: 2000, warnRatio: 0.75 });
    await setBudget(ex(), { name: "total", monthlyLimitCents: 10_000 });
    await cost("fly", 1400);
    let r = await checkBudgets(ex(), { now });
    expect(r.find((b) => b.name === "fly")).toMatchObject({ spentCents: 1400, level: "ok" });
    expect(await getOpenIncident(ex(), "budget:fly")).toBeNull();

    await cost("fly", 100); // 1500 / 2000 = 75%
    r = await checkBudgets(ex(), { now });
    expect(r.find((b) => b.name === "fly")?.level).toBe("warning");
    expect((await getOpenIncident(ex(), "budget:fly"))?.severity).toBe("warning");

    await cost("fly", 500); // 100%
    r = await checkBudgets(ex(), { now });
    expect(r.find((b) => b.name === "fly")?.level).toBe("critical");
    expect((await getOpenIncident(ex(), "budget:fly"))?.severity).toBe("critical");
    expect(r.find((b) => b.name === "total")).toMatchObject({ spentCents: 2000, level: "ok" });

    // New month: nothing spent yet => resolved.
    r = await checkBudgets(ex(), { now: new Date("2026-08-01T00:10:00Z") });
    expect(r.find((b) => b.name === "fly")?.level).toBe("ok");
    expect(await getOpenIncident(ex(), "budget:fly")).toBeNull();
  });
});

describe("checkUsageCeiling", () => {
  it("raises warning at 80%, critical at 100%, auto-resolves below", async () => {
    expect((await checkUsageCeiling(ex(), { metric: "captured_requests", value: 79, ceiling: 100 })).level).toBe("ok");
    expect((await checkUsageCeiling(ex(), { metric: "captured_requests", value: 80, ceiling: 100 })).level).toBe("warning");
    expect((await getOpenIncident(ex(), "usage:captured_requests"))?.severity).toBe("warning");
    expect((await checkUsageCeiling(ex(), { metric: "captured_requests", value: 150, ceiling: 100 })).level).toBe("critical");
    const inc = await getOpenIncident(ex(), "usage:captured_requests");
    expect(inc?.severity).toBe("critical");
    expect(inc?.details).toEqual({ value: 150, ceiling: 100 });
    await checkUsageCeiling(ex(), { metric: "captured_requests", value: 10, ceiling: 100 });
    expect(await getOpenIncident(ex(), "usage:captured_requests")).toBeNull();
    await expect(checkUsageCeiling(ex(), { metric: "x", value: 1, ceiling: 0 })).rejects.toThrow();
  });
});

describe("checkBillingHealth", () => {
  const ev = (id: string, receivedMinAgo: number, processed: boolean, error: string | null = null) =>
    ex().query(
      `INSERT INTO billing_events (id, type, created_at, received_at, processed_at, attempts, error) VALUES ($1, 'invoice.paid', $2, $2, $3, 1, $4)`,
      [id, new Date(now.getTime() - receivedMinAgo * 60_000).toISOString(), processed ? now.toISOString() : null, error],
    );

  it("is quiet when everything is processed", async () => {
    await ev("evt_1", 60, true);
    await ev("evt_2", 5, false); // still within 15 min
    const r = await checkBillingHealth(ex(), { now });
    expect(r).toMatchObject({ skipped: false, stuckEvents: 0, issues: [] });
  });

  it("raises a critical incident for unprocessed or errored events older than 15 minutes, resolves after", async () => {
    await ev("evt_1", 20, false);
    await ev("evt_2", 30, false, "handler threw");
    let r = await checkBillingHealth(ex(), { now });
    expect(r.stuckEvents).toBe(2);
    const inc = await getOpenIncident(ex(), "billing:webhook_backlog");
    expect(inc?.severity).toBe("critical");
    expect(inc?.details).toEqual({ stuck: 2, errored: 1 });
    await ex().query(`UPDATE billing_events SET processed_at = $1`, [now.toISOString()]);
    r = await checkBillingHealth(ex(), { now });
    expect(r.stuckEvents).toBe(0);
    expect(await getOpenIncident(ex(), "billing:webhook_backlog")).toBeNull();
  });

  it("warns when paid subscriptions exist but no webhook arrived in 7 days", async () => {
    await ex().query(
      `INSERT INTO billing_subscriptions (org_id, stripe_customer_id, stripe_subscription_id, plan_id, status, last_event_at) VALUES ('o1', 'cus_1', 'sub_1', 'solo', 'active', now())`,
    );
    await ev("evt_old", 8 * 24 * 60, true);
    let r = await checkBillingHealth(ex(), { now });
    expect(r.issues).toEqual(["no_webhooks"]);
    expect((await getOpenIncident(ex(), "billing:no_webhooks"))?.severity).toBe("warning");
    await ev("evt_new", 60, true);
    r = await checkBillingHealth(ex(), { now });
    expect(r.issues).toEqual([]);
    expect(await getOpenIncident(ex(), "billing:no_webhooks")).toBeNull();
  });

  it("does not warn about silence when there are no paid subscriptions", async () => {
    const r = await checkBillingHealth(ex(), { now });
    expect(r.issues).toEqual([]);
  });

  it("skips when billing tables are absent", async () => {
    const bare = await makeDb({ withAuthBilling: false });
    expect((await checkBillingHealth(bare.executor, { now })).skipped).toBe(true);
    await bare.close();
  });
});
