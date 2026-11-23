import { describe, expect, it } from "vitest";
import { pixelWidth } from "./PixelTitle";

describe("pixelWidth (Silkscreen Bold advances)", () => {
  it("matches the font file for the hero line", () => {
    expect(pixelWidth("CATCH EVERY HOOK")).toBeCloseTo(13.125, 3);
    expect(pixelWidth("catch every hook")).toBeCloseTo(13.125, 3);
    expect(pixelWidth("HOOK")).toBeCloseTo(3.5, 3);
  });
});
