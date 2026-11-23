// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);
import { RinseMeter } from "./RinseMeter";

describe("RinseMeter", () => {
  it("states what the run fixed, as a status message", () => {
    render(<RinseMeter fixed={1234} removed={3} />);
    expect(screen.getByRole("status").textContent).toContain("1,234 cells fixed · 3 rows removed");
    expect(screen.getByText("Rinsed!")).toBeTruthy();
  });

  it("does not celebrate a file that needed nothing", () => {
    render(<RinseMeter fixed={0} removed={0} />);
    expect(screen.getByText("Clean")).toBeTruthy();
  });
});
