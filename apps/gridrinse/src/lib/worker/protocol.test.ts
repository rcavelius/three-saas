import { describe, expect, it } from "vitest";
import { handleRequest } from "./protocol";

const csv = (rows: number, cols: number) =>
  new TextEncoder().encode([Array.from({ length: cols }, (_, c) => `c${c}`).join(","), ...Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => `${r}-${c}`).join(","))].join("\n"));

describe("worker parse limits (checked before the table is copied back to the page)", () => {
  it("refuses files over the plan's row limit with a clear message", () => {
    expect(() => handleRequest({ kind: "parse", name: "rows.csv", bytes: csv(11, 2), options: {}, limits: { maxRows: 10, maxCells: 1e9, planName: "Free" } })).toThrow(
      /rows\.csv has 11 rows; your plan \(Free\) handles up to 10 rows/,
    );
  });
  it("refuses files over the memory/absolute cell cap", () => {
    expect(() => handleRequest({ kind: "parse", name: "wide.csv", bytes: csv(10, 50), options: {}, limits: { maxRows: 1e6, maxCells: 100, planName: "Business" } })).toThrow(/more than this browser tab can safely clean/);
  });
  it("parses large row counts without stack overflow (no Math.max spread)", () => {
    const res = handleRequest({ kind: "parse", name: "many.csv", bytes: csv(200_000, 2), options: {}, limits: { maxRows: 500_000, maxCells: 1e7, planName: "Pro" } });
    expect((res as { table: { rows: unknown[] } }).table.rows).toHaveLength(200_000);
  });
});
