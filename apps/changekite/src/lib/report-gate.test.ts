import { describe, expect, it } from "vitest";
import { CHANGEKITE_CATALOG, applyPassGrants, getPass, getPlan } from "@repo/billing";
import { gateReport, hasFullReport, issueAllowance, issueKind, lockedBreakdown, lockedHeadline, topIssues } from "./report-gate";
import type { Issue, ScanReport } from "./scanner/types";
import { FREE_LIMITS } from "./scanner/scan";
import { summarizeChecks } from "./scanner/score";

const issue = (id: string, check: Issue["check"], severity: Issue["severity"], page: string): Issue => ({
  id,
  check,
  severity,
  page,
  message: `${id} on ${page}`,
  detail: `detail for ${page}`,
  howToFix: `fix ${id}`,
});

const issues: Issue[] = [
  issue("description-missing", "meta-description", "warning", "https://e.com/a"),
  issue("internal-link-broken", "internal-links", "critical", "https://e.com/b"),
  issue("title-too-long", "titles", "notice", "https://e.com/c"),
  issue("internal-link-broken", "internal-links", "critical", "https://e.com/d"),
  issue("description-missing", "meta-description", "warning", "https://e.com/e"),
  issue("internal-link-broken", "internal-links", "critical", "https://e.com/f"),
  issue("internal-link-broken", "internal-links", "critical", "https://e.com/g"),
  issue("img-alt-missing", "images", "warning", "https://e.com/h"),
];

const report: ScanReport = {
  version: 1,
  startUrl: "https://e.com/",
  finalUrl: "https://e.com/",
  origin: "https://e.com",
  startedAt: "2026-11-11T10:00:00.000Z",
  finishedAt: "2026-11-11T10:00:12.000Z",
  durationMs: 12000,
  limits: FREE_LIMITS,
  stats: { pagesCrawled: 8, pagesSkippedByRobots: 0, internalUrlsFound: 9, internalUrlsProbed: 1, externalLinksFound: 0, externalLinksChecked: 0, imagesFound: 2, pageCapReached: false, timeBudgetExhausted: false },
  score: 40,
  grade: "poor",
  counts: { critical: 4, warning: 3, notice: 1 },
  checks: summarizeChecks(issues, {}),
  issues,
  pages: [{ url: "https://e.com/", finalUrl: "https://e.com/", status: 200, depth: 0, title: "Home" }],
  robots: { url: "https://e.com/robots.txt", status: 404, found: false, sitemaps: [], blocksAllForEveryone: false, blocksChangeKiteBot: false },
  sitemap: { checked: [], found: true, urlCount: 1, childSitemaps: 0, sampled: [{ url: "https://e.com/secret", status: 404 }] },
  https: { servesHttps: true, httpRedirectsToHttps: true, hsts: null },
};

const plan = (id: string) => getPlan(CHANGEKITE_CATALOG, id)!;
const free = plan("free");
const withPass = applyPassGrants(free.limits, free.features, [getPass(CHANGEKITE_CATALOG, "report")!]);

describe("free-tier report lock", () => {
  it("catalog: free lists 3 issues; Solo, Agency and the report pass unlock everything", () => {
    expect(issueAllowance(free)).toBe(3);
    expect(hasFullReport(free)).toBe(false);
    for (const p of [plan("solo"), plan("agency")]) expect(hasFullReport(p)).toBe(true);
    expect(hasFullReport(withPass)).toBe(true);
    expect(withPass.limits.pagesPerScan).toBe(250);
    expect(withPass.features.pdfReports).toBe(true);
  });

  it("topIssues picks the most severe first and keeps report order within a severity", () => {
    const top = topIssues(issues, 3);
    expect(top.map((i) => i.page)).toEqual(["https://e.com/b", "https://e.com/d", "https://e.com/f"]);
    expect(topIssues(issues, 0)).toEqual([]);
    expect(topIssues(issues, Number.POSITIVE_INFINITY)).toHaveLength(issues.length);
  });

  it("free: keeps the summary and the top 3, removes every other issue, the page list and sampled sitemap URLs", () => {
    const g = gateReport(report, free);
    expect(g.locked).not.toBeNull();
    expect(g.report.issues).toHaveLength(3);
    expect(g.report.issues.every((i) => i.severity === "critical")).toBe(true);
    // Summary stays intact.
    expect(g.report.score).toBe(40);
    expect(g.report.counts).toEqual(report.counts);
    expect(g.report.checks).toEqual(report.checks);
    expect(g.report.stats.pagesCrawled).toBe(8);
    // Nothing of the withheld issues leaves the server.
    const body = JSON.stringify(g);
    for (const p of ["https://e.com/a", "https://e.com/c", "https://e.com/e", "https://e.com/g", "https://e.com/h", "https://e.com/secret"]) {
      expect(body).not.toContain(p);
    }
    expect(body).not.toContain("fix description-missing");
    expect(g.report.pages).toEqual([]);
    expect(g.locked).toMatchObject({ total: 8, shown: 3, hidden: 5, hiddenBySeverity: { critical: 1, warning: 3, notice: 1 }, pagesHidden: 1 });
    // The stored report object is not mutated.
    expect(report.issues).toHaveLength(8);
  });

  it("full access returns the report unchanged; few issues need no lock", () => {
    for (const ents of [plan("solo"), plan("agency"), withPass]) {
      const g = gateReport(report, ents);
      expect(g.locked).toBeNull();
      expect(g.report).toBe(report);
    }
    const small = { ...report, issues: issues.slice(0, 3) };
    expect(gateReport(small, free).locked).toBeNull();
  });

  it("teaser counts by kind, without URLs", () => {
    const g = gateReport(report, free);
    expect(lockedHeadline(g.locked!, report.startUrl)).toBe("5 more issues found on e.com, including 2 missing meta descriptions.");
    expect(lockedBreakdown(g.locked!)).toBe("2 missing meta descriptions, 1 broken link, 1 page title problem, 1 page with images missing alt text");
    expect(issueKind({ id: "external-link-dns", check: "external-links" })).toBe("broken links");
    expect(issueKind({ id: "external-link-unverified", check: "external-links" })).toBe("unverified external links");
  });
});
