import { describe, expect, it } from "vitest";
import { isCellChanged, runPipeline } from "./pipeline";
import { makeStep, makeWorkflow, parseWorkflow, type Step } from "./schema";
import { mergeTables } from "./merge";
import { parseCsv } from "./parse";
import { SAMPLE_CSV } from "../sample";
import { suggestNumberColumns } from "./ops/numbers";

describe("runPipeline", () => {
  const input = {
    columns: [" Name ", "Email", "Amount"],
    rows: [
      ["  Ann ", "a@x.com", "$1,000.00"],
      ["", "", ""],
      ["Bo", "b@x.com", "$5"],
      ["Ann", "a@x.com", "$1,000.00"],
    ],
  };
  const steps: Step[] = [
    makeStep({ type: "trim" }),
    makeStep({ type: "removeBlankRows" }),
    makeStep({ type: "dedupe" }),
    makeStep({ type: "normalizeHeaders", style: "snake" }),
    makeStep({ type: "formatNumbers", columns: ["amount"], decimals: 2 }),
  ];

  it("runs steps in order and tracks provenance", () => {
    const r = runPipeline(input, steps);
    expect(r.table).toEqual({ columns: ["name", "email", "amount"], rows: [["Ann", "a@x.com", "1000.00"], ["Bo", "b@x.com", "5.00"]] });
    expect(r.rowOrigins).toEqual([0, 2]);
    expect(r.columnOrigins).toEqual([0, 1, 2]);
    expect(r.removed.map((x) => [x.originalIndex, x.stepType])).toEqual([
      [1, "removeBlankRows"],
      [3, "dedupe"],
    ]);
    expect(isCellChanged(r, 0, 0)).toBe(true); // "  Ann " trimmed
    expect(isCellChanged(r, 0, 1)).toBe(false);
    expect(isCellChanged(r, 1, 2)).toBe(true);
    expect(r.changedCount).toBe(3);
    expect(r.steps.map((s) => s.report.rowsRemoved)).toEqual([0, 1, 1, 0, 0]);
    // the input is untouched
    expect(input.rows[0]![0]).toBe("  Ann ");
  });

  it("skips disabled steps and reports failing steps without stopping", () => {
    const r = runPipeline(input, [
      { ...steps[0]!, enabled: false },
      makeStep({ type: "splitColumn", column: "missing", separator: ",", into: ["a", "b"] }),
      makeStep({ type: "removeBlankRows" }),
    ]);
    expect(r.steps[0]!.skipped).toBe(true);
    expect(r.steps[1]!.error).toMatch(/not found/);
    expect(r.table.rows.length).toBe(3);
  });

  it("tracks new columns created by merges", () => {
    const r = runPipeline(input, [makeStep({ type: "mergeColumns", columns: [" Name ", "Email"], separator: " <", into: "contact" })]);
    expect(r.table.columns).toEqual(["contact", "Amount"]);
    expect(r.columnOrigins).toEqual([null, 2]);
    expect(isCellChanged(r, 0, 0)).toBe(true);
  });

  it("cleans the bundled sample file end to end", () => {
    const parsed = parseCsv(SAMPLE_CSV);
    const amountCols = suggestNumberColumns(parsed.table);
    expect(amountCols).toContain("Amount");
    const r = runPipeline(parsed.table, [
      makeStep({ type: "trim" }),
      makeStep({ type: "removeBlankRows" }),
      makeStep({ type: "normalizeHeaders", style: "keep" }),
      makeStep({ type: "dedupe", keys: [] }),
      makeStep({ type: "dedupe", keys: ["Email"], ignoreCase: true }),
      makeStep({ type: "formatDates" }),
      makeStep({ type: "formatNumbers", columns: ["Amount"], decimals: 2 }),
    ]);
    expect(r.table.columns[0]).toBe("Order ID");
    // 20 data rows - 3 blank - 1 exact duplicate - 1 same email in different case
    expect(r.table.rows.length).toBe(15);
    const orderDates = r.table.rows.map((row) => row[3]);
    expect(orderDates.every((d) => /^2024-\d\d-\d\d$/.test(d!))).toBe(true);
    // the signup column is ambiguous and must be flagged, not guessed
    const dateRun = r.steps[5]!;
    expect((dateRun.report.details?.needsChoice as { column: string }[]).map((n) => n.column)).toEqual(["Signup Date"]);
    expect(r.table.rows[0]![4]).toBe("03/04/2023");
    expect(r.table.rows.map((row) => row[5])).toContain("-45.00");
    expect(r.table.rows.map((row) => row[5])).toContain("12500.00");
    expect(r.table.rows.find((row) => row[0] === "10238")![1]).toBe("Ethan Clark");
  });
});

describe("workflow JSON", () => {
  it("round-trips through JSON and fills defaults", () => {
    const wf = makeWorkflow("Weekly orders", [makeStep({ type: "trim" }), makeStep({ type: "dedupe", keys: ["Email"], keep: "last" })]);
    const back = parseWorkflow(JSON.stringify(wf));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.workflow).toEqual(wf);
    const minimal = parseWorkflow({ app: "gridrinse", version: 1, name: "m", steps: [{ type: "formatDates" }] });
    expect(minimal.ok && minimal.workflow.steps[0]).toMatchObject({ type: "formatDates", order: "auto", outputFormat: "YYYY-MM-DD", enabled: true });
  });

  it("rejects invalid, foreign or future workflows with readable errors", () => {
    expect(parseWorkflow("{not json")).toEqual({ ok: false, errors: ["The file is not valid JSON."] });
    const bad = parseWorkflow({ app: "gridrinse", version: 1, name: "x", steps: [{ type: "explode" }] });
    expect(bad.ok).toBe(false);
    const wrongApp = parseWorkflow({ app: "other", version: 1, name: "x", steps: [] });
    expect(wrongApp.ok).toBe(false);
    const future = parseWorkflow({ app: "gridrinse", version: 2, name: "x", steps: [] });
    expect(future.ok === false && future.errors[0]).toMatch(/newer version/);
    const badFormat = parseWorkflow({ app: "gridrinse", version: 1, name: "x", steps: [{ type: "formatDates", outputFormat: "<script>" }] });
    expect(badFormat.ok).toBe(false);
  });
});

describe("mergeTables", () => {
  const a = { name: "jan.csv", table: { columns: ["Email", "Name", "Total"], rows: [["a@x", "Ann", "1"]] } };
  const b = { name: "feb.csv", table: { columns: ["e-mail", "Full Name", "Total", "Region"], rows: [["b@x", "Bo", "2", "EU"]] } };

  it("stacks rows, unions columns and records missing ones", () => {
    const r = mergeTables([a, b], { looseMatch: false, sourceColumn: null });
    expect(r.table.columns).toEqual(["Email", "Name", "Total", "e-mail", "Full Name", "Region"]);
    expect(r.table.rows).toEqual([
      ["a@x", "Ann", "1", "", "", ""],
      ["", "", "2", "b@x", "Bo", "EU"],
    ]);
    expect(r.report.missing.Region).toEqual(["jan.csv"]);
  });

  it("aligns loosely matching headers and explicit mappings, with a source column", () => {
    const r = mergeTables([a, b], { looseMatch: true, sourceColumn: "source_file", mappings: [undefined, { "Full Name": "Name", Region: "" }] });
    expect(r.table.columns).toEqual(["Email", "Name", "Total", "source_file"]);
    expect(r.table.rows).toEqual([
      ["a@x", "Ann", "1", "jan.csv"],
      ["b@x", "Bo", "2", "feb.csv"],
    ]);
    expect(r.report.placements[1]).toEqual({ "e-mail": "Email", "Full Name": "Name", Total: "Total", Region: "" });
  });

  it("keeps blank rows blank (no source name) so they can still be removed", () => {
    const c = { name: "c.csv", table: { columns: ["Email"], rows: [["x@y"], ["  "]] } };
    const r = mergeTables([a, c], { looseMatch: true, sourceColumn: "source_file" });
    expect(r.table.rows[2]).toEqual(["  ", "", "", ""]);
    expect(runPipeline(r.table, [makeStep({ type: "removeBlankRows" })]).table.rows.length).toBe(2);
  });

  it("does not let two columns overwrite each other", () => {
    const r = mergeTables([a, b], { looseMatch: true, sourceColumn: null, mappings: [undefined, { "Full Name": "Email" }] });
    expect(r.report.warnings.join(" ")).toMatch(/already fills/);
    expect(r.table.rows[1]![0]).toBe("b@x");
  });
});
