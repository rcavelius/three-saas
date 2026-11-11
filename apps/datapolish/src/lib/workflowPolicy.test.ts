import { describe, expect, it } from "vitest";
import { makeStep } from "./engine/schema";
import { WorkflowWriteSchema, workflowProblems } from "./workflowPolicy";

describe("stored workflow policy", () => {
  it("accepts ordinary steps", () => {
    expect(workflowProblems([makeStep({ type: "trim" }), makeStep({ type: "findReplace", find: "N/A", replace: "" })])).toEqual([]);
  });
  it("rejects find or replace values over 1 KB (UTF-8 bytes, not characters)", () => {
    // find is also capped at 300 characters by the step schema (≤ 900 bytes), so it stays under 1 KB.
    expect(workflowProblems([makeStep({ type: "findReplace", find: "€".repeat(300), replace: "" })])).toEqual([]);
    expect(workflowProblems([{ ...makeStep({ type: "findReplace", find: "x", replace: "" }), find: "€".repeat(342) } as never]).join(" ")).toMatch(/1024 bytes|300/);
    expect(workflowProblems([makeStep({ type: "findReplace", find: "x", replace: "é".repeat(513) })])[0]).toMatch(/Replace text/);
    expect(workflowProblems([makeStep({ type: "findReplace", find: "x", replace: "a".repeat(1000) })])).toEqual([]);
  });
  it("rejects unknown fields such as org_id", () => {
    expect(WorkflowWriteSchema.safeParse({ name: "a", steps: [], org_id: "other" }).success).toBe(false);
  });
});
