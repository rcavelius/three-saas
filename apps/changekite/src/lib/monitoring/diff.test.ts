import { describe, expect, it } from "vitest";
import { changeSetKey, detectChanges, fingerprintIssue, stableMessage, type ScanFacts } from "./diff";

const base: ScanFacts = {
  reachable: true,
  homeStatus: 200,
  score: 90,
  certDaysRemaining: 80,
  certProblem: false,
  robotsBlocksAll: false,
  critical: 0,
  warning: 2,
};
const issue = (fp: string, ruleId = "title-missing", severity: "critical" | "warning" = "critical") => ({
  fp,
  ruleId,
  check: "titles",
  severity,
  message: `m ${fp}`,
  page: "https://a.example/",
  openedAt: "2026-01-01T00:00:00.000Z",
});

describe("fingerprints", () => {
  it("mask volatile numbers but keep URLs", () => {
    expect(stableMessage("The TLS certificate expires in 13 days")).toBe("The TLS certificate expires in # days");
    expect(stableMessage("Broken internal link (404): https://a.example/post/12")).toBe("Broken internal link (#): https://a.example/post/12");
    const a = fingerprintIssue({ id: "tls-expiring-soon", page: "https://a.example", message: "expires in 13 days" });
    const b = fingerprintIssue({ id: "tls-expiring-soon", page: "https://a.example", message: "expires in 12 days" });
    expect(a).toBe(b);
    const c = fingerprintIssue({ id: "internal-link-broken", page: null, message: "Broken internal link (404): https://a.example/1" });
    const d = fingerprintIssue({ id: "internal-link-broken", page: null, message: "Broken internal link (404): https://a.example/2" });
    expect(c).not.toBe(d);
  });
});

describe("detectChanges", () => {
  it("treats the first scan as a baseline (only 'down' is reported)", () => {
    expect(detectChanges(null, base, [issue("x")])).toEqual([]);
    expect(detectChanges(null, { ...base, reachable: false, homeStatus: null }, []).map((e) => e.kind)).toEqual(["site_down"]);
  });

  it("reports down/up transitions once", () => {
    const down = { ...base, reachable: false, homeStatus: null };
    expect(detectChanges(base, down, []).map((e) => e.kind)).toEqual(["site_down"]);
    expect(detectChanges(down, down, [])).toEqual([]);
    expect(detectChanges(down, base, []).map((e) => e.kind)).toEqual(["site_up"]);
  });

  it("reports home status changes between ok and error only", () => {
    expect(detectChanges(base, { ...base, homeStatus: 500 }, []).map((e) => e.kind)).toEqual(["home_status"]);
    expect(detectChanges(base, { ...base, homeStatus: 301 }, [])).toEqual([]);
  });

  it("separates new broken links from other new criticals; ignores warnings and tls rules", () => {
    const ev = detectChanges(base, base, [issue("a", "internal-link-broken"), issue("b"), issue("c", "tls-expiring-soon")]);
    expect(ev.map((e) => e.kind)).toEqual(["new_broken_links", "new_critical"]);
    expect(ev[1]!.issues!.map((i) => i.fp)).toEqual(["b"]);
  });

  it("cert, robots and score drop thresholds", () => {
    expect(detectChanges(base, { ...base, certProblem: true, certDaysRemaining: 10 }, []).map((e) => e.kind)).toEqual(["cert_expiring"]);
    expect(detectChanges({ ...base, certProblem: true }, { ...base, certProblem: true }, [])).toEqual([]);
    expect(detectChanges(base, { ...base, robotsBlocksAll: true }, []).map((e) => e.kind)).toEqual(["robots_blocks_all"]);
    expect(detectChanges(base, { ...base, score: 81 }, [])).toEqual([]);
    expect(detectChanges(base, { ...base, score: 80 }, []).map((e) => e.kind)).toEqual(["score_drop"]);
  });

  it("change-set keys are order independent", () => {
    expect(changeSetKey("s", "change", ["a", "b"])).toBe(changeSetKey("s", "change", ["b", "a"]));
    expect(changeSetKey("s", "change", ["a"])).not.toBe(changeSetKey("t", "change", ["a"]));
  });
});
