import { describe, expect, it } from "vitest";
import { TOOLS, toolExample } from "./tools";

describe("tool landing pages", () => {
  it("have unique slugs and search-sized titles and descriptions", () => {
    expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.title.length).toBeLessThanOrEqual(75);
      expect(t.description.length).toBeGreaterThan(80);
      expect(t.description.length).toBeLessThanOrEqual(170);
    }
  });

  // The examples are computed by the engine; these pin what each page promises.
  const ex = (slug: string) => toolExample(TOOLS.find((t) => t.slug === slug)!);

  it("remove duplicates drops the repeated row", () => {
    expect(ex("remove-duplicates-csv").after.rows).toEqual([
      ["ann@example.com", "Ann Lee", "Pro"],
      ["sam@example.com", "Sam Park", "Free"],
    ]);
  });

  it("remove blank rows drops empty and whitespace-only rows", () => {
    expect(ex("remove-blank-rows-csv").after.rows).toEqual([
      ["Maria Lopez", "1234.50"],
      ["Ethan Clark", "-45.00"],
    ]);
  });

  it("trim cleans doubled, edge and invisible spaces", () => {
    expect(ex("trim-spaces-csv").after.rows).toEqual([
      ["Maria Lopez", "New York"],
      ["Ethan Clark", "Austin"],
    ]);
  });

  it("dates come out as YYYY-MM-DD", () => {
    expect(ex("fix-dates-csv").after.rows.map((r) => r[1])).toEqual(["2024-01-17", "2024-02-03", "2024-03-09"]);
  });

  it("split turns 'Lee, Ann' into Last and First", () => {
    const r = ex("split-column-csv").after;
    expect(r.columns).toEqual(expect.arrayContaining(["Last", "First", "Email"]));
    expect(r.columns).not.toContain("Name");
    const at = (row: string[], col: string) => row[r.columns.indexOf(col)];
    expect(r.rows.map((row) => [at(row, "Last"), at(row, "First")])).toEqual([
      ["Lee", "Ann"],
      ["Park", "Sam"],
    ]);
  });

  it("combine joins First + Last and skips the empty part", () => {
    const r = ex("combine-columns-csv").after;
    const i = r.columns.indexOf("Full name");
    expect(r.rows.map((row) => row[i])).toEqual(["Ann Lee", "Sam"]);
    expect(r.columns).not.toContain("First");
  });

  it("find & replace blanks whole-cell N/A in any case only", () => {
    expect(ex("find-replace-csv").after.rows.map((r) => r[1])).toEqual(["", "shipped", ""]);
  });

  it("drop columns leaves only Name and Email", () => {
    expect(ex("remove-columns-csv").after.columns).toEqual(["Name", "Email"]);
  });

  it("numbers lose symbols and separators, parentheses become negatives", () => {
    expect(ex("clean-numbers-csv").after.rows.map((r) => r[1])).toEqual(["1234.50", "-45.00", "7.00"]);
  });
});
