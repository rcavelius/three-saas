import { describe, expect, it } from "vitest";
import { GRIDRINSE_CATALOG, getFreePlan } from "@repo/billing";
import { checkDownload, countsTowardsDaily, DOWNLOAD_COUNT_KEY, downloadsToday, recordDownload } from "./downloadQuota";
import { processingLimits } from "./limits";

const free = getFreePlan(GRIDRINSE_CATALOG);
const freeLimits = processingLimits(free.id, free.name, free.limits);
const pro = GRIDRINSE_CATALOG.plans.find((p) => p.id === "pro")!;
const proLimits = processingLimits(pro.id, pro.name, pro.limits);

function memoryStore() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe("free download fence", () => {
  it("the free plan downloads up to 1,000 rows, once a day", () => {
    expect(freeLimits).toMatchObject({ downloadRows: 1_000, downloadsPerDay: 1 });
    expect(checkDownload({ rows: 1_000, limits: freeLimits, usedToday: 0 })).toEqual({ ok: true });
    expect(checkDownload({ rows: 1_001, limits: freeLimits, usedToday: 0 })).toEqual({ ok: false, reason: "download_rows" });
    expect(checkDownload({ rows: 10, limits: freeLimits, usedToday: 1 })).toEqual({ ok: false, reason: "download_daily" });
    // Too many rows is the reason shown first (buying a day pass fixes both).
    expect(checkDownload({ rows: 12_345, limits: freeLimits, usedToday: 1 })).toEqual({ ok: false, reason: "download_rows" });
  });

  it("the built-in sample is always downloadable and never counts", () => {
    expect(checkDownload({ rows: 16, limits: freeLimits, usedToday: 5, sample: true })).toEqual({ ok: true });
    expect(countsTowardsDaily(freeLimits, true)).toBe(false);
    expect(countsTowardsDaily(freeLimits, false)).toBe(true);
  });

  it("paid plans and an active pass (-1) are unlimited", () => {
    expect(proLimits).toMatchObject({ downloadRows: -1, downloadsPerDay: -1 });
    expect(checkDownload({ rows: 2_000_000, limits: proLimits, usedToday: 999 })).toEqual({ ok: true });
    expect(countsTowardsDaily(proLimits, false)).toBe(false);
    const day = GRIDRINSE_CATALOG.passes!.find((p) => p.id === "day")!;
    expect(day.limits).toMatchObject({ downloadRows: -1, downloadsPerDay: -1 });
  });

  it("counts per UTC day in this browser and resets the next day", () => {
    const store = memoryStore();
    const d1 = new Date("2026-11-23T23:30:00Z");
    expect(downloadsToday(d1, store)).toBe(0);
    recordDownload(d1, store);
    expect(downloadsToday(d1, store)).toBe(1);
    expect(JSON.parse(store.map.get(DOWNLOAD_COUNT_KEY)!)).toEqual({ day: "2026-11-23", count: 1 });
    recordDownload(d1, store);
    expect(downloadsToday(d1, store)).toBe(2);
    expect(downloadsToday(new Date("2026-11-24T00:00:01Z"), store)).toBe(0);
  });

  it("blocked or garbled storage never throws (counts as no downloads yet)", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(downloadsToday(new Date(), broken)).toBe(0);
    expect(() => recordDownload(new Date(), broken)).not.toThrow();
    expect(downloadsToday(new Date(), null)).toBe(0);
    const garbled = memoryStore();
    garbled.map.set(DOWNLOAD_COUNT_KEY, "{not json");
    expect(downloadsToday(new Date(), garbled)).toBe(0);
  });
});
