import { describe, expect, it } from "vitest";
import { normalizeHeaders, removeBlankRows, removeDuplicates, styleHeader, trimWhitespace } from "./basic";
import type { Table } from "../types";

const deepFreeze = (t: Table): Table => {
  t.rows.forEach((r) => Object.freeze(r));
  Object.freeze(t.rows);
  Object.freeze(t.columns);
  return Object.freeze(t);
};

describe("trimWhitespace", () => {
  it("trims, collapses runs and removes invisible characters without mutating input", () => {
    const input = deepFreeze({
      columns: ["name", "city"],
      rows: [
        ["  Ann   Lee ", "Oslo"],
        ["Bo Ek", "Lund​"],
        ["ok", "ok"],
      ],
    });
    const r = trimWhitespace(input, { collapseInternal: true, removeInvisible: true });
    expect(r.table.rows).toEqual([
      ["Ann Lee", "Oslo"],
      ["Bo Ek", "Lund"],
      ["ok", "ok"],
    ]);
    expect(r.report.cellsChanged).toBe(3);
    expect(r.changed).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(input.rows[0]![0]).toBe("  Ann   Lee ");
  });

  it("can keep internal spacing and be scoped to columns", () => {
    const t = { columns: ["a", "b"], rows: [[" x  y ", " z "]] };
    const r = trimWhitespace(t, { collapseInternal: false, removeInvisible: true, columns: ["a"] });
    expect(r.table.rows[0]).toEqual(["x  y", " z "]);
    const missing = trimWhitespace(t, { collapseInternal: true, removeInvisible: true, columns: ["nope"] });
    expect(missing.report.warnings[0]).toMatch(/not found/);
  });
});

describe("removeBlankRows", () => {
  it("removes rows that are empty after trimming, including invisible-only rows", () => {
    const t = deepFreeze({ columns: ["a", "b"], rows: [["1", "2"], ["", ""], ["  ", "​"], ["", "x"]] });
    const r = removeBlankRows(t);
    expect(r.table.rows).toEqual([["1", "2"], ["", "x"]]);
    expect(r.report.rowsRemoved).toBe(2);
    expect(r.removedRows).toEqual([1, 2]);
  });
});

describe("removeDuplicates", () => {
  const t: Table = {
    columns: ["id", "email", "amount"],
    rows: [
      ["1", "a@x.com", "10"],
      ["2", "b@x.com", "20"],
      ["1", "a@x.com", "10"],
      ["3", "A@X.COM ", "30"],
      ["4", "b@x.com", "40"],
    ],
  };

  it("removes exact duplicate rows keeping the first", () => {
    const r = removeDuplicates(t, { keys: [], ignoreCase: false, ignoreWhitespace: false, keep: "first" });
    expect(r.removedRows).toEqual([2]);
    expect(r.report.details?.duplicateOf).toEqual({ 2: 0 });
  });

  it("dedupes by key column, case- and space-insensitive, keep first", () => {
    const r = removeDuplicates(t, { keys: ["email"], ignoreCase: true, ignoreWhitespace: true, keep: "first" });
    expect(r.table.rows.map((x) => x[0])).toEqual(["1", "2"]);
    expect(r.removedRows).toEqual([2, 3, 4]);
  });

  it("dedupes by key column keeping the last occurrence in its position", () => {
    const r = removeDuplicates(t, { keys: ["email"], ignoreCase: true, ignoreWhitespace: true, keep: "last" });
    expect(r.table.rows.map((x) => x[0])).toEqual(["3", "4"]);
    expect(r.removedRows).toEqual([0, 1, 2]);
    expect(r.report.details?.duplicateOf).toEqual({ 0: 3, 1: 4, 2: 3 });
  });

  it("is case-sensitive unless asked", () => {
    const r = removeDuplicates(t, { keys: ["email"], ignoreCase: false, ignoreWhitespace: true, keep: "first" });
    expect(r.removedRows).toEqual([2, 4]);
  });

  it("does nothing (with a warning) if no key column exists", () => {
    const r = removeDuplicates(t, { keys: ["missing"], ignoreCase: false, ignoreWhitespace: false, keep: "first" });
    expect(r.table.rows.length).toBe(5);
    expect(r.report.warnings.length).toBe(2);
  });
});

describe("normalizeHeaders", () => {
  it("styles headers", () => {
    expect(styleHeader("  Customer  Name ", "snake")).toBe("customer_name");
    expect(styleHeader("orderID", "snake")).toBe("order_id");
    expect(styleHeader("e-mail address", "title")).toBe("E Mail Address");
    expect(styleHeader("customer_ID", "title")).toBe("Customer ID");
    expect(styleHeader("TOTAL Amount", "lower")).toBe("total amount");
    expect(styleHeader("Straße Nr.", "snake")).toBe("straße_nr");
  });

  it("dedupes clashes with _2 and names blank headers", () => {
    const t = { columns: ["Name", "name ", "", "Ünit Price"], rows: [["a", "b", "c", "d"]] };
    const r = normalizeHeaders(t, { style: "snake" });
    expect(r.table.columns).toEqual(["name", "name_2", "column_3", "ünit_price"]);
    expect(r.table.rows).toEqual(t.rows);
    expect(r.report.cellsChanged).toBe(0);
  });
});
