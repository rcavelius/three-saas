import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@repo/database";
import { getOwnerMetrics } from "./metrics";
import { raiseIncident, resolveIncident } from "./incidents";
import { recordCost } from "./budgets";
import { makeDb } from "./test/fixtures";

const plans = [
  { id: "free", priceMonthlyCents: 0 },
  { id: "solo", priceMonthlyCents: 900 },
  { id: "team", priceMonthlyCents: 2900 },
];
const now = new Date("2026-08-15T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 3600_000).toISOString();

describe("getOwnerMetrics on an empty database", () => {
  let handle: DbHandle<any>;
  beforeAll(async () => {
    handle = await makeDb();
  });
  afterAll(async () => {
    await handle.close();
  });

  it("returns zeros and nulls, never invented numbers", async () => {
    const m = await getOwnerMetrics(handle.executor, { plans, now });
    expect(m.mrrCents.value).toBe(0);
    expect(m.activePaidSubscriptions.value).toBe(0);
    expect(m.newSubscriptionsThisMonth.value).toBe(0);
    expect(m.cancellationsThisMonth.value).toBe(0);
    expect(m.churnRate.value).toBeNull();
    expect(m.signupsThisMonth.value).toBe(0);
    expect(m.conversionRate.value).toBeNull();
    expect(m.pageviews30d.value).toBe(0);
    expect(m.uniqueVisitors30d.value).toBe(0);
    expect(m.costsMonthToDateCents.value).toBe(0);
    expect(m.costsMonthToDateCents.byProvider).toEqual({});
    expect(m.estimatedStripeFeesCents.value).toBe(0);
    expect(m.estimatedOperatingContributionCents.value).toBe(0);
    expect(m.deadLetters24h.value).toBe(0);
    expect(m.deadLetters7d.value).toBe(0);
    expect(m.openIncidents).toMatchObject({ info: 0, warning: 0, critical: 0 });
    expect(m.churnRate.source).toMatch(/null because/);
    expect(m.conversionRate.source).toMatch(/null because/);
    expect(m.periodStart).toBe("2026-08-01T00:00:00.000Z");
  });

  it("returns null with an explanation when auth/billing tables are absent", async () => {
    const bare = await makeDb({ withAuthBilling: false });
    const m = await getOwnerMetrics(bare.executor, { plans, now });
    expect(m.mrrCents.value).toBeNull();
    expect(m.mrrCents.source).toMatch(/does not exist/);
    expect(m.signupsThisMonth.value).toBeNull();
    expect(m.churnRate.value).toBeNull();
    expect(m.estimatedStripeFeesCents.value).toBeNull();
    expect(m.pageviews30d.value).toBe(0);
    await bare.close();
  });
});

describe("getOwnerMetrics with fixture rows", () => {
  let handle: DbHandle<any>;
  beforeAll(async () => {
    handle = await makeDb();
    const q = (sql: string, p: unknown[] = []) => handle.executor.query(sql, p);
    const sub = (org: string, plan: string, status: string, updated: string) =>
      q(`INSERT INTO billing_subscriptions (org_id, stripe_subscription_id, plan_id, status, updated_at) VALUES ($1, $2, $3, $4, $5)`, [
        org,
        `sub_${org}`,
        plan,
        status,
        updated,
      ]);
    await sub("o1", "solo", "active", daysAgo(1));
    await sub("o2", "team", "trialing", daysAgo(1));
    await sub("o3", "solo", "past_due", daysAgo(3)); // within 14-day grace
    await sub("o4", "team", "past_due", daysAgo(20)); // grace over
    await sub("o5", "free", "active", daysAgo(1)); // free plan
    await sub("o6", "solo", "canceled", daysAgo(2));
    await sub("o7", "legacy", "active", daysAgo(1)); // not in catalog

    const ev = (id: string, type: string, at: string) =>
      q(`INSERT INTO billing_events (id, type, created_at, received_at, processed_at) VALUES ($1, $2, $3, $3, $3)`, [id, type, at]);
    await ev("e1", "customer.subscription.created", "2026-08-02T00:00:00Z");
    await ev("e2", "customer.subscription.created", "2026-08-10T00:00:00Z");
    await ev("e3", "customer.subscription.created", "2026-07-31T23:59:59Z"); // last month
    await ev("e4", "customer.subscription.deleted", "2026-08-05T00:00:00Z");
    await ev("e5", "invoice.paid", "2026-08-06T00:00:00Z");

    const user = (id: string, at: string) =>
      q(`INSERT INTO auth_user (id, email, name, created_at) VALUES ($1, $2, 'n', $3)`, [id, `${id}@x.example`, at]);
    for (const [id, at] of [
      ["u1", "2026-08-01T00:00:00Z"],
      ["u2", "2026-08-03T00:00:00Z"],
      ["u3", "2026-08-09T00:00:00Z"],
      ["u4", "2026-08-15T11:00:00Z"],
      ["u0", "2026-07-20T00:00:00Z"],
    ]) await user(id!, at!);
    const org = (id: string, at: string) =>
      q(`INSERT INTO auth_organization (id, name, slug, created_at) VALUES ($1, $1, $1, $2)`, [id, at]);
    await org("o1", "2026-08-01T00:00:00Z");
    await org("o2", "2026-08-03T00:00:00Z");
    await org("o3", "2026-07-10T00:00:00Z");
    await org("o5", "2026-08-09T00:00:00Z");

    const pv = (name: string, anon: string | null, at: string) =>
      q(`INSERT INTO analytics_events (name, anonymous_id, created_at) VALUES ($1, $2, $3)`, [name, anon, at]);
    await pv("pageview", "anon_aaaaaaaa", daysAgo(1));
    await pv("pageview", "anon_aaaaaaaa", daysAgo(2));
    await pv("pageview", "anon_bbbbbbbb", daysAgo(29));
    await pv("pageview", "anon_cccccccc", daysAgo(40)); // outside 30 days
    await pv("signup_started", "anon_aaaaaaaa", daysAgo(1)); // not a pageview

    const c = (provider: string, cents: number, start: string) =>
      recordCost(handle.executor, {
        provider,
        description: "d",
        amountCents: cents,
        periodStart: new Date(start),
        periodEnd: new Date("2026-08-31T00:00:00Z"),
        source: "api",
      });
    await c("fly", 1000, "2026-08-01T00:00:00Z");
    await c("resend", 300, "2026-08-02T00:00:00Z");
    await c("fly", 5000, "2026-07-01T00:00:00Z");

    for (const [d, status] of [
      [2 / 24, "failed"],
      [3, "failed"],
      [10, "failed"],
      [0.1, "done"],
    ] as const) {
      await q(`INSERT INTO jobs (queue, status, finished_at) VALUES ('q', $1, $2)`, [status, daysAgo(d)]);
    }

    await raiseIncident(handle.executor, { fingerprint: "a", severity: "critical", source: "t", title: "a" });
    await raiseIncident(handle.executor, { fingerprint: "b", severity: "warning", source: "t", title: "b" });
    await raiseIncident(handle.executor, { fingerprint: "c", severity: "warning", source: "t", title: "c" });
    const r = await raiseIncident(handle.executor, { fingerprint: "d", severity: "info", source: "t", title: "d" });
    await resolveIncident(handle.executor, r.id);
  });
  afterAll(async () => {
    await handle.close();
  });

  it("computes exact values from the rows", async () => {
    const m = await getOwnerMetrics(handle.executor, { plans, now });
    expect(m.mrrCents.value).toBe(900 + 2900 + 900);
    expect(m.activePaidSubscriptions.value).toBe(3);
    expect(m.newSubscriptionsThisMonth.value).toBe(2);
    expect(m.cancellationsThisMonth.value).toBe(1);
    // start of month = 3 active + 1 canceled - 2 new = 2
    expect(m.churnRate.value).toBe(0.5);
    expect(m.signupsThisMonth.value).toBe(4);
    // orgs created this month that are paid now: o1, o2 (o5 is free, o3 is from July)
    expect(m.conversionRate.value).toBe(0.5);
    expect(m.pageviews30d.value).toBe(3);
    expect(m.uniqueVisitors30d.value).toBe(2);
    expect(m.costsMonthToDateCents.value).toBe(1300);
    expect(m.costsMonthToDateCents.byProvider).toEqual({ fly: 1000, resend: 300 });
    // round(4700 * 0.029) = 136, + 3 * 30
    expect(m.estimatedStripeFeesCents).toMatchObject({ value: 226, estimate: true });
    expect(m.estimatedOperatingContributionCents).toMatchObject({ value: 4700 - 1300 - 226, estimate: true });
    expect(m.deadLetters24h.value).toBe(1);
    expect(m.deadLetters7d.value).toBe(2);
    expect(m.openIncidents).toMatchObject({ critical: 1, warning: 2, info: 0 });
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === "object" && "value" in v) expect((v as { source: string }).source, k).toBeTruthy();
    }
  });

  it("honours a custom past_due grace period", async () => {
    const m = await getOwnerMetrics(handle.executor, { plans, now, pastDueGraceDays: 30 });
    expect(m.mrrCents.value).toBe(900 + 2900 + 900 + 2900);
  });
});
