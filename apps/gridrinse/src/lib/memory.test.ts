import { describe, expect, it } from "vitest";
import { ABSOLUTE_LIMITS, processingLimits } from "./limits";
import { checkBeforeParse, maxCellsFor, memoryBudget } from "./memory";

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe("memory budget", () => {
  it("uses the smaller of deviceMemory and the JS heap limit, or assumes 1 GB", () => {
    expect(memoryBudget({ deviceMemory: 8 }, { memory: { jsHeapSizeLimit: 2 * GB } })).toEqual({ bytes: 2 * GB * 0.7, source: "heapLimit" });
    expect(memoryBudget({ deviceMemory: 2 }, {})).toEqual({ bytes: 2 * GB * 0.4, source: "deviceMemory" });
    expect(memoryBudget({}, {})).toEqual({ bytes: GB, source: "default" });
  });
});

describe("checkBeforeParse", () => {
  const budget = { bytes: 800 * MB, source: "deviceMemory" as const };
  const base = { name: "big.csv", kind: "csv" as const, inUseBytes: 0, loadedFileBytes: 0, budget };

  it("allows small files", () => {
    expect(checkBeforeParse({ ...base, bytes: 5 * MB }).level).toBe("ok");
  });
  it("warns when a file would use most of the memory", () => {
    expect(checkBeforeParse({ ...base, bytes: 70 * MB }).level).toBe("warn");
  });
  it("refuses with a clear message before the tab could crash", () => {
    const v = checkBeforeParse({ ...base, bytes: 150 * MB });
    expect(v.level).toBe("refuse");
    if (v.level !== "ok") expect(v.message).toMatch(/would need about .* of memory/);
  });
  it("counts files already loaded", () => {
    expect(checkBeforeParse({ ...base, bytes: 30 * MB, inUseBytes: 700 * MB }).level).toBe("refuse");
  });
  it("applies the absolute caps even with lots of memory (Business included)", () => {
    const huge = { bytes: 64 * GB, source: "heapLimit" as const };
    expect(checkBeforeParse({ ...base, budget: huge, bytes: ABSOLUTE_LIMITS.fileBytes + 1 }).level).toBe("refuse");
    expect(checkBeforeParse({ ...base, budget: huge, bytes: 200 * MB, loadedFileBytes: 400 * MB }).level).toBe("refuse");
    expect(maxCellsFor(huge, 0, 0)).toBe(ABSOLUTE_LIMITS.cells);
    expect(maxCellsFor(huge, 0, ABSOLUTE_LIMITS.totalCells - 10)).toBe(10);
  });
});

describe("processing limits from server entitlements", () => {
  it("converts catalog units and caps unlimited/oversized plans at the absolute limits", () => {
    expect(processingLimits("pro", "Pro", { maxFileMb: 50, maxRows: 500_000, filesPerBatch: 20 })).toEqual({ planId: "pro", planName: "Pro", maxFileBytes: 50 * MB, maxRows: 500_000, maxFiles: 20 });
    const big = processingLimits("x", "X", { maxFileMb: -1, maxRows: 10_000_000, filesPerBatch: -1 });
    expect(big).toMatchObject({ maxFileBytes: ABSOLUTE_LIMITS.fileBytes, maxRows: ABSOLUTE_LIMITS.rows, maxFiles: ABSOLUTE_LIMITS.files });
  });
});
