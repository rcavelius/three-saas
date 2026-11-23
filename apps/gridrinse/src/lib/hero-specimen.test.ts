import { describe, expect, it } from "vitest";
import { explainerSpecimen, heroSpecimen } from "./hero-specimen";

describe("homepage hero example", () => {
  it("is what the real engine produces from the before rows", () => {
    const { output, removedRows, notes } = heroSpecimen();
    expect(output.columns).toEqual(["Customer", "Date", "Amount"]);
    expect(output.rows).toEqual([
      ["Maria Lopez", "2024-01-17", "1234.50"],
      ["Ethan Clark", "2024-01-15", "-45.00"],
    ]);
    expect(removedRows).toEqual([2]);
    expect(notes).toEqual(["Spaces trimmed", "Duplicate removed"]);
  });

  it("marks exactly the input cells the engine rewrote", () => {
    const { input, output, changedCells } = heroSpecimen();
    // Every date and amount in the kept rows was reformatted; the names were already clean.
    expect(changedCells).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
      [1, 2],
    ]);
    for (const [r, c] of changedCells) expect(input.rows[r]![c]).not.toBe(output.rows[r === 0 ? 0 : 1]![c]);
  });
});

describe("homepage explainer", () => {
  it("is what the real engine produces: duplicate gone, dates ISO, money plain, N/A blank, spaces trimmed", () => {
    const { output, removedRows, rowOrigins, changed } = explainerSpecimen();
    expect(output.rows).toEqual([
      ["Maria Lopez", "2024-01-17", "1234.50"],
      ["Ethan Clark", "2024-01-15", "-45.00"],
      ["Aiko Tanaka", "2024-01-18", ""],
      ["Noah Smith", "2024-01-22", "58.00"],
    ]);
    expect(removedRows).toEqual([2]);
    expect(rowOrigins).toEqual([0, 1, 3, 4]);
    // Aiko's name was already clean; every other kept cell was rewritten.
    expect(changed).not.toContain("3:0");
    expect(changed).toContain("0:0");
    expect(changed).toContain("3:2");
  });
});
