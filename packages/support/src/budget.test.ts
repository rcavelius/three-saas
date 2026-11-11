import { afterEach, describe, expect, it } from "vitest";
import type { DbHandle } from "@repo/database";
import { budgetStatus, checkBudgetIncidents, costMicros, reserveBudget, settleBudget } from "./budget";
import { makeDb } from "./test/helpers";

let handle: DbHandle<any> | null = null;
afterEach(async () => {
  await handle?.close();
  handle = null;
});

const now = new Date("2026-11-11T12:00:00Z");

describe("cost estimate", () => {
  it("uses the published per-token prices (Haiku 5.5: $0.10 / $0.50 per MTok)", () => {
    expect(costMicros("claude-haiku-5-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(100_000);
    expect(costMicros("claude-haiku-5-5", { inputTokens: 0, outputTokens: 1_000_000 })).toBe(500_000);
    // unknown models are priced at the most expensive tier
    expect(costMicros("claude-unknown", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(10_000_000);
  });
});

describe("reserve then settle", () => {
  it("concurrent reservations never exceed the monthly cap", async () => {
    handle = await makeDb();
    const cfg = { monthlyCapCents: 10, dailyCapCents: 10 }; // 100,000 micro-dollars
    const results = await Promise.all(Array.from({ length: 40 }, () => reserveBudget(handle!, cfg, 7_000, now)));
    const ok = results.filter((r) => r.ok).length;
    expect(ok).toBe(14); // floor(100000 / 7000)
    const s = await budgetStatus(handle.executor, cfg, now);
    expect(s.monthMicros).toBeLessThanOrEqual(100_000);
  });

  it("settling releases the reservation and books the actual cost", async () => {
    handle = await makeDb();
    const cfg = { monthlyCapCents: 100, dailyCapCents: 5 };
    const r = await reserveBudget(handle, cfg, 20_000, now);
    if (!r.ok) throw new Error("expected reservation");
    await settleBudget(handle, r.reservation, 1_234, { inputTokens: 900, outputTokens: 100 }, now);
    const { rows } = await handle.executor.query<Record<string, string>>(`SELECT * FROM support_ai_usage`);
    expect(rows[0]).toMatchObject({ calls: 1 });
    expect(Number(rows[0]!.reserved_micros)).toBe(0);
    expect(Number(rows[0]!.cost_micros)).toBe(1_234);
    expect(Number(rows[0]!.input_tokens)).toBe(900);
    expect(Number(rows[0]!.output_tokens)).toBe(100);
  });

  it("enforces the daily cap separately from the monthly cap", async () => {
    handle = await makeDb();
    const cfg = { monthlyCapCents: 500, dailyCapCents: 1 }; // 10,000 micro-dollars per day
    expect((await reserveBudget(handle, cfg, 6_000, now)).ok).toBe(true);
    expect(await reserveBudget(handle, cfg, 6_000, now)).toEqual({ ok: false, reason: "daily_cap" });
    expect((await reserveBudget(handle, cfg, 6_000, new Date("2026-11-12T00:30:00Z"))).ok).toBe(true);
  });
});

describe("budget incidents", () => {
  it("warning at 80 %, critical at 100 % of the monthly cap", async () => {
    handle = await makeDb();
    const cfg = { monthlyCapCents: 100, dailyCapCents: 100 }; // 1,000,000 micro-dollars
    const ex = handle.executor;
    await ex.query(`INSERT INTO support_ai_usage (day, cost_micros) VALUES ('2026-11-03', 790000)`);
    expect(await checkBudgetIncidents(ex, cfg, now, { app: "T" })).toBe("none");
    await ex.query(`UPDATE support_ai_usage SET cost_micros = 810000`);
    expect(await checkBudgetIncidents(ex, cfg, now, { app: "T" })).toBe("warning");
    let { rows } = await ex.query<{ severity: string; status: string }>(`SELECT severity, status FROM incidents WHERE fingerprint = 'support:ai_budget:2026-11'`);
    expect(rows).toEqual([{ severity: "warning", status: "open" }]);
    await ex.query(`UPDATE support_ai_usage SET cost_micros = 1000000`);
    expect(await checkBudgetIncidents(ex, cfg, now, { app: "T" })).toBe("critical");
    ({ rows } = await ex.query<{ severity: string; status: string }>(`SELECT severity, status FROM incidents WHERE fingerprint = 'support:ai_budget:2026-11'`));
    expect(rows).toEqual([{ severity: "critical", status: "open" }]); // same incident, raised
  });
});
