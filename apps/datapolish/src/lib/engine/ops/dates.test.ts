import { describe, expect, it } from "vitest";
import { analyzeDateColumn, excelSerialToDate, formatDate, formatDates, parseDateCell, type DateOptions } from "./dates";

const opts = (o: Partial<DateOptions> = {}): DateOptions => ({
  columns: null,
  order: "auto",
  orderByColumn: {},
  outputFormat: "YYYY-MM-DD",
  excelSerials: false,
  keepTime: true,
  twoDigitYearPivot: 50,
  ...o,
});

describe("parseDateCell", () => {
  it.each([
    ["2024-01-05", { y: 2024, m: 1, d: 5 }],
    ["2024/1/5", { y: 2024, m: 1, d: 5 }],
    ["Jan 5, 2024", { y: 2024, m: 1, d: 5 }],
    ["January 5th 2024", { y: 2024, m: 1, d: 5 }],
    ["5 Jan 2024", { y: 2024, m: 1, d: 5 }],
    ["05-Jan-24", { y: 2024, m: 1, d: 5 }],
    ["Fri, Jan 5, 2024", { y: 2024, m: 1, d: 5 }],
    ["Sept 9 2023", { y: 2023, m: 9, d: 9 }],
    ["05.01.2024", { y: 2024, m: 1, d: 5 }],
    ["13/01/2024", { y: 2024, m: 1, d: 13 }],
    ["1/13/2024", { y: 2024, m: 1, d: 13 }],
    ["07/07/2024", { y: 2024, m: 7, d: 7 }],
  ])("parses %s", (input, expected) => {
    expect(parseDateCell(input)).toEqual({ kind: "date", date: expected });
  });

  it("keeps the time text verbatim", () => {
    expect(parseDateCell("2024-01-05T10:30:00Z")).toEqual({ kind: "date", date: { y: 2024, m: 1, d: 5, time: "10:30:00Z" } });
    expect(parseDateCell("2024-01-05 9:05 pm")).toEqual({ kind: "date", date: { y: 2024, m: 1, d: 5, time: "9:05 pm" } });
  });

  it("returns numeric (unresolved) for dates valid either way", () => {
    expect(parseDateCell("03/04/2024")).toEqual({ kind: "numeric", a: 3, b: 4, y: 2024 });
  });

  it("rejects impossible or non-dates", () => {
    for (const v of ["2024-02-30", "13/13/2024", "hello", "12345", "Foo 5, 2024", "2023-02-29", "", "1.5", "2024-01-05 lunch"]) {
      expect(parseDateCell(v), v).toBeNull();
    }
    expect(parseDateCell("2024-02-29")).not.toBeNull();
  });

  it("expands two-digit years with the pivot", () => {
    expect(parseDateCell("13/01/49")).toEqual({ kind: "date", date: { y: 2049, m: 1, d: 13 } });
    expect(parseDateCell("13/01/50")).toEqual({ kind: "date", date: { y: 1950, m: 1, d: 13 } });
  });
});

describe("excelSerialToDate", () => {
  it("converts serials, including the 1900 leap-year bug and fractions", () => {
    expect(excelSerialToDate(45296)).toEqual({ y: 2024, m: 1, d: 5 });
    expect(excelSerialToDate(1)).toEqual({ y: 1900, m: 1, d: 1 });
    expect(excelSerialToDate(59)).toEqual({ y: 1900, m: 2, d: 28 });
    expect(excelSerialToDate(61)).toEqual({ y: 1900, m: 3, d: 1 });
    expect(excelSerialToDate(45296.5)).toEqual({ y: 2024, m: 1, d: 5, time: "12:00:00" });
    expect(excelSerialToDate(0)).toBeNull();
  });
});

describe("formatDate", () => {
  it("supports tokens", () => {
    const d = { y: 2024, m: 3, d: 7 };
    expect(formatDate(d, "YYYY-MM-DD")).toBe("2024-03-07");
    expect(formatDate(d, "DD/MM/YYYY")).toBe("07/03/2024");
    expect(formatDate(d, "M/D/YY")).toBe("3/7/24");
    expect(formatDate(d, "D MMM YYYY")).toBe("7 Mar 2024");
    expect(formatDate(d, "MMMM D, YYYY")).toBe("March 7, 2024");
  });
});

describe("analyzeDateColumn", () => {
  it("infers the order from unambiguous values", () => {
    const a = analyzeDateColumn(["03/04/2024", "25/04/2024", ""]);
    expect(a.impliedOrder).toBe("DMY");
    expect(a.isDateColumn).toBe(true);
    expect(analyzeDateColumn(["03/04/2024", "04/25/2024"]).impliedOrder).toBe("MDY");
  });
  it("flags conflicts and pure ambiguity", () => {
    const c = analyzeDateColumn(["13/04/2024", "04/25/2024"]);
    expect(c.conflict).toBe(true);
    expect(c.impliedOrder).toBeNull();
    const amb = analyzeDateColumn(["03/04/2024", "05/06/2024"]);
    expect(amb.ambiguous).toBe(2);
    expect(amb.impliedOrder).toBeNull();
  });
  it("does not call mostly-text columns dates", () => {
    expect(analyzeDateColumn(["hello", "2024-01-01", "x", "y"]).isDateColumn).toBe(false);
  });
});

describe("formatDates", () => {
  const table = {
    columns: ["name", "order_date", "signup", "note"],
    rows: [
      ["Ann", "2024-01-05", "03/04/2023", "x"],
      ["Bo", "1/15/2024", "05/06/2023", "y"],
      ["Cy", "Jan 17, 2024", "11/02/2023", "z"],
      ["Di", "01/18/2024 14:00", "", "w"],
    ],
  };

  it("auto-detects date columns and converts those whose order is known", () => {
    const r = formatDates(table, opts());
    expect(r.table.rows.map((x) => x[1])).toEqual(["2024-01-05", "2024-01-15", "2024-01-17", "2024-01-18 14:00"]);
    expect(r.report.details?.dateColumns).toEqual(["order_date", "signup"]);
  });

  it("does NOT guess an ambiguous column; it flags it and leaves it unchanged", () => {
    const r = formatDates(table, opts());
    expect(r.table.rows.map((x) => x[2])).toEqual(["03/04/2023", "05/06/2023", "11/02/2023", ""]);
    expect(r.report.details?.needsChoice).toEqual([{ column: "signup", reason: "ambiguous", examples: ["03/04/2023", "05/06/2023", "11/02/2023"] }]);
    expect(r.report.warnings.join(" ")).toMatch(/choose DMY or MDY/);
  });

  it("converts the ambiguous column once the user chooses an order", () => {
    const dmy = formatDates(table, opts({ orderByColumn: { signup: "DMY" } }));
    expect(dmy.table.rows.map((x) => x[2])).toEqual(["2023-04-03", "2023-06-05", "2023-02-11", ""]);
    const mdy = formatDates(table, opts({ orderByColumn: { signup: "MDY" } }));
    expect(mdy.table.rows.map((x) => x[2])).toEqual(["2023-03-04", "2023-05-06", "2023-11-02", ""]);
  });

  it("flags a column that mixes day-first and month-first values", () => {
    const t = { columns: ["d"], rows: [["13/04/2024"], ["04/25/2024"]] };
    const r = formatDates(t, opts());
    expect(r.report.cellsChanged).toBe(0);
    expect((r.report.details?.needsChoice as { reason: string }[])[0]!.reason).toBe("conflict");
    // choosing MDY converts what fits and leaves the impossible value alone with a warning
    const m = formatDates(t, opts({ orderByColumn: { d: "MDY" } }));
    expect(m.table.rows).toEqual([["13/04/2024"], ["2024-04-25"]]);
    expect(m.report.warnings.join(" ")).toMatch(/could not be read/);
  });

  it("converts Excel serials only in explicitly chosen columns", () => {
    const t = { columns: ["when", "qty"], rows: [["45296"], ["45297.25"]].map((r) => [r[0]!, "3"]) };
    expect(formatDates(t, opts()).report.cellsChanged).toBe(0);
    const r = formatDates(t, opts({ columns: ["when"], excelSerials: true, outputFormat: "DD.MM.YYYY" }));
    expect(r.table.rows.map((x) => x[0])).toEqual(["05.01.2024", "06.01.2024 06:00:00"]);
  });

  it("can drop times and use any output format", () => {
    const r = formatDates(table, opts({ keepTime: false, outputFormat: "D MMM YYYY", columns: ["order_date"] }));
    expect(r.table.rows.map((x) => x[1])).toEqual(["5 Jan 2024", "15 Jan 2024", "17 Jan 2024", "18 Jan 2024"]);
  });
});
