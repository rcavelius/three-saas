import { describe, expect, it } from "vitest";
import { formatNumbers, parseNumberCell, roundDigits, suggestNumberColumns, type NumberOptions } from "./numbers";

const opts = (o: Partial<NumberOptions> = {}): NumberOptions => ({
  columns: ["v"],
  decimalComma: false,
  decimals: null,
  percent: "keep",
  thousandsSeparator: false,
  ...o,
});

const run = (values: string[], o: Partial<NumberOptions> = {}) =>
  formatNumbers({ columns: ["v"], rows: values.map((v) => [v]) }, opts(o)).table.rows.map((r) => r[0]);

describe("parseNumberCell", () => {
  it("parses currency, grouping, signs and parentheses", () => {
    expect(parseNumberCell("$1,234.50")).toMatchObject({ negative: false, int: "1234", frac: "50", formatted: true });
    expect(parseNumberCell("(45.00)")).toMatchObject({ negative: true, int: "45", frac: "00" });
    expect(parseNumberCell("-$5")).toMatchObject({ negative: true, int: "5" });
    expect(parseNumberCell("$-5")).toMatchObject({ negative: true, int: "5" });
    expect(parseNumberCell("120.00-")).toMatchObject({ negative: true, int: "120" });
    expect(parseNumberCell("EUR 99")).toMatchObject({ int: "99" });
    expect(parseNumberCell("1 234 567")).toMatchObject({ int: "1234567" });
    expect(parseNumberCell("1'234.5")).toMatchObject({ int: "1234", frac: "5" });
    expect(parseNumberCell(".5")).toMatchObject({ int: "0", frac: "5" });
    expect(parseNumberCell("12.5%")).toMatchObject({ int: "12", frac: "5", percent: true });
  });

  it("rejects things that are not numbers or have wrong grouping", () => {
    for (const v of ["abc", "1,5", "1,23,4", "--5", "(-5)", "5 5", "$", "1.2.3"]) expect(parseNumberCell(v), v).toBeNull();
  });

  it("supports decimal comma input", () => {
    expect(parseNumberCell("1.234,50 €", true)).toMatchObject({ int: "1234", frac: "50" });
    expect(parseNumberCell("1,5", true)).toMatchObject({ int: "1", frac: "5" });
    expect(parseNumberCell("1.5", true)).toBeNull();
  });
});

describe("roundDigits", () => {
  it("rounds half away from zero on the decimal string (no float error)", () => {
    expect(roundDigits("1", "005", 2)).toEqual({ int: "1", frac: "01" });
    expect(roundDigits("9", "995", 2)).toEqual({ int: "10", frac: "00" });
    expect(roundDigits("2", "5", 0)).toEqual({ int: "3", frac: "" });
    expect(roundDigits("2", "4", 0)).toEqual({ int: "2", frac: "" });
    expect(roundDigits("7", "", 2)).toEqual({ int: "7", frac: "00" });
  });
});

describe("formatNumbers", () => {
  it("strips symbols and separators, keeping original precision", () => {
    expect(run(["$1,234.50", "(45.00)", " $89.99 ", "1050", "", "£1 005.00"])).toEqual(["1234.50", "-45.00", "89.99", "1050", "", "1005.00"]);
  });

  it("outputs fixed decimals", () => {
    expect(run(["$1,234.5", "2", "0.125", "-0.004"], { decimals: 2 })).toEqual(["1234.50", "2.00", "0.13", "0.00"]);
  });

  it("handles percent modes", () => {
    expect(run(["12.5%", "50%"], { percent: "keep" })).toEqual(["12.5%", "50%"]);
    expect(run(["12.5%", "50%"], { percent: "number" })).toEqual(["12.5", "50"]);
    expect(run(["12.5%", "50%", "3%"], { percent: "fraction" })).toEqual(["0.125", "0.5", "0.03"]);
  });

  it("parses decimal comma and can add thousands separators", () => {
    expect(run(["1.234,50", "€ 7,5"], { decimalComma: true, thousandsSeparator: true })).toEqual(["1,234.50", "7.5"]);
  });

  it("keeps long IDs exact", () => {
    expect(run(["12345678901234567890"])).toEqual(["12345678901234567890"]);
  });

  it("leaves unrecognised values and warns", () => {
    const r = formatNumbers({ columns: ["v"], rows: [["n/a"], ["1,5"]] }, opts());
    expect(r.table.rows).toEqual([["n/a"], ["1,5"]]);
    expect(r.report.warnings[0]).toMatch(/2 value\(s\).*decimal comma/);
  });

  it("warns when no columns are chosen", () => {
    expect(formatNumbers({ columns: ["v"], rows: [["$1"]] }, opts({ columns: [] })).report.warnings[0]).toMatch(/No columns/);
  });
});

describe("suggestNumberColumns", () => {
  it("suggests formatted number columns but not IDs or zip codes", () => {
    const t = {
      columns: ["id", "zip", "amount", "name", "pct"],
      rows: [
        ["1", "02134", "$1,200.00", "Ann", "5%"],
        ["2", "10001", "$15.00", "Bo", "10%"],
      ],
    };
    expect(suggestNumberColumns(t)).toEqual(["amount", "pct"]);
  });
});
