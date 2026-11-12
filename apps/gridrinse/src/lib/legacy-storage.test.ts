import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEvent } from "./analytics";
import { parseWorkflow } from "./engine/schema";
import { loadSavedWorkflows, storeWorkflows } from "./workflowStore";

/** Data written under the product's former name must keep working after the rename. */
const LEGACY_PREFIX = ["data", "polish"].join("");

function fakeStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pre-rename browser data", () => {
  const legacyWorkflow = { app: LEGACY_PREFIX, version: 1, name: "Old one", steps: [{ type: "formatDates" }] };

  it("accepts workflow files exported with the old app id and normalises them", () => {
    const res = parseWorkflow(JSON.stringify(legacyWorkflow));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.workflow.app).toBe("gridrinse");
    expect(parseWorkflow({ ...legacyWorkflow, app: "someone-else" }).ok).toBe(false);
  });

  it("loads saved workflows from the old localStorage key when the new one is empty", () => {
    const s = fakeStorage({ [`${LEGACY_PREFIX}.workflows.v1`]: JSON.stringify([legacyWorkflow]) });
    vi.stubGlobal("window", { localStorage: s.localStorage });
    const { workflows, available } = loadSavedWorkflows();
    expect(available).toBe(true);
    expect(workflows.map((w) => w.name)).toEqual(["Old one"]);
    expect(storeWorkflows(workflows)).toBe(true);
    expect(s.map.has("gridrinse.workflows.v1")).toBe(true);
  });

  it("keeps the anonymous analytics id stored under the old key", () => {
    const s = fakeStorage({ [`${LEGACY_PREFIX}.anon.v1`]: "abcdef0123456789" });
    vi.stubGlobal("window", { localStorage: s.localStorage });
    expect(buildEvent("pageview", {}, "/").anonymousId).toBe("abcdef0123456789");
    expect(s.map.get("gridrinse.anon.v1")).toBe("abcdef0123456789");
  });
});
