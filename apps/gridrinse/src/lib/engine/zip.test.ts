import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { batchZip, safeEntryBase, zipEntryNames, zipFileName } from "./zip";

const t = (rows: string[][]) => ({ columns: ["id", "name"], rows });

describe("zip export", () => {
  it("sanitizes entry names: no folders, reserved or control characters", () => {
    expect(safeEntryBase("../../etc/passwd.csv")).toBe("etc_passwd");
    expect(safeEntryBase("CON.csv")).toBe("file_CON");
    expect(safeEntryBase("a\u0000b:c?.xlsx")).toBe("a_b_c");
    expect(safeEntryBase(".csv")).toBe("file");
    expect(safeEntryBase("x".repeat(300) + ".csv")).toHaveLength(80);
  });

  it("deduplicates names case-insensitively", () => {
    expect(zipEntryNames(["Orders.csv", "orders.xlsx", "ORDERS.csv"], "csv")).toEqual(["Orders-clean.csv", "orders-clean (2).csv", "ORDERS-clean (3).csv"]);
  });

  it("round-trips one CSV per file", () => {
    const zip = batchZip(
      [
        { name: "a.csv", table: t([["1", "Ann"]]) },
        { name: "b.xlsx", table: t([["2", "Bo, Jr."]]) },
      ],
      "csv",
      { bom: false, lineEnding: "lf" },
    );
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(["a-clean.csv", "b-clean.csv"]);
    expect(strFromU8(files["b-clean.csv"]!)).toBe('id,name\n2,"Bo, Jr."\n');
  });

  it("uses .tsv for tab-separated output and XLSX entries open as workbooks", () => {
    expect(Object.keys(unzipSync(batchZip([{ name: "a.csv", table: t([]) }], "csv", { delimiter: "\t" })))).toEqual(["a-clean.tsv"]);
    const files = unzipSync(batchZip([{ name: "Sales Q1.csv", table: t([["7", "Zoë"]]) }], "xlsx"));
    const wb = XLSX.read(files["Sales Q1-clean.xlsx"]!, { type: "array" });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: false });
    expect(rows[1]).toEqual(["7", "Zoë"]);
  });

  it("names the archive by date", () => {
    expect(zipFileName(new Date("2026-11-11T10:00:00Z"))).toBe("gridrinse-batch-2026-11-11.zip");
  });
});
