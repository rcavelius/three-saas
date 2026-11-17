import { describe, expect, it } from "vitest";
import { heroSpecimen } from "./hero-specimen";

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
});
