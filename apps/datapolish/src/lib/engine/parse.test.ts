import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { decodeText, detectKind, listSheets, parseCsv, parseFileBytes, parseWorkbook } from "./parse";
import { toCsv, toXlsx } from "./export";

describe("parseCsv", () => {
  it("parses a simple comma file", () => {
    const r = parseCsv("a,b\n1,2\n3,4\n");
    expect(r.table).toEqual({ columns: ["a", "b"], rows: [["1", "2"], ["3", "4"]] });
    expect(r.delimiter).toBe(",");
    expect(r.warnings).toEqual([]);
  });

  it("auto-detects semicolon and tab delimiters", () => {
    expect(parseCsv("name;amount\nAnn;1,50\nBo;2,00").table.rows).toEqual([["Ann", "1,50"], ["Bo", "2,00"]]);
    const tab = parseCsv("x\ty\n1\t2");
    expect(tab.delimiter).toBe("\t");
    expect(tab.table.columns).toEqual(["x", "y"]);
  });

  it("strips a UTF-8 BOM so the first header is clean", () => {
    const r = parseCsv("﻿id,name\n1,Zoë");
    expect(r.table.columns).toEqual(["id", "name"]);
    expect(r.table.rows[0]).toEqual(["1", "Zoë"]);
  });

  it("keeps quoted commas, quotes and newlines inside a cell", () => {
    const r = parseCsv('id,note\n1,"Hello, world"\n2,"line one\nline two"\n3,"She said ""hi"""\n');
    expect(r.table.rows).toEqual([
      ["1", "Hello, world"],
      ["2", "line one\nline two"],
      ["3", 'She said "hi"'],
    ]);
  });

  it("pads short rows and adds columns for long rows, with warnings", () => {
    const r = parseCsv("a,b,c\n1,2\n1,2,3,4\n");
    expect(r.table.columns).toEqual(["a", "b", "c", "extra_1"]);
    expect(r.table.rows).toEqual([
      ["1", "2", "", ""],
      ["1", "2", "3", "4"],
    ]);
    expect(r.raggedRows).toEqual([1, 2]);
    expect(r.warnings.join(" ")).toMatch(/2 row\(s\) had a different number of cells/);
  });

  it("keeps blank lines in the middle as blank rows without calling them ragged", () => {
    const r = parseCsv("a,b\n1,2\n\n3,4\n");
    expect(r.table.rows).toEqual([["1", "2"], ["", ""], ["3", "4"]]);
    expect(r.raggedRows).toEqual([]);
  });

  it("handles empty files", () => {
    expect(parseCsv("").table).toEqual({ columns: [], rows: [] });
    expect(parseCsv("﻿  \n").warnings).toContain("The file is empty.");
  });

  it("names blank and duplicate headers", () => {
    const r = parseCsv("name,,name\n1,2,3");
    expect(r.table.columns).toEqual(["name", "column_2", "name_2"]);
  });

  it("keeps unicode intact", () => {
    const r = parseCsv("city,emoji\nKraków,🎉\n東京,✓");
    expect(r.table.rows).toEqual([["Kraków", "🎉"], ["東京", "✓"]]);
  });

  it("supports files without a header row", () => {
    const r = parseCsv("1,2\n3,4", { hasHeader: false });
    expect(r.table.columns).toEqual(["column_1", "column_2"]);
    expect(r.table.rows.length).toBe(2);
  });
});

describe("decodeText", () => {
  it("decodes UTF-8 and strips BOM", () => {
    const bytes = new TextEncoder().encode("﻿a,b");
    expect(decodeText(bytes)).toEqual({ text: "a,b", encoding: "utf-8" });
  });
  it("falls back to Windows-1252 for invalid UTF-8", () => {
    const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in cp1252
    expect(decodeText(bytes)).toEqual({ text: "café", encoding: "windows-1252" });
  });
});

describe("detectKind", () => {
  it("classifies by extension", () => {
    expect(detectKind("a.CSV")).toBe("csv");
    expect(detectKind("a.tsv")).toBe("csv");
    expect(detectKind("a.xlsx")).toBe("workbook");
    expect(detectKind("a.xls")).toBe("workbook");
    expect(detectKind("a.pdf")).toBe("unsupported");
    expect(() => parseFileBytes("a.pdf", new Uint8Array())).toThrow(/Unsupported/);
  });
});

function workbookBytes(): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Name", "Joined", "Total", "Formula"],
    ["Ann", new Date(Date.UTC(2024, 0, 5)), 1234.5, null],
    ["Bo", new Date(Date.UTC(2023, 11, 31)), 10, null],
  ]);
  // A date cell with an explicit display format, and a formula with a cached value.
  ws["B2"] = { t: "n", v: 45296, z: "m/d/yy" };
  ws["B3"] = { t: "n", v: 45291, z: "m/d/yy" };
  ws["D2"] = { t: "n", v: 2469, f: "C2*2" };
  ws["D3"] = { t: "n", v: 20, f: "C3*2" };
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["only"], ["x"]]), "Second");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe("parseWorkbook", () => {
  it("lists sheets and reads the first by default", () => {
    const bytes = workbookBytes();
    expect(listSheets(bytes)).toEqual(["Orders", "Second"]);
    const r = parseWorkbook(bytes);
    expect(r.sheet).toBe("Orders");
    expect(r.table.columns).toEqual(["Name", "Joined", "Total", "Formula"]);
  });

  it("reads dates as displayed text or as ISO", () => {
    const bytes = workbookBytes();
    expect(parseWorkbook(bytes, { dateMode: "display" }).table.rows[0]![1]).toBe("1/5/24");
    expect(parseWorkbook(bytes, { dateMode: "iso" }).table.rows.map((r) => r[1])).toEqual(["2024-01-05", "2023-12-31"]);
  });

  it("reads formulas as their cached values and says so", () => {
    const r = parseWorkbook(workbookBytes());
    expect(r.table.rows.map((row) => row[3])).toEqual(["2469", "20"]);
    expect(r.warnings.join(" ")).toMatch(/2 formula cell/);
  });

  it("chooses a named sheet", () => {
    const r = parseWorkbook(workbookBytes(), { sheet: "Second" });
    expect(r.table).toEqual({ columns: ["only"], rows: [["x"]] });
  });

  it("round-trips a table through XLSX export", () => {
    const table = { columns: ["id", "zip", "amount", "note"], rows: [["1", "02134", "1234.50", "Ünïcödé, \"quoted\""], ["2", "", "-5", "line\nbreak"]] };
    const bytes = toXlsx([{ name: "Cleaned", table }]);
    const back = parseWorkbook(bytes);
    expect(back.sheet).toBe("Cleaned");
    expect(back.table.columns).toEqual(table.columns);
    // zip keeps its leading zero (stored as text); amounts became numbers and display as Excel shows them
    expect(back.table.rows[0]![1]).toBe("02134");
    expect(back.table.rows[0]![3]).toBe(table.rows[0]![3]);
    expect(back.table.rows[1]![2]).toBe("-5");
    expect(back.table.rows[1]![3]).toBe("line\nbreak");
  });
});

describe("toCsv", () => {
  it("quotes only when needed and round-trips through the parser", () => {
    const table = { columns: ["a", "b"], rows: [["x,y", 'say "hi"'], ["multi\nline", " padded "], ["", "plain"]] };
    const csv = toCsv(table);
    expect(csv).toBe('a,b\r\n"x,y","say ""hi"""\r\n"multi\nline"," padded "\r\n,plain\r\n');
    expect(parseCsv(csv).table).toEqual(table);
  });

  it("supports BOM, LF and other delimiters", () => {
    const t = { columns: ["a"], rows: [["1"]] };
    expect(toCsv(t, { bom: true, lineEnding: "lf" })).toBe("﻿a\n1\n");
    expect(toCsv({ columns: ["a", "b"], rows: [["1;2", "3"]] }, { delimiter: ";" })).toBe('a;b\r\n"1;2";3\r\n');
  });

  it("can guard formula-like cells without touching negative numbers", () => {
    const t = { columns: ["v"], rows: [["=SUM(A1)"], ["-5"], ["@cmd"]] };
    expect(toCsv(t, { guardFormulas: true, lineEnding: "lf" })).toBe("v\n'=SUM(A1)\n-5\n'@cmd\n");
  });
});
