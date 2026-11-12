import { describe, expect, it } from "vitest";
import { defineCatalog } from "./catalog";
import { WEBHOOKTRAIL_CATALOG } from "./catalogs";
import { withOrgLock } from "./locks";
import { setup } from "./test-helpers";

const TEST_CATALOG = defineCatalog({
  app: "usagetest",
  freePlanId: "free",
  plans: [
    { id: "free", name: "Free", priceMonthlyCents: 0, limits: { exports: 5, unlimitedThing: -1, nothing: 0, things: 2 }, features: {} },
    {
      id: "pro",
      name: "Pro",
      priceMonthlyCents: 500,
      stripeLookupKey: "usagetest_pro_monthly",
      limits: { exports: 50, unlimitedThing: -1, nothing: 0, things: 10 },
      features: {},
    },
  ],
});

describe("usage counters", () => {
  it("never exceeds the limit under 50 concurrent consumers, and resets per period", async () => {
    const t = await setup({ catalog: WEBHOOKTRAIL_CATALOG });
    const limit = WEBHOOKTRAIL_CATALOG.plans[0]!.limits.requestsPerMonth!; // 3000 on free
    expect(t.billing.currentPeriod()).toBe("2026-03");
    const results = await Promise.all(
      Array.from({ length: 50 }, () => t.billing.consumeUsage("org_a", "requestsPerMonth", 100)),
    );
    const ok = results.filter((r) => r.ok);
    expect(ok).toHaveLength(limit / 100);
    expect(results.every((r) => r.limit === limit && r.used <= limit)).toBe(true);
    expect(await t.billing.getUsage("org_a", "requestsPerMonth")).toBe(limit);
    expect(await t.billing.consumeUsage("org_a", "requestsPerMonth", 1)).toEqual({ ok: false, used: limit, limit });

    // Calendar month (UTC) rollover: a fresh counter.
    t.clock.t = new Date("2026-04-01T00:00:00.000Z");
    expect(t.billing.currentPeriod()).toBe("2026-04");
    expect(await t.billing.consumeUsage("org_a", "requestsPerMonth", 100)).toEqual({ ok: true, used: 100, limit });
    // Explicit period keeps the old counter addressable.
    expect(await t.billing.getUsage("org_a", "requestsPerMonth", { period: "2026-03" })).toBe(limit);
    // Other orgs have their own counters.
    expect((await t.billing.consumeUsage("org_b", "requestsPerMonth", 3000)).ok).toBe(true);
    expect((await t.billing.consumeUsage("org_b", "requestsPerMonth", 1)).ok).toBe(false);
  });

  it("limits come from current entitlements (upgrade raises them), -1 is unlimited, 0 blocks", async () => {
    const t = await setup({ catalog: TEST_CATALOG });
    for (let i = 0; i < 5; i++) expect((await t.billing.consumeUsage("org_a", "exports", 1)).ok).toBe(true);
    expect(await t.billing.consumeUsage("org_a", "exports", 1)).toEqual({ ok: false, used: 5, limit: 5 });
    // A single request larger than the limit is refused without touching the counter.
    expect((await t.billing.consumeUsage("org_new", "exports", 6)).ok).toBe(false);
    expect(await t.billing.getUsage("org_new", "exports")).toBe(0);

    await t.subscribe("org_a", "pro");
    expect(await t.billing.consumeUsage("org_a", "exports", 1)).toEqual({ ok: true, used: 6, limit: 50 });

    expect(await t.billing.consumeUsage("org_a", "unlimitedThing", 1_000_000)).toEqual({ ok: true, used: 1_000_000, limit: -1 });
    expect(await t.billing.consumeUsage("org_a", "unlimitedThing", 1)).toEqual({ ok: true, used: 1_000_001, limit: -1 });
    expect(await t.billing.consumeUsage("org_a", "nothing", 1)).toEqual({ ok: false, used: 0, limit: 0 });
    await expect(t.billing.consumeUsage("org_a", "notAMetric", 1)).rejects.toThrow(/Unknown usage metric/);
    await expect(t.billing.consumeUsage("org_a", "exports", -1)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(t.billing.consumeUsage("org_a", "exports", 1.5)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(t.billing.consumeUsage("org_a", "exports", 1, { period: "x'; drop" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("releaseUsage never goes below 0", async () => {
    const t = await setup({ catalog: TEST_CATALOG });
    await t.billing.consumeUsage("org_a", "exports", 3);
    await t.billing.releaseUsage("org_a", "exports", 2);
    expect(await t.billing.getUsage("org_a", "exports")).toBe(1);
    await t.billing.releaseUsage("org_a", "exports", 10);
    expect(await t.billing.getUsage("org_a", "exports")).toBe(0);
    await t.billing.releaseUsage("org_a", "exports", 1);
    await t.billing.releaseUsage("org_nobody", "exports", 1);
    expect(await t.billing.getUsage("org_a", "exports")).toBe(0);
    expect((await t.billing.consumeUsage("org_a", "exports", 5)).ok).toBe(true);
  });

  it("withOrgLock serialises count-then-insert gauge checks", async () => {
    const t = await setup({ catalog: TEST_CATALOG });
    await t.handle.executor.exec(`CREATE TABLE things (id serial PRIMARY KEY, org_id text NOT NULL)`);
    const limit = (await t.billing.getEntitlements("org_a")).limits.things!;
    const tryAdd = () =>
      t.handle
        .transaction(async (tx) => {
          await withOrgLock(tx, "org_a");
          const { rows } = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM things WHERE org_id = $1`, ["org_a"]);
          if (rows[0]!.n >= limit) return false;
          await new Promise((r) => setTimeout(r, 2));
          await tx.query(`INSERT INTO things (org_id) VALUES ($1)`, ["org_a"]);
          return true;
        });
    const results = await Promise.all(Array.from({ length: 10 }, tryAdd));
    expect(results.filter(Boolean)).toHaveLength(limit);
    const { rows } = await t.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM things`);
    expect(rows[0]!.n).toBe(limit);
    await expect(t.handle.transaction((tx) => withOrgLock(tx, ""))).rejects.toThrow();
  });
});
