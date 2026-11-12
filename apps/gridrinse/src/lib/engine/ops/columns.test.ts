import { describe, expect, it } from "vitest";
import { dropColumns, mergeColumns, renameColumns, reorderColumns, splitColumn } from "./columns";

const t = {
  columns: ["first", "last", "city", "phone"],
  rows: [
    ["Ann", "Lee", "Oslo", "555"],
    ["Bo", "", "Lund", "777"],
  ],
};

describe("column operations", () => {
  it("renames, and avoids clashes", () => {
    const r = renameColumns(t, { first: "First name", city: "phone", ghost: "x" });
    expect(r.table.columns).toEqual(["First name", "last", "phone", "phone_2"]);
    expect(r.report.warnings.length).toBe(2);
  });

  it("reorders listed columns first and reports sources", () => {
    const r = reorderColumns(t, ["city", "first"]);
    expect(r.table.columns).toEqual(["city", "first", "last", "phone"]);
    expect(r.table.rows[0]).toEqual(["Oslo", "Ann", "Lee", "555"]);
    expect(r.columnSources).toEqual([2, 0, 1, 3]);
  });

  it("drops columns", () => {
    const r = dropColumns(t, ["phone", "last"]);
    expect(r.table).toEqual({ columns: ["first", "city"], rows: [["Ann", "Oslo"], ["Bo", "Lund"]] });
    expect(r.columnSources).toEqual([0, 2]);
    expect(t.columns.length).toBe(4);
  });

  it("merges two columns with a separator, skipping empty parts", () => {
    const r = mergeColumns(t, { columns: ["first", "last"], separator: " ", into: "full_name", keepOriginals: false, skipEmpty: true });
    expect(r.table.columns).toEqual(["full_name", "city", "phone"]);
    expect(r.table.rows.map((x) => x[0])).toEqual(["Ann Lee", "Bo"]);
    expect(r.columnSources).toEqual([null, 2, 3]);
  });

  it("merges while keeping originals, placing the new column after the first source", () => {
    const r = mergeColumns(t, { columns: ["city", "phone"], separator: " / ", into: "", keepOriginals: true, skipEmpty: false });
    expect(r.table.columns).toEqual(["first", "last", "city", "city_phone", "phone"]);
    expect(r.table.rows[0]![3]).toBe("Oslo / 555");
  });

  it("refuses to merge fewer than two columns", () => {
    expect(() => mergeColumns(t, { columns: ["first"], separator: " ", into: "x", keepOriginals: false, skipEmpty: true })).toThrow();
  });

  it("splits a column, keeping overflow in the last piece", () => {
    const s = { columns: ["name", "id"], rows: [["Lee, Ann", "1"], ["Solo", "2"], ["A, B, C", "3"]] };
    const r = splitColumn(s, { column: "name", separator: ",", into: ["last", "first"], keepOriginal: false });
    expect(r.table.columns).toEqual(["last", "first", "id"]);
    expect(r.table.rows).toEqual([
      ["Lee", "Ann", "1"],
      ["Solo", "", "2"],
      ["A", "B, C", "3"],
    ]);
    expect(r.report.warnings[0]).toMatch(/1 value/);
    const keep = splitColumn(s, { column: "name", separator: ",", into: ["a", "b"], keepOriginal: true });
    expect(keep.table.columns).toEqual(["name", "a", "b", "id"]);
    expect(() => splitColumn(s, { column: "nope", separator: ",", into: ["a", "b"], keepOriginal: false })).toThrow(/not found/);
  });
});
