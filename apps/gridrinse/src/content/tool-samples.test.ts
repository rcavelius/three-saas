import { describe, expect, it } from "vitest";
import { GET } from "@/app/samples/[file]/route";
import { mergeTables } from "@/lib/engine/merge";
import { parseCsv, parseWorkbook } from "@/lib/engine/parse";
import { runPipeline } from "@/lib/engine/pipeline";
import { defaultSteps, withToolSteps } from "@/lib/steps";
import { sampleFileIndex, toolSample } from "./tool-samples";
import { TOOLS, getTool } from "./tools";

/** What the cleaner does when the sample is loaded on the tool's page: default steps + the page's own steps. */
function cleanSample(slug: string) {
  const s = toolSample(getTool(slug)!);
  const tables = s.files.map((f) => parseCsv(f.csv).table);
  const input = tables.length > 1 ? mergeTables(tables.map((table, i) => ({ name: s.files[i]!.name, table })), { looseMatch: true, sourceColumn: "source_file" }).table : tables[0]!;
  return { input, result: runPipeline(input, withToolSteps(defaultSteps([]), s.steps)) };
}

describe("tool page samples", () => {
  it("every tool page has at least one sample file, with a unique, safe file name", () => {
    const names = TOOLS.flatMap((t) => toolSample(t).files.map((f) => f.name));
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z0-9-]+\.csv$/);
    for (const t of TOOLS) expect(toolSample(t).files.length).toBeGreaterThan(0);
  });

  it("every sample really is messy: the cleaner changes or removes something in it", () => {
    for (const t of TOOLS) {
      const { input, result } = cleanSample(t.slug);
      const changedHeaders = result.table.columns.join("|") !== input.columns.join("|");
      expect(result.changedCount > 0 || result.removed.length > 0 || changedHeaders, t.slug).toBe(true);
    }
  });

  it("the page's own step does its job on the sample", () => {
    const split = cleanSample("split-column-csv").result.table;
    expect(split.columns).toEqual(expect.arrayContaining(["Last", "First"]));
    expect(split.rows.map((r) => r[split.columns.indexOf("First")])).toContain("Sofia");

    const merged = cleanSample("merge-csv-files").result.table;
    expect(merged.columns.slice(0, 3)).toEqual(["Month", "Customer", "Amount"]);
    expect(merged.rows).toHaveLength(7); // 4 + 4 rows, one blank row removed
    expect(merged.rows.map((r) => r[1])).toContain("Grace Kim");

    const headers = cleanSample("clean-csv-headers").result.table.columns;
    expect(headers).toEqual(["first_name", "order_id", "order_date", "column_4"]);

    const dupes = cleanSample("remove-duplicates-csv").result;
    expect(dupes.removed.length).toBeGreaterThanOrEqual(3);

    const numbers = cleanSample("clean-numbers-csv").result.table;
    for (const r of numbers.rows) expect(r[numbers.columns.indexOf("Amount")]).toMatch(/^-?\d+\.\d\d$/);
  });

  it("serves each sample as a CSV download and refuses unknown names", async () => {
    const [name, hit] = [...sampleFileIndex().entries()][0]!;
    const res = await GET(new Request(`http://x/samples/${name}`), { params: Promise.resolve({ file: name }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="${name}"`);
    expect(await res.text()).toBe(hit.csv);

    for (const bad of ["../../etc/passwd", "nope.csv", "remove-duplicates-csv-sample.xlsx"]) {
      const r = await GET(new Request(`http://x/samples/x`), { params: Promise.resolve({ file: bad }) });
      expect(r.status).toBe(404);
    }
  });

  it("offers a real .xlsx sample on the Excel to CSV page", async () => {
    const s = toolSample(getTool("excel-to-csv")!);
    expect(s.xlsx).toBe(true);
    const file = s.files[0]!.name.replace(/\.csv$/, ".xlsx");
    const res = await GET(new Request(`http://x/samples/${file}`), { params: Promise.resolve({ file }) });
    expect(res.status).toBe(200);
    const wb = parseWorkbook(new Uint8Array(await res.arrayBuffer()));
    expect(wb.table.columns[0]?.trim()).toBe("Order ID");
    expect(wb.table.rows.length).toBeGreaterThan(10);
  });
});
