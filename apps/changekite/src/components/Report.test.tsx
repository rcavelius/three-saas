// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Report } from "./Report";
import type { ScanReport } from "@/lib/scanner/types";
import { summarizeChecks } from "@/lib/scanner/score";
import { FREE_LIMITS } from "@/lib/scanner/scan";

afterEach(cleanup);

const issues: ScanReport["issues"] = [
  { id: "internal-link-broken", check: "internal-links", severity: "critical", page: "https://e.com/", message: "Broken internal link (404): https://e.com/x", detail: "Linked from: https://e.com/", howToFix: "Fix the link." },
  { id: "img-alt-missing", check: "images", severity: "warning", page: "https://e.com/", message: "1 image without an alt attribute", howToFix: "Add alt." },
  { id: "x", check: "external-links", severity: "notice", page: "javascript:alert(1)", message: "odd page value", howToFix: "n/a" },
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
  stats: { pagesCrawled: 2, pagesSkippedByRobots: 0, internalUrlsFound: 3, internalUrlsProbed: 1, externalLinksFound: 1, externalLinksChecked: 1, imagesFound: 2, pageCapReached: false, timeBudgetExhausted: false },
  score: 86,
  grade: "fair",
  counts: { critical: 1, warning: 1, notice: 1 },
  checks: summarizeChecks(issues, {}),
  issues,
  pages: [
    { url: "https://e.com/", finalUrl: "https://e.com/", status: 200, depth: 0, title: "Home" },
    { url: "https://e.com/x", finalUrl: "https://e.com/x", status: 404, depth: 1, title: null },
  ],
  robots: { url: "https://e.com/robots.txt", status: 404, found: false, sitemaps: [], blocksAllForEveryone: false, blocksChangeKiteBot: false },
  sitemap: { checked: [], found: false, urlCount: 0, childSitemaps: 0, sampled: [] },
  https: { servesHttps: true, httpRedirectsToHttps: true, hsts: null, tls: { valid: true, issuer: "Test CA", daysRemaining: 50, validTo: "2027-01-01T00:00:00.000Z", address: "1.1.1.1" } },
};

describe("<Report>", () => {
  it("renders the masthead, score, summary table and grouped findings", () => {
    render(<Report report={report} id="abcdefghijklmnopqrstuv" />);
    expect(screen.getByRole("heading", { level: 1, name: "e.com" })).toBeTruthy();
    expect(screen.getByText("86")).toBeTruthy();
    expect(screen.getByText("Ref. abcdefgh")).toBeTruthy();
    const summary = screen.getAllByRole("table")[0]!;
    expect(within(summary).getByRole("rowheader", { name: "Internal links" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Critical\s*\(1\)/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Warnings\s*\(1\)/ })).toBeTruthy();
    expect(screen.getByText("Broken internal link (404): https://e.com/x")).toBeTruthy();
    expect(screen.getByText(/Trusted, issued by Test CA/)).toBeTruthy();
  });

  it("only links http(s) URLs, with safe rel attributes", () => {
    const { container } = render(<Report report={report} />);
    const links = Array.from(container.querySelectorAll("a[target=_blank]"));
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a.getAttribute("href")).toMatch(/^https?:/);
      expect(a.getAttribute("rel")).toContain("noopener");
    }
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
});
