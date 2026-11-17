import { describe, expect, it } from "vitest";
import { featureSpecimens } from "./feature-specimens";

describe("Features page demos (real engine output)", () => {
  const s = featureSpecimens();
  it("trims and collapses spaces", () => expect(s.trim.after).toBe("Maria Lopez"));
  it("keeps one copy of a duplicate row", () => {
    expect(s.dedupe.output.rows).toEqual([["Maria Lopez", "2024-01-17", "1234.50"]]);
    expect(s.dedupe.removedRows).toEqual([1]);
  });
  it("drops blank rows", () => {
    expect(s.blank.output.rows).toEqual([
      ["Maria Lopez", "1234.50"],
      ["Ethan Clark", "-45.00"],
    ]);
    expect(s.blank.removedRows).toEqual([1, 3]);
  });
  it("standardizes dates and numbers", () => {
    expect(s.date.after).toBe("2024-01-17");
    expect(s.number.after).toBe("1234.50");
  });
  it("review example changes both cells", () => expect(s.review.output.rows).toEqual([["Maria Lopez", "1234.50"]]));
});
